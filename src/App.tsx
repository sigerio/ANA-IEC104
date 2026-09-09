import { useRef, useState } from "react";
import { ConnectionBar } from "./components/ConnectionBar";
import { ControlPanel } from "./components/ControlPanel";
import { Logs } from "./components/Logs";
import { Overview } from "./components/Overview";
import { Splitter } from "./components/Splitter";
import { TelemetryTable } from "./components/TelemetryTable";
import { useLink } from "./hooks";

export default function App() {
  const link = useLink();
  const workspace = useRef<HTMLDivElement>(null);
  const dashboard = useRef<HTMLElement>(null);
  const [rowSplit, setRowSplit] = useState(65);
  const [dashboardSplit, setDashboardSplit] = useState(65);
  const [logsOpen, setLogsOpen] = useState(false);
  return (
    <main className={logsOpen ? "debug-layout" : ""}>
      <ConnectionBar link={link} />
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERATIONS OVERVIEW</span>
          <h1>设备运行总览</h1>
        </div>
        <div className="heading-note">
          <span className={`dot ${link.status.started ? "live" : ""}`} />
          {link.status.started ? "会话运行中" : "等待设备连接"}
          <span className="divider">/</span>最近接收{" "}
          <b>{link.traffic.lastRx}</b>
        </div>
      </div>
      <Overview link={link} />
      <div
        className={`notice ${link.error ? "has-error" : ""}`}
        role={link.error ? "alert" : "status"}
      >
        <span className="notice-label">
          {link.error ? "需要关注" : link.pending ? "处理中" : "通信提示"}
        </span>
        <span className="notice-message">{link.error || link.notice}</span>
        {link.error && (
          <>
            <button className="quiet" onClick={() => setLogsOpen(true)}>
              查看通信记录
            </button>
            <button
              className="icon-button"
              aria-label="关闭错误提示"
              onClick={() => link.setError("")}
            >
              ×
            </button>
          </>
        )}
      </div>
      <div
        className={`workspace ${logsOpen ? "with-logs" : ""}`}
        ref={workspace}
        style={{
          gridTemplateRows: logsOpen
            ? `minmax(200px, ${rowSplit}fr) 8px minmax(160px, ${100 - rowSplit}fr)`
            : "minmax(0, 1fr)",
        }}
      >
        <section
          className="dashboard"
          ref={dashboard}
          style={{
            gridTemplateColumns: `minmax(0, ${dashboardSplit}fr) 8px minmax(340px, ${100 - dashboardSplit}fr)`,
          }}
        >
          <TelemetryTable link={link} />
          <Splitter
            container={dashboard}
            orientation="vertical"
            value={dashboardSplit}
            min={40}
            max={72}
            initial={65}
            label="调整监控与控制区域宽度"
            onChange={setDashboardSplit}
          />
          <ControlPanel link={link} />
        </section>
        {logsOpen && (
          <>
            <Splitter
              container={workspace}
              orientation="horizontal"
              value={rowSplit}
              min={30}
              max={75}
              initial={65}
              label="调整监控与日志区域高度"
              onChange={setRowSplit}
            />
            <Logs link={link} />
          </>
        )}
      </div>
      <footer className="status-bar">
        <button
          className={logsOpen ? "active" : ""}
          aria-expanded={logsOpen}
          onClick={() => setLogsOpen(!logsOpen)}
        >
          <span className="terminal-symbol">⌘</span>通信调试{" "}
          <span>{logsOpen ? "⌄" : "⌃"}</span>
        </button>
        <span className="traffic">
          <b className="rx">RX</b> {link.traffic.rx}
          <b className="tx">TX</b> {link.traffic.tx}
        </span>
        <span className="footer-right">
          N(S) <b>{link.status.ns}</b>
          <span>·</span>N(R) <b>{link.status.nr}</b>
          <span className="footer-protocol">IEC 60870-5-104 / SERIAL</span>
        </span>
      </footer>
    </main>
  );
}
