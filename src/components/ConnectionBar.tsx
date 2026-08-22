import type { Link } from "../hooks";

export function ConnectionBar({ link }: { link: Link }) {
  const { ports, port, setPort, baudRate, setBaudRate, status, refreshPorts, run } = link;
  return (
    <>
      <header>
        <div className="brand">
          ◈ ANA IEC104 <small>串口主站</small>
        </div>
        <div className="status-pairs">
          <span className={status.serialConnected ? "status ok" : "status"}>
            <i />串口：{status.serialConnected ? `已打开 ${status.port || ""}` : "未连接"}
          </span>
          <span className={status.started ? "status ok" : "status"}>
            <i />主从通信：{status.protocolState}
          </span>
        </div>
      </header>
      <section className="connection">
        <div className="connection-group">
          <b>物理串口</b>
          <div>
            <label>串口</label>
            <div className="port">
              <select value={port} onChange={(e) => setPort(e.target.value)} disabled={status.serialConnected}>
                <option value="">选择 COM 端口</option>
                {ports.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <button onClick={refreshPorts} disabled={status.serialConnected}>
                刷新
              </button>
            </div>
          </div>
          <div>
            <label>波特率</label>
            <input
              className="baud-rate"
              type="number"
              min="1"
              value={baudRate}
              disabled={status.serialConnected}
              onChange={(e) => setBaudRate(Number(e.target.value))}
            />
          </div>
          <div className="fixed">
            <label>固定参数</label>
            <strong>8N1 / 无校验 / 无流控</strong>
          </div>
          {status.serialConnected ? (
            <button className="danger" onClick={() => run("disconnect")}>
              关闭串口
            </button>
          ) : (
            <button disabled={!port || baudRate < 1} onClick={() => run("connect", { port, baudRate })}>
              连接串口
            </button>
          )}
        </div>
        <div className="connection-group session-group">
          <b>IEC104 主从会话</b>
          <span className="session-help">仅在物理串口已打开后操作；会话异常不会关闭串口。</span>
          <div className="actions">
            <button
              disabled={!status.serialConnected || status.started || status.protocolState === "停止中（等待 STOPDT CON）"}
              onClick={() => run("start")}
            >
              发送握手
            </button>
            <button disabled={!status.started} onClick={() => run("general_interrogation")}>
              总召唤
            </button>
            <button className="danger" disabled={!status.started} onClick={() => run("stop")}>
              停止主从通信
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
