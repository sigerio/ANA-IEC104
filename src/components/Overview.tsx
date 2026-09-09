import { isFaultPoint, isUsable, pointValue } from "../format";
import type { Link } from "../hooks";

export function Overview({ link }: { link: Link }) {
  const { points, values, status } = link;
  const read = (ioa: number) => {
    const point = points.find((p) => p.ioa === ioa);
    return status.started && point && isUsable(values[ioa])
      ? pointValue(point, values[ioa])
      : "待确认";
  };
  const safety = points.filter(isFaultPoint);
  const alarms = safety.filter(
    (p) =>
      status.started && isUsable(values[p.ioa]) && values[p.ioa].value === "ON",
  );
  const unknown = safety.filter(
    (p) => !status.started || !isUsable(values[p.ioa]),
  ).length;
  const doorFault =
    status.started && isUsable(values[0x17]) && values[0x17].value === "ON";
  const platformFault =
    status.started && isUsable(values[0x18]) && values[0x18].value === "ON";
  return (
    <section className="overview" aria-label="设备状态概览">
      <article className={`summary-card ${doorFault ? "alert-card" : ""}`}>
        <div className="card-top">
          <span className="card-label">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 21V3h16v18M9 21V7h7v14M13 13h.01M2 21h20" />
            </svg>
            门系统
          </span>
          <span className="card-index">01 / DOOR</span>
        </div>
        <div className="card-value">{doorFault ? "限位冲突" : read(0x100)}</div>
        <div className="card-bottom">
          <span
            className={`dot ${status.started && isUsable(values[0x100]) ? "live" : ""}`}
          />
          {read(0x11) === "运行中" ? "电机运行中" : "位置与运行状态"}
          <span>{doorFault ? "检查门限位" : "本机设备"}</span>
        </div>
      </article>
      <article className={`summary-card ${platformFault ? "alert-card" : ""}`}>
        <div className="card-top">
          <span className="card-label">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 15h18v5H3zM6 15V5h12v10M10 8v4m4-4v4m-4-2h4" />
            </svg>
            停机坪
          </span>
          <span className="card-index">02 / PLATFORM</span>
        </div>
        <div className="card-value">
          {platformFault ? "限位冲突" : read(0x101)}
        </div>
        <div className="card-bottom">
          <span
            className={`dot ${status.started && isUsable(values[0x101]) ? "live" : ""}`}
          />
          {read(0x12) === "运行中" ? "电机运行中" : "位置与运行状态"}
          <span>{platformFault ? "检查平台限位" : "本机设备"}</span>
        </div>
      </article>
      <article className={`summary-card ${alarms.length ? "alert-card" : ""}`}>
        <div className="card-top">
          <span className="card-label">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6zM12 8v5m0 3h.01" />
            </svg>
            故障与安全
          </span>
          <span className="card-index">03 / SAFETY</span>
        </div>
        <div className="card-value">
          {alarms.length ? (
            <>
              {alarms.length}
              <small>项已触发</small>
            </>
          ) : unknown || !safety.length ? (
            "待确认"
          ) : (
            "无告警"
          )}
        </div>
        <div
          className="card-bottom"
          title={alarms.map((p) => p.name).join("、")}
        >
          <span
            className={`dot ${alarms.length ? "alarm" : unknown || !safety.length ? "" : "live"}`}
          />
          <span className="truncate">
            {alarms.length
              ? alarms[0].name
              : unknown
                ? `${unknown} 个状态待确认`
                : "急停、限位与子设备告警"}
          </span>
        </div>
      </article>
      <article className="summary-card environment">
        <div className="card-top">
          <span className="card-label">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 14.5V5a3 3 0 0 0-6 0v9.5a5 5 0 1 0 6 0ZM6 9v9m9-12h6m-6 5h4m-4 5h6" />
            </svg>
            环境监测
          </span>
          <span className="card-index">04 / ENVIRONMENT</span>
        </div>
        <div className="environment-values">
          <div className="card-value">
            {read(0x2000)}
            <small>°C</small>
          </div>
          <div className="card-value">
            {read(0x2001)}
            <small>%RH</small>
          </div>
        </div>
        <div className="card-bottom">
          <span className={`dot ${read(0x1000) === "在线" ? "live" : ""}`} />
          温湿度传感器<span>{read(0x1000)}</span>
        </div>
      </article>
    </section>
  );
}
