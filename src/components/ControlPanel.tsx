import { useState } from "react";
import { adjustmentError, adjustmentGroup, isRawAdjustment, isTimerAdjustment, isUsable, pointValue, showIoa } from "../format";
import type { Link } from "../hooks";

const GROUPS = [
  { title: "门控制", note: "打开 / 关闭", ioas: [0x200, 0x201] },
  { title: "门加热解冻", note: "使能 / 关闭", ioas: [0x224, 0x225] },
  { title: "停机坪", note: "伸出 / 收回", ioas: [0x210, 0x211] },
  { title: "内部照明", note: "打开 / 关闭", ioas: [0x222, 0x223] },
  { title: "空调电源", note: "监控开机 / 关机", ioas: [0x220, 0x221] },
  { title: "整机推出", note: "无运行或到位反馈", ioas: [0x230, 0x231, 0x232] },
  { title: "立杆升降", note: "无运行或到位反馈", ioas: [0x233, 0x234, 0x235] },
  { title: "太阳板", note: "无运行或到位反馈", ioas: [0x236, 0x237, 0x238] },
  { title: "环境调零", note: "无完成反馈，勿盲目重发", ioas: [0x240, 0x241] },
  { title: "统计与故障清除", note: "状态位不代表完成", ioas: [0x500, 0x501, 0x502, 0x503] },
  { title: "逆变输出", note: "独立开启 / 关闭点", ioas: [0x50c, 0x50d] },
  { title: "本地 / 远程", note: "切换控制模式", ioas: [0x510, 0x511] },
  { title: "直流负载", note: "独立开启 / 关闭点", ioas: [0x51a, 0x51b] },
];

export function ControlPanel({ link }: { link: Link }) {
  const {
    points,
    values,
    status,
    selected,
    adjustments,
    setAdjustments,
    control,
    adjust,
    pending,
    presets,
    busy,
    ready,
  } = link;
  const [tab, setTab] = useState("设备控制");
  const disabled = !ready || !status.started || busy || !!pending;
  return (
    <aside className="commands panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">COMMAND CENTER</span>
          <h2>操作中心</h2>
        </div>
        <span className={`status compact ${status.started ? "ok" : ""}`}>
          <i />
          {status.started ? "可操作" : "未就绪"}
        </span>
      </div>
      <div className="control-tabs tabs">
        {["设备控制", "参数设置"].map((name) => (
          <button
            key={name}
            aria-pressed={tab === name}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            {name}
            <span>{points.filter((p) => p.kind === (name === "设备控制" ? "遥控" : "遥调")).length}</span>
          </button>
        ))}
      </div>
      <div className="command-scroll">
        {tab === "设备控制" ? (
          <>
            <div className="operation-help">
              <span>01 选择</span>
              <b>→</b>
              <span>02 等待确认</span>
              <b>→</b>
              <span>03 执行</span>
            </div>
            {GROUPS.map((group) => (
              <section className="control-group" key={group.title}>
                <div className="group-heading">
                  <h3>{group.title}</h3>
                  <span>{group.note}</span>
                </div>
                {group.ioas.map((ioa) => {
                  const point = points.find((p) => p.ioa === ioa);
                  if (!point) return null;
                  const waiting = pending?.ioa === ioa;
                  return (
                    <div
                      className={`command ${selected === ioa ? "selected-command" : ""}`}
                      key={ioa}
                    >
                      <div>
                        <b>{point.name}</b>
                        <small>
                          {waiting
                            ? `等待${pending.action}确认…`
                            : selected === ioa
                              ? "已确认选择 · 可执行"
                              : showIoa(ioa)}
                        </small>
                      </div>
                      <button
                        disabled={disabled}
                        onClick={() => control(ioa, true)}
                      >
                        {selected === ioa ? "已选择" : "选择"}
                      </button>
                      <button
                        className="execute"
                        disabled={disabled || selected !== ioa}
                        onClick={() => control(ioa, false)}
                      >
                        执行
                      </button>
                    </div>
                  );
                })}
              </section>
            ))}
          </>
        ) : (
          <>
            <p className="parameter-help">
              预置确认后才能固化，固化后总召核对有回读的参数。供电与环境参数输入原始整数；四个定时点输入当天累计秒数（0～86399），并采用 UINT32_LE 写入。
            </p>
            {points
              .filter((p) => p.kind === "遥调")
              .map((point) => {
                const input = adjustments[point.ioa] || "";
                const validation = adjustmentError(point.ioa, input);
                const group = adjustmentGroup(point.ioa);
                const confirmed = group.every((ioa) => presets[ioa] !== undefined);
                const matchesPreset = confirmed && group.every((ioa) =>
                  presets[ioa] !== undefined && Object.is(presets[ioa], Number(adjustments[ioa])) && !adjustmentError(ioa, adjustments[ioa] || ""));
                const groupInvalid = group.some((ioa) => adjustmentError(ioa, adjustments[ioa] || ""));
                const raw = isRawAdjustment(point.ioa);
                const step = raw ? 1 : [0x300b, 0x300c].includes(point.ioa) ? 1 : 0.1;
                return (
                  <section className="adjust" key={point.ioa}>
                    <div className="adjust-heading">
                      <label htmlFor={`adjust-${point.ioa}`}>
                        {point.name}
                      </label>
                      <small>{showIoa(point.ioa)}</small>
                    </div>
                    <div className="adjust-value">
                      <span>
                        当前{" "}
                        <b>
                          {point.readback === false
                            ? "无回读"
                            : isUsable(values[point.ioa]) && status.started
                              ? pointValue(point, values[point.ioa])
                              : "待确认"}
                        </b>
                        {raw && !isTimerAdjustment(point.ioa) && point.readback !== false && isUsable(values[point.ioa]) && status.started && ` ${point.unit}`}
                      </span>
                      {point.ioa === 0x300c ? (
                        <select
                          id={`adjust-${point.ioa}`}
                          value={input}
                          disabled={disabled}
                          onChange={(e) =>
                            setAdjustments((current) => ({
                              ...current,
                              [point.ioa]: e.target.value,
                            }))
                          }
                        >
                          <option value="">选择模式</option>
                          {["送风", "制冷", "加热", "除湿"].map(
                            (mode, index) => (
                              <option key={mode} value={index}>
                                {index} · {mode}
                              </option>
                            ),
                          )}
                        </select>
                      ) : (
                        <div className="unit-input">
                          <input
                            id={`adjust-${point.ioa}`}
                            type="number"
                            step={step}
                            placeholder="输入新值"
                            value={input}
                            disabled={disabled}
                            aria-invalid={!!input && !!validation}
                            aria-describedby={`hint-${point.ioa}`}
                            onChange={(e) =>
                              setAdjustments((current) => ({
                                ...current,
                                [point.ioa]: e.target.value,
                              }))
                            }
                          />
                          <span>{isTimerAdjustment(point.ioa) ? "秒" : raw ? "原始码" : point.unit}</span>
                        </div>
                      )}
                    </div>
                    {raw && <small className="parameter-help">
                      {point.hint}<br />
                      {point.readback === false
                        ? "无回读；ACTTERM 仅表示写入请求已接受"
                        : point.scale && point.scale !== 1
                          ? `写入原始码 = 工程值 × ${point.scale} ${point.unit}`
                          : "输入整数原始码"}
                      {point.readback !== false && point.scale && point.scale !== 1 && input && !validation && `；本次设定对应 ${Number(input) / point.scale} ${point.unit}`}
                    </small>}
                    <div className="adjust-actions">
                      <small
                        id={`hint-${point.ioa}`}
                        className={input && validation ? "alarm-text" : ""}
                      >
                        {pending && group.includes(pending.ioa)
                          ? `等待${pending.action}确认…`
                          : input && validation
                            ? validation
                            : matchesPreset
                              ? "预置已确认"
                              : confirmed
                                ? `已预置 ${presets[point.ioa]}，输入已变更`
                                : "等待预置"}
                      </small>
                      <button
                        disabled={disabled || groupInvalid}
                        onClick={() => adjust(point.ioa, true, false)}
                      >
                        预置
                      </button>
                      <button
                        className="execute"
                        disabled={disabled || !matchesPreset}
                        onClick={() => adjust(point.ioa, false, false)}
                      >
                        固化
                      </button>
                      <button
                        className="quiet"
                        disabled={disabled || !confirmed}
                        onClick={() => adjust(point.ioa, false, true)}
                      >
                        取消
                      </button>
                    </div>
                  </section>
                );
              })}
          </>
        )}
      </div>
      <div className="panel-foot">
        <span>
          {pending
            ? `等待设备${pending.action}确认…`
            : status.started
              ? "动作请求接受后，以设备回传状态为准"
              : "建立 IEC104 会话后启用控制"}
        </span>
      </div>
    </aside>
  );
}
