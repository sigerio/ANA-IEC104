import type { Link } from "../hooks";

export function ConnectionBar({ link }: { link: Link }) {
  const {
    ports,
    port,
    setPort,
    baudRate,
    setBaudRate,
    status,
    refreshPorts,
    run,
    ready,
    busy,
    pending,
  } = link;
  const disabled = !ready || busy;
  return (
    <>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M5 22 12 8l7 14M8 17h8M21 8h6M24 8v14M21 22h6" />
            </svg>
          </span>
          <div>
            ANA <strong>IEC104</strong>
            <small>设备监控与通信工作台</small>
          </div>
        </div>
        <div className="header-meta">
          <span className="protocol-tag">SERIAL MASTER</span>
          <span className={`status ${status.serialConnected ? "ok" : ""}`}>
            <i />
            串口{status.serialConnected ? "已打开" : "未连接"}
          </span>
          <span
            className={`status ${status.started ? "ok" : status.serialConnected ? "waiting" : ""}`}
          >
            <i />
            {status.started
              ? "IEC104 已建立"
              : status.serialConnected
                ? status.protocolState
                : "IEC104 未建立"}
          </span>
        </div>
      </header>
      <section className="connection" aria-label="串口连接和会话操作">
        <div className="connection-fields">
          <label className="inline-label" htmlFor="serial-port">
            串口
          </label>
          <select
            id="serial-port"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            disabled={disabled || status.serialConnected}
          >
            <option value="">{ports.length ? "选择端口" : "未发现串口"}</option>
            {ports.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="刷新串口列表"
            title="刷新串口列表"
            onClick={refreshPorts}
            disabled={disabled || status.serialConnected}
          >
            ↻
          </button>
          <label className="inline-label" htmlFor="baud-rate">
            波特率
          </label>
          <select
            id="baud-rate"
            value={baudRate}
            title="须与设备固件一致；连接期间不可修改"
            disabled={disabled || status.serialConnected}
            onChange={(e) => setBaudRate(Number(e.target.value))}
          >
            {[
              ...new Set([
                1200,
                2400,
                4800,
                9600,
                19200,
                38400,
                57600,
                115200,
                230400,
                460800,
                921600,
                1000000,
                1500000,
                2000000,
                baudRate,
              ]),
            ]
              .sort((a, b) => a - b)
              .map((rate) => (
                <option key={rate} value={rate}>
                  {rate} bps
                </option>
              ))}
          </select>
          {status.serialConnected ? (
            <button
              className="danger subtle"
              disabled={disabled}
              onClick={() => run("disconnect")}
            >
              断开串口
            </button>
          ) : (
            <button
              className="primary"
              disabled={
                disabled ||
                !port ||
                !Number.isInteger(baudRate) ||
                baudRate < 1 ||
                baudRate > 4294967295
              }
              onClick={() => run("connect", { port, baudRate })}
            >
              {busy ? "处理中…" : "连接串口"}
            </button>
          )}
        </div>
        <div className="connection-actions">
          <span className="connection-hint">
            CA 01 <span>·</span> 8N1
          </span>
          <button
            disabled={
              disabled ||
              !status.serialConnected ||
              status.started ||
              status.protocolState.startsWith("停止中")
            }
            onClick={() => run("start")}
          >
            重新握手
          </button>
          <button
            disabled={disabled || !status.started}
            onClick={() => run("stop")}
          >
            停止会话
          </button>
          <button
            className="primary"
            disabled={disabled || !status.started || !!pending}
            onClick={() => run("general_interrogation")}
          >
            {pending?.action === "总召" ? "总召中…" : "站总召唤"}
          </button>
        </div>
      </section>
    </>
  );
}
