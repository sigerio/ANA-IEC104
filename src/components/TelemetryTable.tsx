import { useMemo, useState } from "react";
import { isAbnormal, isUsable, pointValue, showIoa } from "../format";
import type { Link } from "../hooks";

export function TelemetryTable({ link }: { link: Link }) {
  const { points, values, status } = link;
  const [kind, setKind] = useState("全部");
  const [query, setQuery] = useState("");
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const telemetry = useMemo(
    () => points.filter((p) => p.kind !== "遥控"),
    [points],
  );
  const filtered = telemetry.filter(
    (p) =>
      (kind === "全部" || p.kind === kind) &&
      `${p.name} ${showIoa(p.ioa)}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (!abnormalOnly || isAbnormal(p, values[p.ioa])),
  );
  const updated = telemetry.filter(
    (p) => values[p.ioa] && !values[p.ioa].stale,
  ).length;
  return (
    <article className="points panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">LIVE TELEMETRY</span>
          <h2>
            实时监控 <span className="count">{telemetry.length}</span>
          </h2>
        </div>
        <span className="panel-meta">
          {status.started
            ? `${updated} / ${telemetry.length} 已更新`
            : "等待有效回传"}
        </span>
      </div>
      <div className="table-tools">
        <div className="tabs" aria-label="点位类别">
          {["全部", "遥信", "遥测", "遥调"].map((tab) => (
            <button
              key={tab}
              className={kind === tab ? "active" : ""}
              aria-pressed={kind === tab}
              onClick={() => setKind(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={abnormalOnly}
            onChange={(e) => setAbnormalOnly(e.target.checked)}
          />
          仅异常
        </label>
      </div>
      <div className="search-row">
        <input
          type="search"
          aria-label="搜索点位名称或 IOA"
          placeholder="搜索点位名称或 IOA…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>{filtered.length} 个点位</span>
      </div>
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>点位名称 / 地址</th>
              <th>类型</th>
              <th>实时状态 / 数值</th>
              <th>数据品质</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const value = values[p.ioa];
              const valid = status.started && isUsable(value);
              const abnormal = isAbnormal(p, value);
              const quality = !value
                ? "待更新"
                : !status.started || value.stale
                  ? "历史数据"
                  : value.quality === "正常"
                    ? "有效"
                    : value.quality;
              return (
                <tr
                  key={p.ioa}
                  className={abnormal && valid ? "abnormal-row" : ""}
                >
                  <td>
                    <span className="point-name">{p.name}</span>
                    <span className="ioa">{showIoa(p.ioa)}</span>
                  </td>
                  <td>
                    <span className={`kind kind-${p.kind}`}>{p.kind}</span>
                  </td>
                  <td
                    className={`point-value ${!valid ? "muted" : abnormal ? "alarm-text" : ""}`}
                  >
                    {pointValue(p, value)}
                    {value && ![0x100, 0x101, 0x300c].includes(p.ioa) && (
                      <small>{p.unit}</small>
                    )}
                  </td>
                  <td>
                    <span
                      className={`quality ${valid ? "valid" : value ? "uncertain" : ""}`}
                      title={
                        value?.quality === "正常"
                          ? "数据有效不代表设备无故障，请查看实时状态。"
                          : "IV 无效 · NT 非当前值 · SB 替代 · BL 封锁 · OV 溢出"
                      }
                    >
                      <i />
                      {quality}
                    </span>
                  </td>
                  <td className="time">{value?.time || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-state">
            <span className="empty-symbol">⌕</span>
            <strong>
              {points.length ? "没有符合条件的点位" : "正在加载设备点表"}
            </strong>
            <p>
              {points.length
                ? "试试其他关键词，或关闭异常筛选。"
                : "点表将在桌面通信服务就绪后显示。"}
            </p>
            {points.length > 0 && (
              <button
                onClick={() => {
                  setQuery("");
                  setKind("全部");
                  setAbnormalOnly(false);
                }}
              >
                重置筛选
              </button>
            )}
          </div>
        )}
      </div>
      <div className="panel-foot">
        <span>
          <i className={`dot ${status.started ? "live" : ""}`} />
          {status.started
            ? "接收设备总召与自发上报"
            : "会话未建立，已有数值仅供历史参考"}
        </span>
        <span>品质与设备故障独立显示</span>
      </div>
    </article>
  );
}
