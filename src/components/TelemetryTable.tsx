import { useMemo } from "react";
import { displayValue, showIoa } from "../format";
import type { Link } from "../hooks";

export function TelemetryTable({ link }: { link: Link }) {
  const { points, values } = link;
  const telemetry = useMemo(() => points.filter((p) => p.kind === "遥信" || p.kind === "遥测" || p.kind === "遥调"), [points]);
  return (
    <article className="points">
      <div className="title">
        <h2>实时遥信、遥测与遥调参数</h2>
        <b>{telemetry.length} 点</b>
      </div>
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>IOA</th>
              <th>名称</th>
              <th>类别</th>
              <th>实时值</th>
              <th>品质</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {telemetry.map((p) => {
              const v = values[p.ioa];
              return (
                <tr key={p.ioa}>
                  <td className="mono">{showIoa(p.ioa)}</td>
                  <td>{p.name}</td>
                  <td>
                    <em>{p.kind}</em>
                  </td>
                  <td className="value">{v ? displayValue(v.value) + (p.unit ? " " + p.unit : "") : "--"}</td>
                  <td className={v && v.quality === "正常" ? "good" : "warn"}>{v ? v.quality : "未更新"}</td>
                  <td className="muted">{v ? v.time : "--"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
