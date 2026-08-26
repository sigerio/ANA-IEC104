import { useRef, useState } from "react";
import { showIoa } from "../format";
import type { Link } from "../hooks";
import { Splitter } from "./Splitter";

export function Logs({ link }: { link: Link }) {
  const { raw, frames, status } = link;
  const container = useRef<HTMLElement>(null);
  const [split, setSplit] = useState(50);
  return (
    <section
      className="bottom"
      ref={container}
      style={{ gridTemplateColumns: `minmax(0, ${split}fr) 8px minmax(0, ${100 - split}fr)` }}
    >
      <article>
        <div className="title">
          <h2>原始通信消息</h2>
          <b>{raw.length}</b>
        </div>
        <div className="log">
          {raw.length ? (
            raw.map((r, i) => (
              <div className={r.direction === "RX" ? "rx" : "tx"} key={i}>
                <time>{r.timestamp}</time>
                <strong>{r.direction}</strong>
                <code>{r.hex}</code>
              </div>
            ))
          ) : (
            <p className="empty-log">{status.serialConnected ? "串口已打开，正在监听原始数据…" : "串口未打开"}</p>
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
      <article>
        <div className="title">
          <h2>协议解析</h2>
          <b>{frames.length}</b>
        </div>
        <div className="decoded">
          {frames.length ? (
            frames.map((f, i) => (
              <div className="frame" key={i}>
                <b>{f.format} 帧</b> {f.ti_name} {f.cot_name} {f.ns !== null ? "· N(S)=" + f.ns : ""}{" "}
                {f.nr !== null ? "· N(R)=" + f.nr : ""}
                {f.error ? (
                  <p className="error">{f.error}</p>
                ) : (
                  f.objects.map((o, j) => (
                    <p key={j}>
                      <span>{showIoa(o.ioa)}</span> {o.value} <small>{o.quality}</small>
                    </p>
                  ))
                )}
              </div>
            ))
          ) : (
            <p className="empty-log">尚无解析帧</p>
          )}
        </div>
      </article>
    </section>
  );
}
