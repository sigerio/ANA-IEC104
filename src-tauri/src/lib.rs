mod iec104;
mod points;
mod tis;

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
    tis_level: Option<i32>,
    tis_voltage: Option<i32>,
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
            tis_level: None,
            tis_voltage: None,
        }
    }
    fn idle(&mut self) {
        self.state = ProtocolState::Idle;
        self.deadline = None;
        self.i_deadline = None;
        self.test_deadline = None;
        self.tis_level = None;
        self.tis_voltage = None;
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

    fn prepare_i(&self, asdu: Vec<u8>) -> Result<Vec<u8>, String> {
        if !self.state.started() {
            return Err("请先建立 IEC104 主从通信".into());
        }
        if self.unacknowledged >= K {
            return Err("未确认业务帧已达 k=12，请等待对端确认".into());
        }
        Ok(iec104::i(self.ns, self.nr, asdu))
    }

    fn accept_i(&mut self, ns: u16, nr: u16) -> Result<(), String> {
        self.acknowledge(nr)?;
        if ns != self.expected_rx_ns {
            return Err(format!(
                "接收序号异常：期望 N(S)={}，收到 {ns}",
                self.expected_rx_ns
            ));
        }
        self.expected_rx_ns = (self.expected_rx_ns + 1) % 32_768;
        self.nr = self.expected_rx_ns;
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
    reader_thread: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
}

struct AppState {
    connection_operation: Mutex<()>,
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

#[derive(Clone, Serialize)]
struct FrameEvent<'a> {
    #[serde(flatten)]
    frame: &'a iec104::ParsedFrame,
    direction: &'static str,
    accepted: bool,
}

fn emit_parsed(
    app: &AppHandle,
    frame: &iec104::ParsedFrame,
    direction: &'static str,
    accepted: bool,
) {
    let _ = app.emit(
        "parsed-frame",
        FrameEvent {
            frame,
            direction,
            accepted,
        },
    );
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
    if direction == "TX" {
        emit_parsed(app, &parsed, direction, false);
    }
    parsed
}

fn emit_status(app: &AppHandle, connection: Option<&Connection>, error: Option<String>) {
    if connection.is_some_and(|c| c.stop.load(Ordering::Relaxed)) {
        return;
    }
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
    mut parsed: iec104::ParsedFrame,
) -> bool {
    let mut accepted = false;
    if parsed.error.is_some() && parsed.format != "I" {
        emit_parsed(app, &parsed, "RX", false);
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
                } else if let (Some(ns), Some(nr)) = (parsed.ns, parsed.nr) {
                    match protocol.accept_i(ns, nr) {
                        Ok(()) => {
                            reply = Some(iec104::s(protocol.nr));
                            if parsed.ca != Some(1) || parsed.oa != Some(0) {
                                parsed.error = Some("ASDU 公共地址或源发地址不匹配".into());
                            }
                            accepted = parsed.error.is_none();
                            if accepted && matches!(parsed.cot, Some(3 | 20)) {
                                if parsed.ti == Some(13) {
                                    for obj in &parsed.objects {
                                        let value = obj
                                            .value
                                            .parse::<f32>()
                                            .ok()
                                            .filter(|v| {
                                                v.is_finite()
                                                    && v.fract() == 0.0
                                                    && obj.quality == "正常"
                                            })
                                            .map(|v| v as i32);
                                        match obj.ioa {
                                            0x19006 => protocol.tis_level = value,
                                            0x1311d => protocol.tis_voltage = value,
                                            _ => {}
                                        }
                                    }
                                }
                                if parsed.ti == Some(1)
                                    && parsed.objects.iter().any(|o| {
                                        o.ioa == 0x1100f && (o.value != "ON" || o.quality != "正常")
                                    })
                                {
                                    protocol.tis_level = None;
                                    protocol.tis_voltage = None;
                                }
                            }
                        }
                        Err(error) => {
                            protocol.stop(Instant::now());
                            reply = Some(iec104::u(0x13));
                            notice = Some(format!("{error}；已发送 STOPDT ACT 复位会话"));
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
    emit_parsed(app, &parsed, "RX", accepted);
    emit_status(app, Some(connection), notice);
    true
}

fn spawn_reader(
    app: AppHandle,
    state: Arc<Mutex<Option<Connection>>>,
    connection: Connection,
) -> thread::JoinHandle<()> {
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
            if connection.stop.load(Ordering::Relaxed) {
                break;
            }
            match read {
                Ok(0) => continue,
                Err(ref error)
                    if error.kind() == ErrorKind::TimedOut
                        || error.kind() == ErrorKind::WouldBlock =>
                {
                    continue
                }
                Ok(count) => {
                    let _ = app.emit(
                        "raw-message",
                        RawMessage {
                            direction: "RX",
                            hex: hex(&bytes[..count]),
                            timestamp: timestamp(),
                        },
                    );
                    pending.extend_from_slice(&bytes[..count]);
                    // ponytail: 用起始索引避免 remove(0) 的 O(n) 前移;洪泛时再换 VecDeque。
                    let mut start = 0; // 已消费字节数(垃圾 + 完整帧)
                    loop {
                        let buf = &pending[start..];
                        if buf.is_empty() {
                            break;
                        }
                        if buf[0] != 0x68 {
                            start += 1;
                            continue;
                        }
                        if buf.len() < 2 {
                            break;
                        }
                        let length = buf[1] as usize;
                        if !(4..=253).contains(&length) {
                            start += 1;
                            emit_status(&app, Some(&connection), Some("收到非法 APDU 长度".into()));
                            continue;
                        }
                        let total = length + 2;
                        if buf.len() < total {
                            break;
                        }
                        let frame: Vec<u8> = buf[..total].to_vec();
                        start += total;
                        let parsed = iec104::parse(&frame);
                        if !receive_frame(&app, &state, &connection, parsed) {
                            return;
                        }
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
    })
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
    let _operation = state.connection_operation.lock().unwrap();
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
        reader_thread: Arc::new(Mutex::new(None)),
    };
    *state.connection.lock().unwrap() = Some(connection.clone());
    connection.protocol.lock().unwrap().start(Instant::now())?;
    write_or_disconnect(&app, &state.connection, &connection, iec104::u(0x07))?;
    emit_status(
        &app,
        Some(&connection),
        Some("物理串口已打开，已发送 STARTDT ACT，等待对端确认".into()),
    );
    *connection.reader_thread.lock().unwrap() = Some(spawn_reader(
        app,
        state.connection.clone(),
        connection.clone(),
    ));
    Ok(())
}

#[tauri::command]
fn disconnect(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let _operation = state.connection_operation.lock().unwrap();
    let connection = state
        .connection
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| "物理串口尚未打开".to_string())?;
    connection.stop.store(true, Ordering::Relaxed);
    if let Some(reader) = connection.reader_thread.lock().unwrap().take() {
        let _ = reader.join();
    }
    connection.protocol.lock().unwrap().idle();
    drop(connection);
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
    let (frame, result) = {
        let mut port = connection
            .writer
            .lock()
            .map_err(|_| "串口锁异常".to_string())?;
        let mut protocol = connection.protocol.lock().unwrap();
        // 业务拒绝直接返回，只有实际 I/O 失败才关闭物理串口。
        let frame = protocol.prepare_i(asdu)?;
        let result = port.write_all(&frame).and_then(|()| port.flush());
        if result.is_ok() {
            protocol.ns = (protocol.ns + 1) % 32_768;
            protocol.unacknowledged += 1;
            if protocol.unacknowledged == 1 {
                protocol.i_deadline = Some(Instant::now() + T1);
            }
            protocol.last_activity = Instant::now();
        }
        (frame, result)
    };
    if let Err(error) = result {
        let error = format!("串口发送失败：{error}");
        physical_failure(app, &state.connection, &connection.writer, error.clone());
        return Err(error);
    }
    emit_frame(app, "TX", &frame);
    emit_status(app, Some(&connection), None);
    Ok(())
}

#[tauri::command]
fn general_interrogation(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    send_i(&app, &state, iec104::asdu(0x64, 0, vec![0x14]))
}

fn control_ioa_is_valid(ioa: u32) -> bool {
    points::all()
        .iter()
        .any(|p| p.ioa == ioa && p.kind == "遥控")
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
            "遥调参数无效：请检查该点允许范围与步进；模式为 0–3，传感器校正为 -10～10 / 0.01；预置与取消不可同时选择"
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

#[tauri::command]
fn adjust_tis(
    app: AppHandle,
    state: State<'_, AppState>,
    items: Vec<tis::Setting>,
    pi: u8,
) -> Result<(), String> {
    let connection = current_connection(&state)?;
    let level = {
        let protocol = connection.protocol.lock().unwrap();
        protocol
            .tis_level
            .filter(|n| (1..=4).contains(n))
            .or_else(|| {
                protocol
                    .tis_voltage
                    .filter(|v| matches!(v, 12 | 24 | 36 | 48))
                    .map(|v| v / 12)
            })
    };
    send_i(&app, &state, tis::build(&items, pi, level)?)
}

fn adjust_value_is_invalid(ioa: u32, value: f32, preset: bool, cancel: bool) -> bool {
    if !value.is_finite() || !(0x3000..=0x3010).contains(&ioa) || (preset && cancel) {
        return true;
    }
    if ioa == 0x300c {
        return !(0.0..=3.0).contains(&value) || value.fract() != 0.0;
    }
    if ioa >= 0x300d {
        return !(-10.0..=10.0).contains(&value)
            || ((value * 100.0).round() - value * 100.0).abs() > 0.001;
    }
    if ioa == 0x300b {
        return !(-3276.0..=3276.0).contains(&value) || value.fract() != 0.0;
    }
    let (min, max) = match ioa {
        0x3000 => (20.0, 55.0),
        0x3001 => (15.0, 35.0),
        0x3002 => (-30.0, 15.0),
        0x3003 => (0.0, 23.0),
        0x3004 => (30.0, 60.0),
        0x3005 => (-10.0, 10.0),
        _ => (-3276.8, 3276.7),
    };
    !(min..=max).contains(&value) || ((value * 10.0).round() - value * 10.0).abs() > 0.001
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            connection_operation: Mutex::new(()),
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
            adjust_tis,
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
        assert!(adjust_value_is_invalid(0x300c, 4.0, true, false));
        assert!(adjust_value_is_invalid(0x3000, 3276.8, true, false));
        assert!(adjust_value_is_invalid(0x300d, 10.01, true, false));
        assert!(adjust_value_is_invalid(0x300d, 1.234, true, false));
        assert!(adjust_value_is_invalid(0x3011, 1.0, true, false));
        assert!(adjust_value_is_invalid(0x300c, 1.0, true, true));
        assert!(!adjust_value_is_invalid(0x300c, 1.0, true, false));
        assert!(!adjust_value_is_invalid(0x3006, -3276.8, true, false));
        assert!(adjust_value_is_invalid(0x3000, 19.9, true, false));
        assert!(!adjust_value_is_invalid(0x3000, 20.0, true, false));
        assert!(adjust_value_is_invalid(0x300b, 1.5, true, false));
        assert!(adjust_value_is_invalid(0x3006, 1.25, true, false));
        assert!(!adjust_value_is_invalid(0x300d, -10.0, true, false));
        assert!(!adjust_value_is_invalid(0x3010, 1.25, true, false));
    }

    #[test]
    fn accepts_only_configured_control_points() {
        assert!(control_ioa_is_valid(0x220));
        assert!(control_ioa_is_valid(0x221));
        assert!(control_ioa_is_valid(0x222));
        assert!(control_ioa_is_valid(0x224));
        assert!(control_ioa_is_valid(0x225));
        for ioa in [0x230, 0x232, 0x238, 0x300, 0x307, 0x30e, 0x313] {
            assert!(control_ioa_is_valid(ioa));
        }
        for ioa in [0x239, 0x302, 0x308, 0x314] {
            assert!(!control_ioa_is_valid(ioa));
        }
        assert!(!control_ioa_is_valid(0x226));
        assert!(!control_ioa_is_valid(0x16));
    }

    #[test]
    fn business_rejection_preserves_session_and_sequence() {
        let mut protocol = Protocol::new();
        assert!(protocol.prepare_i(vec![]).is_err());
        protocol.state = ProtocolState::Started;
        protocol.unacknowledged = K;
        protocol.ns = K;
        assert!(protocol.prepare_i(vec![]).is_err());
        assert_eq!(protocol.state, ProtocolState::Started);
        assert_eq!(protocol.ns, K);
        assert_eq!(protocol.unacknowledged, K);
        protocol.acknowledge(1).unwrap();
        assert!(protocol
            .prepare_i(iec104::asdu(0x64, 0, vec![0x14]))
            .is_ok());
    }

    #[test]
    fn received_sequence_must_be_contiguous_and_can_wrap() {
        let mut protocol = Protocol::new();
        assert!(protocol.accept_i(1, 0).is_err());
        assert_eq!(protocol.nr, 0);
        assert!(protocol.accept_i(0, 0).is_ok());
        assert!(protocol.accept_i(0, 0).is_err());
        protocol.expected_rx_ns = 32767;
        assert!(protocol.accept_i(32767, 0).is_ok());
        assert_eq!(protocol.nr, 0);
    }

    #[test]
    fn acknowledgement_wrap_and_handshake_timeout_allow_recovery() {
        let mut protocol = Protocol::new();
        protocol.peer_nr = 32767;
        protocol.ns = 1;
        protocol.unacknowledged = 2;
        assert!(protocol.acknowledge(2).is_err());
        assert_eq!(protocol.unacknowledged, 2);
        protocol.acknowledge(0).unwrap();
        assert_eq!(protocol.unacknowledged, 1);
        protocol.acknowledge(1).unwrap();
        assert_eq!(protocol.unacknowledged, 0);

        let now = Instant::now();
        protocol.start(now).unwrap();
        assert!(protocol_tick(&mut protocol, now + T0).1.is_some());
        assert_eq!(protocol.state, ProtocolState::Idle);
        protocol.start(now + T0).unwrap();
        assert_eq!(protocol.state, ProtocolState::WaitingStart);
        assert_eq!(protocol.ns, 0);
        assert_eq!(protocol.nr, 0);
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
