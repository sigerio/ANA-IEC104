mod iec104;
mod points;

use serde::Serialize;
use serialport::{DataBits, FlowControl, Parity, SerialPort, StopBits};
use std::{
    io::{ErrorKind, Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State};

const T0: Duration = Duration::from_secs(30);
const T1: Duration = Duration::from_secs(15);
const T3: Duration = Duration::from_secs(20);
const K: u16 = 12;

type SharedPort = Arc<Mutex<Box<dyn SerialPort>>>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ProtocolState {
    Idle,
    WaitingStart,
    Started,
    WaitingStop,
}

impl ProtocolState {
    fn label(self) -> &'static str {
        match self {
            Self::Idle => "未建立",
            Self::WaitingStart => "建立中（等待 STARTDT CON）",
            Self::Started => "已建立",
            Self::WaitingStop => "停止中（等待 STOPDT CON）",
        }
    }
    fn started(self) -> bool {
        self == Self::Started
    }
}

struct Protocol {
    ns: u16,
    nr: u16,
    expected_rx_ns: u16,
    peer_nr: u16,
    unacknowledged: u16,
    state: ProtocolState,
    deadline: Option<Instant>,
    i_deadline: Option<Instant>,
    last_activity: Instant,
    test_deadline: Option<Instant>,
}

impl Protocol {
    fn new() -> Self {
        Self {
            ns: 0,
            nr: 0,
            expected_rx_ns: 0,
            peer_nr: 0,
            unacknowledged: 0,
            state: ProtocolState::Idle,
            deadline: None,
            i_deadline: None,
            last_activity: Instant::now(),
            test_deadline: None,
        }
    }
    fn idle(&mut self) {
        self.state = ProtocolState::Idle;
        self.deadline = None;
        self.i_deadline = None;
        self.test_deadline = None;
        self.unacknowledged = 0;
        // 会话复位即序号归零:下次 STARTDT 重新从 0 计数。
        self.ns = 0;
        self.nr = 0;
        self.expected_rx_ns = 0;
        self.peer_nr = 0;
        self.last_activity = Instant::now();
    }
    fn stop(&mut self, now: Instant) {
        self.idle();
        self.state = ProtocolState::WaitingStop;
        self.deadline = Some(now + T0);
    }
    fn acknowledge(&mut self, nr: u16) -> Result<(), String> {
        let advanced = (nr + 32_768 - self.peer_nr) % 32_768;
        if advanced > self.unacknowledged {
            return Err(format!(
                "收到无效 N(R)={nr}，当前未确认发送帧数为 {}",
                self.unacknowledged
            ));
        }
        self.peer_nr = nr;
        self.unacknowledged -= advanced;
        if self.unacknowledged == 0 {
            self.i_deadline = None;
        }
        Ok(())
    }

    fn start(&mut self, now: Instant) -> Result<(), String> {
        match self.state {
            ProtocolState::Idle | ProtocolState::WaitingStart => {
                self.state = ProtocolState::WaitingStart;
                self.deadline = Some(now + T0);
                Ok(())
            }
            ProtocolState::Started => Err("IEC104 主从通信已经建立".into()),
            ProtocolState::WaitingStop => Err("正在等待 STOPDT CON".into()),
        }
    }
}

#[derive(Clone)]
struct Connection {
    // 读写分离:reader 线程独占读句柄,writer 只服务写路径,避免读阻塞饿死写。
    reader: Arc<Mutex<Box<dyn SerialPort>>>,
    writer: SharedPort,
    stop: Arc<AtomicBool>,
    protocol: Arc<Mutex<Protocol>>,
    name: String,
    baud_rate: u32,
}

struct AppState {
    connection: Arc<Mutex<Option<Connection>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkStatus {
    serial_connected: bool,
    protocol_state: String,
    started: bool,
    port: Option<String>,
    baud_rate: Option<u32>,
    ns: u16,
    nr: u16,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
struct RawMessage {
    direction: &'static str,
    hex: String,
    timestamp: String,
}

fn timestamp() -> String {
    let s = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        % 86_400;
    format!("{:02}:{:02}:{:02}", s / 3600, (s / 60) % 60, s % 60)
}

fn hex(frame: &[u8]) -> String {
    frame
        .iter()
        .map(|b| format!("{b:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn emit_frame(app: &AppHandle, direction: &'static str, frame: &[u8]) -> iec104::ParsedFrame {
    let _ = app.emit(
        "raw-message",
        RawMessage {
            direction,
            hex: hex(frame),
            timestamp: timestamp(),
        },
    );
    let parsed = iec104::parse(frame);
    let _ = app.emit("parsed-frame", parsed.clone());
    parsed
}

fn emit_status(app: &AppHandle, connection: Option<&Connection>, error: Option<String>) {
    let status = if let Some(connection) = connection {
        let protocol = connection.protocol.lock().unwrap();
        LinkStatus {
            serial_connected: true,
            protocol_state: protocol.state.label().into(),
            started: protocol.state.started(),
            port: Some(connection.name.clone()),
            baud_rate: Some(connection.baud_rate),
            ns: protocol.ns,
            nr: protocol.nr,
            error,
        }
    } else {
        LinkStatus {
            serial_connected: false,
            protocol_state: "未建立".into(),
            started: false,
            port: None,
            baud_rate: None,
            ns: 0,
            nr: 0,
            error,
        }
    };
    let _ = app.emit("link-status", status);
}

fn write_frame(app: &AppHandle, connection: &Connection, frame: &[u8]) -> Result<(), String> {
    {
        let mut port = connection
            .writer
            .lock()
            .map_err(|_| "串口锁异常".to_string())?;
        port.write_all(frame)
            .map_err(|e| format!("串口写入失败：{e}"))?;
        port.flush().map_err(|e| format!("串口发送失败：{e}"))?;
    }
    connection.protocol.lock().unwrap().last_activity = Instant::now();
    emit_frame(app, "TX", frame);
    Ok(())
}

fn physical_failure(
    app: &AppHandle,
    state: &Arc<Mutex<Option<Connection>>>,
    writer: &SharedPort,
    reason: String,
) {
    let connection = {
        let mut current = state.lock().unwrap();
        if current
            .as_ref()
            .is_some_and(|active| Arc::ptr_eq(&active.writer, writer))
        {
            current.take()
        } else {
            None
        }
    };
    if let Some(connection) = connection {
        connection.stop.store(true, Ordering::Relaxed);
        connection.protocol.lock().unwrap().idle();
        emit_status(app, None, Some(reason));
    }
}

fn current_connection(state: &State<'_, AppState>) -> Result<Connection, String> {
    state
        .connection
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "请先连接物理串口".into())
}

fn write_or_disconnect(
    app: &AppHandle,
    state: &Arc<Mutex<Option<Connection>>>,
    connection: &Connection,
    frame: Vec<u8>,
) -> Result<(), String> {
    if let Err(error) = write_frame(app, connection, &frame) {
        physical_failure(app, state, &connection.writer, error.clone());
        return Err(error);
    }
    Ok(())
}

fn protocol_tick(protocol: &mut Protocol, now: Instant) -> (Option<Vec<u8>>, Option<String>) {
    if protocol.deadline.is_some_and(|deadline| now >= deadline) {
        let message = match protocol.state {
            ProtocolState::WaitingStart => {
                "等待 STARTDT CON 超时；串口仍保持打开，可重新建立主从通信"
            }
            ProtocolState::WaitingStop => "等待 STOPDT CON 超时；会话已复位，串口仍保持打开",
            _ => "IEC104 会话定时器超时",
        };
        protocol.idle();
        return (None, Some(message.into()));
    }
    if protocol.i_deadline.is_some_and(|deadline| now >= deadline) {
        protocol.stop(now);
        return (
            Some(iec104::u(0x13)),
            Some("业务帧确认超时；已发送 STOPDT ACT 复位会话".into()),
        );
    }
    if protocol
        .test_deadline
        .is_some_and(|deadline| now >= deadline)
    {
        protocol.stop(now);
        return (
            Some(iec104::u(0x13)),
            Some("TESTFR 链路测试超时；已发送 STOPDT ACT 复位会话".into()),
        );
    }
    if protocol.state.started()
        && protocol.test_deadline.is_none()
        && now.duration_since(protocol.last_activity) >= T3
    {
        protocol.test_deadline = Some(now + T1);
        return (
            Some(iec104::u(0x43)),
            Some("IEC104 链路空闲，已发送 TESTFR ACT".into()),
        );
    }
    (None, None)
}

fn receive_frame(
    app: &AppHandle,
    state: &Arc<Mutex<Option<Connection>>>,
    connection: &Connection,
    parsed: iec104::ParsedFrame,
) -> bool {
    if parsed.error.is_some() && parsed.format != "I" {
        return true;
    }
    let mut reply = None;
    let mut notice = None;
    {
        let mut protocol = connection.protocol.lock().unwrap();
        protocol.last_activity = Instant::now();
        match parsed.format.as_str() {
            "I" => {
                if !protocol.state.started() {
                    notice = Some("收到业务 I 帧，但 IEC104 主从通信尚未建立".into());
                } else if let Some(ns) = parsed.ns {
                    if let Some(nr) = parsed.nr {
                        if let Err(error) = protocol.acknowledge(nr) {
                            protocol.stop(Instant::now());
                            reply = Some(iec104::u(0x13));
                            notice = Some(format!("{error}；已发送 STOPDT ACT 复位会话"));
                        }
                    }
                    if notice.is_none() {
                        if ns != protocol.expected_rx_ns {
                            let expected = protocol.expected_rx_ns;
                            protocol.stop(Instant::now());
                            reply = Some(iec104::u(0x13));
                            notice = Some(format!(
                                "接收序号异常：期望 N(S)={expected}，收到 {ns}；已发送 STOPDT ACT 复位会话"
                            ));
                        } else {
                            protocol.expected_rx_ns = (protocol.expected_rx_ns + 1) % 32_768;
                            protocol.nr = protocol.expected_rx_ns;
                            reply = Some(iec104::s(protocol.nr));
                        }
                    }
                }
            }
            "S" => {
                if let Some(nr) = parsed.nr {
                    if let Err(error) = protocol.acknowledge(nr) {
                        protocol.stop(Instant::now());
                        reply = Some(iec104::u(0x13));
                        notice = Some(format!("{error}；已发送 STOPDT ACT 复位会话"));
                    }
                }
            }
            "U" => match parsed.ti_name.as_str() {
                "STARTDT ACT" => {
                    protocol.state = ProtocolState::Started;
                    protocol.deadline = None;
                    reply = Some(iec104::u(0x0b));
                    notice = Some("对端请求启动数据传输，已确认主从通信".into());
                }
                "STARTDT CON" => {
                    if protocol.state == ProtocolState::WaitingStart {
                        protocol.state = ProtocolState::Started;
                        protocol.deadline = None;
                        notice = Some("收到 STARTDT CON，主从通信已建立".into());
                    }
                }
                "STOPDT ACT" => {
                    protocol.idle();
                    reply = Some(iec104::u(0x23));
                    notice = Some("对端停止数据传输，串口保持打开".into());
                }
                "STOPDT CON" => {
                    protocol.idle();
                    notice = Some("收到 STOPDT CON，主从通信已停止，串口保持打开".into());
                }
                "TESTFR ACT" => reply = Some(iec104::u(0x83)),
                "TESTFR CON" => {
                    protocol.test_deadline = None;
                    notice = Some("TESTFR 链路测试确认正常".into());
                }
                _ => {}
            },
            _ => {}
        }
    }
    if let Some(frame) = reply {
        if write_or_disconnect(app, state, connection, frame).is_err() {
            return false;
        }
    }
    emit_status(app, Some(connection), notice);
    true
}

fn spawn_reader(app: AppHandle, state: Arc<Mutex<Option<Connection>>>, connection: Connection) {
    thread::spawn(move || {
        let mut pending = Vec::new();
        let mut bytes = [0_u8; 512];
        while !connection.stop.load(Ordering::Relaxed) {
            let tick = { protocol_tick(&mut connection.protocol.lock().unwrap(), Instant::now()) };
            if let Some(frame) = tick.0 {
                if write_or_disconnect(&app, &state, &connection, frame).is_err() {
                    return;
                }
            }
            if let Some(message) = tick.1 {
                emit_status(&app, Some(&connection), Some(message));
            }

            // 读独占 reader 句柄,不经过 writer 锁 — 写路径(总召唤/遥控)不再被读阻塞饿死。
            let read = connection.reader.lock().unwrap().read(&mut bytes);
            match read {
                Ok(0) => continue,
                Err(ref error)
                    if error.kind() == ErrorKind::TimedOut
                        || error.kind() == ErrorKind::WouldBlock =>
                {
                    continue
                }
                Ok(count) => {
                    pending.extend_from_slice(&bytes[..count]);
                    // ponytail: 用起始索引避免 remove(0) 的 O(n) 前移;洪泛时再换 VecDeque。
                    let mut start = 0; // 已消费字节数(垃圾 + 完整帧)
                    let mut junk_end = 0; // 仅垃圾字节(非 0x68 / 非法长度)的末尾,完整帧不算
                    loop {
                        let buf = &pending[start..];
                        if buf.is_empty() {
                            break;
                        }
                        if buf[0] != 0x68 {
                            start += 1;
                            junk_end = start;
                            continue;
                        }
                        if buf.len() < 2 {
                            break;
                        }
                        let length = buf[1] as usize;
                        if !(4..=253).contains(&length) {
                            start += 1;
                            junk_end = start;
                            emit_status(&app, Some(&connection), Some("收到非法 APDU 长度".into()));
                            continue;
                        }
                        let total = length + 2;
                        if buf.len() < total {
                            break;
                        }
                        let frame: Vec<u8> = buf[..total].to_vec();
                        start += total;
                        let parsed = emit_frame(&app, "RX", &frame);
                        if !receive_frame(&app, &state, &connection, parsed) {
                            return;
                        }
                    }
                    // 只把真正的垃圾前导字节(未凑成帧、非 0x68)显示为原始 RX;完整帧不重复发。
                    if junk_end > 0 {
                        let _ = app.emit(
                            "raw-message",
                            RawMessage {
                                direction: "RX",
                                hex: hex(&pending[..junk_end]),
                                timestamp: timestamp(),
                            },
                        );
                    }
                    pending.drain(..start);
                }
                Err(error) => {
                    physical_failure(
                        &app,
                        &state,
                        &connection.writer,
                        format!("串口 {} 读取失败：{error}", connection.name),
                    );
                    return;
                }
            }
        }
    });
}

#[tauri::command]
fn list_ports() -> Result<Vec<String>, String> {
    serialport::available_ports()
        .map(|ports| ports.into_iter().map(|port| port.port_name).collect())
        .map_err(|error| format!("读取串口列表失败：{error}"))
}

#[tauri::command]
fn points() -> Vec<points::PointDef> {
    points::all()
}

#[tauri::command]
fn status(state: State<'_, AppState>) -> LinkStatus {
    let connection = state.connection.lock().unwrap().clone();
    if let Some(connection) = connection {
        let protocol = connection.protocol.lock().unwrap();
        LinkStatus {
            serial_connected: true,
            protocol_state: protocol.state.label().into(),
            started: protocol.state.started(),
            port: Some(connection.name),
            baud_rate: Some(connection.baud_rate),
            ns: protocol.ns,
            nr: protocol.nr,
            error: None,
        }
    } else {
        LinkStatus {
            serial_connected: false,
            protocol_state: "未建立".into(),
            started: false,
            port: None,
            baud_rate: None,
            ns: 0,
            nr: 0,
            error: None,
        }
    }
}

#[tauri::command]
fn connect(
    app: AppHandle,
    state: State<'_, AppState>,
    port: String,
    baud_rate: u32,
) -> Result<(), String> {
    if port.trim().is_empty() || baud_rate == 0 {
        return Err("请选择串口并填写有效波特率".into());
    }
    if state.connection.lock().unwrap().is_some() {
        return Err("物理串口已打开，请先关闭串口".into());
    }
    let serial = serialport::new(&port, baud_rate)
        .timeout(Duration::from_millis(50))
        .data_bits(DataBits::Eight)
        .parity(Parity::None)
        .stop_bits(StopBits::One)
        .flow_control(FlowControl::None)
        .open()
        .map_err(|error| format!("打开串口 {port} 失败：{error}"))?;
    let reader = serial
        .try_clone()
        .map_err(|error| format!("复制串口读句柄失败：{error}"))?;
    let connection = Connection {
        reader: Arc::new(Mutex::new(reader)),
        writer: Arc::new(Mutex::new(serial)),
        stop: Arc::new(AtomicBool::new(false)),
        protocol: Arc::new(Mutex::new(Protocol::new())),
        name: port,
        baud_rate,
    };
    *state.connection.lock().unwrap() = Some(connection.clone());
    connection.protocol.lock().unwrap().start(Instant::now())?;
    write_or_disconnect(&app, &state.connection, &connection, iec104::u(0x07))?;
    emit_status(
        &app,
        Some(&connection),
        Some("物理串口已打开，已发送 STARTDT ACT，等待对端确认".into()),
    );
    spawn_reader(app, state.connection.clone(), connection);
    Ok(())
}

#[tauri::command]
fn disconnect(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let connection = state
        .connection
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| "物理串口尚未打开".to_string())?;
    connection.stop.store(true, Ordering::Relaxed);
    connection.protocol.lock().unwrap().idle();
    emit_status(
        &app,
        None,
        Some("物理串口已关闭，IEC104 主从通信已复位".into()),
    );
    Ok(())
}

#[tauri::command]
fn start(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let connection = current_connection(&state)?;
    connection.protocol.lock().unwrap().start(Instant::now())?;
    write_or_disconnect(&app, &state.connection, &connection, iec104::u(0x07))?;
    emit_status(
        &app,
        Some(&connection),
        Some("已发送或重发 STARTDT ACT，等待对端确认".into()),
    );
    Ok(())
}

#[tauri::command]
fn stop(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let connection = current_connection(&state)?;
    {
        let mut protocol = connection.protocol.lock().unwrap();
        if protocol.state != ProtocolState::Started {
            return Err("IEC104 主从通信尚未建立".into());
        }
        protocol.stop(Instant::now());
    }
    write_or_disconnect(&app, &state.connection, &connection, iec104::u(0x13))?;
    emit_status(
        &app,
        Some(&connection),
        Some("已发送 STOPDT ACT，等待对端确认".into()),
    );
    Ok(())
}

fn send_i(app: &AppHandle, state: &State<'_, AppState>, asdu: Vec<u8>) -> Result<(), String> {
    let connection = current_connection(state)?;
    let result: Result<(), String> = (|| {
        let mut port = connection
            .writer
            .lock()
            .map_err(|_| "串口锁异常".to_string())?;
        let mut protocol = connection.protocol.lock().unwrap();
        if !protocol.state.started() {
            return Err("请先建立 IEC104 主从通信".into());
        }
        if protocol.unacknowledged >= K {
            return Err("未确认业务帧已达 k=12，请等待对端确认".into());
        }
        let frame = iec104::i(protocol.ns, protocol.nr, asdu);
        protocol.ns = (protocol.ns + 1) % 32_768;
        protocol.unacknowledged += 1;
        if protocol.unacknowledged == 1 {
            protocol.i_deadline = Some(Instant::now() + T1);
        }
        port.write_all(&frame)
            .map_err(|e| format!("串口写入失败：{e}"))?;
        port.flush().map_err(|e| format!("串口发送失败：{e}"))?;
        protocol.last_activity = Instant::now();
        emit_frame(app, "TX", &frame);
        Ok(())
    })();
    if let Err(error) = result {
        physical_failure(app, &state.connection, &connection.writer, error.clone());
        return Err(error);
    }
    emit_status(app, Some(&connection), None);
    Ok(())
}

#[tauri::command]
fn general_interrogation(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    send_i(&app, &state, iec104::asdu(0x64, 0, vec![0x14]))
}

fn control_ioa_is_valid(ioa: u32) -> bool {
    matches!(ioa, 0x200 | 0x201 | 0x210 | 0x211 | 0x220 | 0x221 | 0x222 | 0x223)
}

#[tauri::command]
fn control(
    app: AppHandle,
    state: State<'_, AppState>,
    ioa: u32,
    select: bool,
) -> Result<(), String> {
    if !control_ioa_is_valid(ioa) {
        return Err("不支持的遥控点".into());
    }
    send_i(
        &app,
        &state,
        iec104::asdu(0x2d, ioa, vec![if select { 0x81 } else { 0x01 }]),
    )
}

#[tauri::command]
fn adjust(
    app: AppHandle,
    state: State<'_, AppState>,
    ioa: u32,
    value: f32,
    preset: bool,
    cancel: bool,
) -> Result<(), String> {
    if adjust_value_is_invalid(ioa, value, preset, cancel) {
        return Err(
            "遥调参数无效：普通参数须在 -3276.8 到 3276.7；模式控制须为 0 到 32767 的整数；预置与取消不可同时选择"
                .into(),
        );
    }
    let pi = (preset as u8) | ((cancel as u8) << 1);
    let mut data = vec![pi];
    if ioa == 0x300c {
        data.extend_from_slice(&(value as u16).to_le_bytes());
    } else {
        data.extend_from_slice(&value.to_le_bytes());
    }
    send_i(&app, &state, iec104::asdu(0xca, ioa, data))
}

fn adjust_value_is_invalid(ioa: u32, value: f32, preset: bool, cancel: bool) -> bool {
    !value.is_finite()
        || (preset && cancel)
        || (ioa == 0x300c && (value < 0.0 || value > i16::MAX as f32 || value.fract() != 0.0))
        || (ioa != 0x300c && !(-3276.8..=3276.7).contains(&value))
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            connection: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            list_ports,
            points,
            status,
            connect,
            disconnect,
            start,
            stop,
            general_interrogation,
            control,
            adjust
        ])
        .run(tauri::generate_context!())
        .expect("运行 ANA IEC104 失败");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_timeouts_send_stopdt_before_resetting() {
        let now = Instant::now();
        let mut protocol = Protocol::new();
        protocol.state = ProtocolState::WaitingStart;
        protocol.deadline = Some(now - Duration::from_secs(1));
        assert!(protocol_tick(&mut protocol, now)
            .1
            .unwrap()
            .contains("STARTDT CON"));
        assert_eq!(protocol.state, ProtocolState::Idle);

        protocol.state = ProtocolState::Started;
        protocol.i_deadline = Some(now - Duration::from_secs(1));
        assert_eq!(protocol_tick(&mut protocol, now).0, Some(iec104::u(0x13)));
        assert_eq!(protocol.state, ProtocolState::WaitingStop);

        protocol = Protocol::new();
        protocol.state = ProtocolState::Started;
        protocol.last_activity = now - T3;
        assert_eq!(protocol_tick(&mut protocol, now).0, Some(iec104::u(0x43)));
        assert_eq!(protocol.state, ProtocolState::Started);
    }

    #[test]
    fn stop_resets_all_sequences_before_sending_stopdt() {
        let now = Instant::now();
        let mut protocol = Protocol::new();
        protocol.state = ProtocolState::Started;
        protocol.ns = 4;
        protocol.nr = 3;
        protocol.expected_rx_ns = 3;
        protocol.peer_nr = 2;
        protocol.unacknowledged = 2;

        protocol.stop(now);

        assert_eq!(protocol.state, ProtocolState::WaitingStop);
        assert_eq!(protocol.ns, 0);
        assert_eq!(protocol.nr, 0);
        assert_eq!(protocol.expected_rx_ns, 0);
        assert_eq!(protocol.peer_nr, 0);
        assert_eq!(protocol.unacknowledged, 0);
    }

    #[test]
    fn rejects_invalid_adjust_values() {
        assert!(adjust_value_is_invalid(0x300c, 1.5, true, false));
        assert!(adjust_value_is_invalid(0x300c, -1.0, true, false));
        assert!(adjust_value_is_invalid(0x300c, 32768.0, true, false));
        assert!(adjust_value_is_invalid(0x3000, 3276.8, true, false));
        assert!(adjust_value_is_invalid(0x300c, 1.0, true, true));
        assert!(!adjust_value_is_invalid(0x300c, 1.0, true, false));
        assert!(!adjust_value_is_invalid(0x3000, -3276.8, true, false));
    }

    #[test]
    fn accepts_only_configured_control_points() {
        assert!(control_ioa_is_valid(0x220));
        assert!(control_ioa_is_valid(0x221));
        assert!(control_ioa_is_valid(0x222));
        assert!(!control_ioa_is_valid(0x224));
    }

    #[test]
    fn start_can_be_retried_while_waiting_for_confirmation() {
        let now = Instant::now();
        let mut protocol = Protocol::new();
        assert!(protocol.start(now).is_ok());
        assert_eq!(protocol.state, ProtocolState::WaitingStart);
        assert!(protocol.start(now + Duration::from_secs(1)).is_ok());
        assert_eq!(protocol.deadline, Some(now + Duration::from_secs(31)));
    }
}
