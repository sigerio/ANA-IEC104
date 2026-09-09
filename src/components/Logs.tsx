import { useRef, useState } from "react";
import { displayValue, showIoa } from "../format";
import type { Link } from "../hooks";
import { Splitter } from "./Splitter";

export function Logs({ link }: { link: Link }) {
  const { raw, frames, status, clearLogs } = link;
  const container = useRef<HTMLElement>(null);
  const [split, setSplit] = useState(50);
  const [direction, setDirection] = useState("全部");
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState({ raw, frames });
  const current = paused ? snapshot : { raw, frames };
  const messages = current.raw.filter(
    (r) => direction === "全部" || r.direction === direction,
  );
  const decoded = current.frames.filter(
    (f) => direction === "全部" || f.direction === direction,
  );
  const exportLog = () => {
    const content = current.raw
      .slice()
      .reverse()
      .map((r) => `${r.timestamp} ${r.direction} ${r.hex}`)
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `IEC104-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="log-workspace">
      <div className="log-toolbar">
        <div className="tabs" aria-label="报文方向">
          {["全部", "RX", "TX"].map((item) => (
            <button
              key={item}
              aria-pressed={direction === item}
              className={direction === item ? "active" : ""}
              onClick={() => setDirection(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span>
          {paused
            ? "显示已暂停，后台继续接收"
            : "最新记录在前 · 保留 500 条原始记录 / 200 帧解析"}
        </span>
        <button
          onClick={() => {
            if (!paused) setSnapshot({ raw, frames });
            setPaused(!paused);
          }}
        >
          {paused ? "恢复显示" : "暂停显示"}
        </button>
        <button disabled={!current.raw.length} onClick={exportLog}>
          导出日志
        </button>
        <button
          className="quiet"
          onClick={() => {
            clearLogs();
            setSnapshot({ raw: [], frames: [] });
          }}
        >
          清空
        </button>
      </div>
      <section
        className="bottom"
        ref={container}
        style={{
          gridTemplateColumns: `minmax(0, ${split}fr) 8px minmax(0, ${100 - split}fr)`,
        }}
      >
        <article className="panel">
          <div className="title">
            <h3>原始通信数据</h3>
            <span>{messages.length} 条 · 串口字节流</span>
          </div>
          <div className="log">
            {messages.length ? (
              messages.map((r, i) => (
                <div className={r.direction.toLowerCase()} key={i}>
                  <time>{r.timestamp}</time>
                  <strong>{r.direction}</strong>
                  <code>{r.hex}</code>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <strong>等待通信数据</strong>
                <p>
                  {status.serialConnected
                    ? "正在监听串口，半帧和非协议字节也会显示。"
                    : "连接串口后，收发记录会显示在这里。"}
                </p>
              </div>
            )}
          </div>
        </article>
        <Splitter
          container={container}
          orientation="vertical"
          value={split}
          initial={50}
          label="调整原始消息与协议解析区域宽度"
          onChange={setSplit}
        />
        <article className="panel">
          <div className="title">
            <h3>协议解析</h3>
            <span>{decoded.length} 帧 · APCI / ASDU</span>
          </div>
          <div className="decoded">
            {decoded.length ? (
              decoded.map((f, i) => (
                <div className="frame" key={i}>
                  <div className="frame-title">
                    <b className={f.direction.toLowerCase()}>{f.direction}</b>
                    <strong>{f.format} 帧</strong>
                    <span>{f.ti_name}</span>
                    <span>{f.cot_name}</span>
                  </div>
                  <small>
                    {f.ns !== null ? `N(S) ${f.ns}  ` : ""}
                    {f.nr !== null ? `N(R) ${f.nr}` : ""}
                    {f.direction === "RX" && f.format === "I" && !f.accepted
                      ? " · 未采纳业务数据"
                      : ""}
                  </small>
                  {f.error ? (
                    <p className="alarm-text">{f.error}</p>
                  ) : (
                    f.objects.length > 0 && (
                      <details>
                        <summary>{f.objects.length} 个信息对象</summary>
                        {f.objects.map((o, j) => (
                          <p key={j}>
                            <span>{showIoa(o.ioa)}</span>{" "}
                            {displayValue(o.value)} <small>{o.quality}</small>
                          </p>
                        ))}
                      </details>
                    )
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">
                <strong>等待完整协议帧</strong>
                <p>完整 IEC104 帧到达后展示解析结果。</p>
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
