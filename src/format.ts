import type { Point, Value } from "./types";

export const showIoa = (n: number) =>
  "0x" + n.toString(16).toUpperCase().padStart(6, "0");
export const now = () =>
  new Date().toLocaleTimeString("zh-CN", { hour12: false });
export const displayValue = (value: string) =>
  value
    .replace(/\bON\b/g, "置位")
    .replace(/\bOFF\b/g, "复位")
    .replace(/^QOI=0x14$/, "总召唤");
export const isFaultPoint = (p: Point) =>
  p.kind === "遥信" && /故障|告警|急停|冻结/.test(p.name);
export const isUsable = (v?: Value) => !!v && !v.stale && v.quality === "正常";
export const isAbnormal = (p: Point, v?: Value) =>
  !!v &&
  (v.stale ||
    v.quality !== "正常" ||
    (isFaultPoint(p) && v.value === "ON") ||
    (p.name.endsWith("在线") && v.value === "OFF") ||
    ([0x100, 0x101].includes(p.ioa) && Number(v.value) === 3));

export function pointValue(p: Point, v?: Value): string {
  if (!v) return "—";
  if (p.kind === "遥信") {
    const on = v.value === "ON";
    if (p.ioa === 0x16) return on ? "已使能（导通）" : "已关闭";
    if (isFaultPoint(p))
      return on
        ? p.ioa === 0x17 || p.ioa === 0x18
          ? "限位冲突"
          : "已触发"
        : "正常";
    if (p.name.endsWith("在线")) return on ? "在线" : "离线";
    if (/运行|灯效活动/.test(p.name)) return on ? "运行中" : "已停止";
    if (/点亮/.test(p.name)) return on ? "已点亮" : "已关闭";
    if (/到位/.test(p.name)) return on ? "已到位" : "未到位";
  }
  if (p.ioa === 0x100)
    return (
      ["停止 / 未知", "已打开", "已关闭", "故障"][Number(v.value)] ?? v.value
    );
  if (p.ioa === 0x101)
    return (
      ["停止 / 未知", "已伸出", "已收回", "故障"][Number(v.value)] ?? v.value
    );
  if (p.ioa === 0x300c)
    return ["待机送风", "制冷", "加热", "除湿"][Number(v.value)] ?? v.value;
  return Number.isFinite(Number(v.value))
    ? String(Number(v.value))
    : displayValue(v.value);
}

export function adjustmentError(ioa: number, input: string): string {
  if (!input.trim()) return "请输入参数值";
  const value = Number(input);
  if (!Number.isFinite(value)) return "请输入有效数值";
  if (ioa === 0x300c)
    return Number.isInteger(value) && value >= 0 && value <= 3
      ? ""
      : "模式范围为 0–3 的整数";
  if (ioa >= 0x300d)
    return value >= -10 &&
      value <= 10 &&
      Math.abs(Math.round(value * 100) - value * 100) < 0.0001
      ? ""
      : "范围 −10～10，步进 0.01";
  if (ioa === 0x300b)
    return Number.isInteger(value) && value >= -3276 && value <= 3276
      ? ""
      : "范围 −3276～3276 的整数";
  const limits: Record<number, [number, number]> = {
    0x3000: [20, 55],
    0x3001: [15, 35],
    0x3002: [-30, 15],
    0x3003: [0, 23],
    0x3004: [30, 60],
    0x3005: [-10, 10],
  };
  const range = limits[ioa];
  if (range && (value < range[0] || value > range[1]))
    return `允许范围 ${range[0]}～${range[1]}`;
  if (Math.abs(Math.round(value * 10) - value * 10) > 0.0001)
    return "步进为 0.1";
  return value >= -3276.8 && value <= 3276.7
    ? ""
    : "超出寄存器范围 −3276.8～3276.7";
}
