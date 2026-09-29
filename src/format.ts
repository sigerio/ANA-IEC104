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
  p.kind === "遥信" && /故障|告警|急停|冻结|保护|短路|反接|超温|异常|禁止|过低|过温|欠压|过压|过放|低温|重复/.test(p.name);
export const isUsable = (v?: Value) => !!v && !v.stale && v.quality === "正常";
export const isAbnormal = (p: Point, v?: Value) =>
  !!v &&
  (v.stale ||
    v.quality !== "正常" ||
    (isFaultPoint(p) && v.value === "ON") ||
    (/在线(?:（.*）)?$/.test(p.name) && v.value === "OFF") ||
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
    if (/在线(?:（.*）)?$/.test(p.name)) return on ? "在线" : "离线";
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
  const code = Number(v.value);
  if (p.ioa >= 0x13000 && Number.isInteger(code) && code >= 0 && code <= 65535) {
    const unknown = (n: number) => `未知码 ${n}`;
    const voltage = {0: "正常", 1: "欠压告警", 2: "过压告警", 0xf1: "欠压保护", 0xf2: "过压保护"};
    const enums: Record<number, Record<number, string>> = {
      0x1340e: {0: "平衡未开启", 1: "平衡开启"},
      0x1340f: voltage,
      0x13410: {0: "正常", 1: "过放告警", 2: "过充告警", 0xf1: "过放保护", 0xf2: "过充保护"},
      0x13412: {0: "正常", 1: "低温告警", 2: "高温告警", 0xf0: "NTC故障", 0xf1: "低温保护", 0xf2: "高温保护"},
      0x13416: {...voltage, 0xf0: "电芯检测"},
      0x13419: {0: "常规协议", 1: "大电流协议（多电池包并联）"},
    };
    let decoded: string | undefined;
    if (enums[p.ioa]) decoded = enums[p.ioa][code] ?? unknown(code);
    if (p.ioa === 0x13200) decoded = `电压：${["正常", "超压", "欠压", "过放"][code & 15] ?? unknown(code & 15)}；温度：${["正常", "高温", "低温"][(code >> 4) & 15] ?? unknown((code >> 4) & 15)}`;
    if (p.ioa === 0x13201) decoded = `负载：${({0: "正常", 3: "过载"} as Record<number, string>)[(code >> 12) & 3] ?? unknown((code >> 12) & 3)}`;
    if (p.ioa === 0x13202 || p.ioa === 0x13203) {
      decoded = `PV电压：${({0: "正常", 2: "过高"} as Record<number, string>)[code >> 14] ?? unknown(code >> 14)}`;
      if (p.ioa === 0x13202) decoded += `；${["未充电", "浮充", "提升", "均衡"][(code >> 2) & 3]}`;
    }
    if (p.ioa === 0x19019) decoded = `${code >> 8} 分 ${code & 255} 秒`;
    if (p.ioa === 0x1901a) decoded = `${code >> 8} 日 ${code & 255} 时`;
    if (p.ioa === 0x1901b) decoded = `年字段 ${code >> 8} / ${code & 255} 月`;
    if ([0x19028, 0x1902a, 0x1902b].includes(p.ioa)) decoded = `${code >> 8} 小时 ${code & 255} 分`;
    if (decoded) return `${decoded}（${code}）`;
  }
  return Number.isFinite(Number(v.value))
    ? String(Number(v.value))
    : displayValue(v.value);
}

export function adjustmentError(ioa: number, input: string): string {
  if (!input.trim()) return "请输入参数值";
  const value = Number(input);
  if (!Number.isFinite(value)) return "请输入有效数值";
  if (ioa >= 0x19000 && ioa <= 0x1904b) {
    const signed = [0x19006, 0x1900a, 0x1900e, 0x19017, 0x19018, 0x1901d].includes(ioa);
    return Number.isInteger(value) && value >= (signed ? -32768 : 0) && value <= (signed ? 32767 : 65535)
      ? "" : "请输入 16 位寄存器整数原始码（有符号点可输入负数）";
  }
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

export function adjustmentGroup(ioa: number): number[] {
  const start = [0x19019, 0x1902c, 0x1902f, 0x19032, 0x19035]
    .find((start) => ioa >= start && ioa < start + 3);
  return start === undefined ? [ioa] : [start, start + 1, start + 2];
}

export function parameterReplyMatches(
  objects: { ioa: number; raw: string }[], items: { ioa: number; value: number }[], pi: number,
): boolean {
  return objects.length === items.length && items.every((item, index) => {
    const bytes = new Uint8Array(item.ioa === 0x300c || item.ioa >= 0x19000 ? 2 : 4);
    const view = new DataView(bytes.buffer);
    if (bytes.length === 2) view.setUint16(0, item.value, true);
    else view.setFloat32(0, item.value, true);
    const raw = [pi, ...bytes].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    return objects[index].ioa === item.ioa && objects[index].raw === raw;
  });
}
