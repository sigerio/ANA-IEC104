import { useMemo } from "react";
import { showIoa } from "../format";
import type { Link } from "../hooks";

export function ControlPanel({ link }: { link: Link }) {
  const { points, status, selected, adjustments, setAdjustments, control, adjust } = link;
  const controls = useMemo(() => points.filter((p) => p.kind === "遥控"), [points]);
  const tuning = useMemo(() => points.filter((p) => p.kind === "遥调"), [points]);
  return (
    <aside className="commands">
      <div className="title">
        <h2>控制下发</h2>
      </div>
      <section>
        <h3>单点遥控</h3>
        {controls.map((p) => (
          <div className="command" key={p.ioa}>
            <div>
              <b>{p.name}</b>
              <small>{showIoa(p.ioa)}</small>
            </div>
            <button disabled={!status.started} onClick={() => control(p.ioa, true)}>
              选择
            </button>
            <button className="execute" disabled={!status.started || selected !== p.ioa} onClick={() => control(p.ioa, false)}>
              执行
            </button>
          </div>
        ))}
      </section>
      <section>
        <h3>遥调参数</h3>
        {tuning.map((p) => (
          <div className="adjust" key={p.ioa}>
            <label>
              {p.name}
              <small>
                {showIoa(p.ioa)} · {p.unit || "浮点数"}
              </small>
            </label>
            <input
              value={adjustments[p.ioa] || ""}
              onChange={(e) => setAdjustments((a) => ({ ...a, [p.ioa]: e.target.value }))}
            />
            <button disabled={!status.started || !adjustments[p.ioa]} onClick={() => adjust(p.ioa, true, false)}>
              预置
            </button>
            <button disabled={!status.started || !adjustments[p.ioa]} onClick={() => adjust(p.ioa, false, false)}>
              固化
            </button>
            <button disabled={!status.started || !adjustments[p.ioa]} onClick={() => adjust(p.ioa, false, true)}>
              取消
            </button>
          </div>
        ))}
      </section>
    </aside>
  );
}
