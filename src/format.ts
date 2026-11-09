import type { Point, Value } from "./types";

const TIMER_IOAS = new Set([0x19663, 0x19666, 0x19669, 0x1966c]);
const POWER_IOAS = new Set([
  0x1960f, 0x19610, 0x19611, 0x19613, 0x19614,
  0x19615, 0x19616, 0x19617, 0x19618, 0x19619, 0x1961a, 0x1961b,
  0x1961c, 0x1961d, 0x1961e, 0x1961f, 0x19620, 0x19621, 0x19622,
  0x19623, 0x19624, 0x19631, 0x19632, 0x19633, 0x19634, 0x19635,
  0x19636, 0x19656, 0x19657, 0x19658, 0x19659, 0x1965c, 0x1965d,
  0x1965e, 0x1965f, 0x19660, 0x19661, 0x19662, 0x19663, 0x19666,
  0x19669, 0x1966c, 0x1966f, 0x19670, 0x19671,
]);
const SIGNED_POWER_IOAS = new Set([
  0x19622, 0x19623, 0x19656, 0x19657, 0x19658, 0x19659,
]);

export const isTimerAdjustment = (ioa: number) => TIMER_IOAS.has(ioa);
export const isPowerAdjustment = (ioa: number) => POWER_IOAS.has(ioa);
export const isRawAdjustment = (ioa: number) =>
  isPowerAdjustment(ioa) || ioa === 0x3011 || ioa === 0x3012;

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
  p.kind === "遥信" &&
  !/命令位/.test(p.name) &&
  /故障|告警|急停|冻结|保护|短路|反接|超温|异常|禁止|过低|过温|欠压|过压|过放|低温|重复|冲突|错误|过流|失控|无法|断路|不均衡/.test(
    p.name,
  );
export const isUsable = (v?: Value) => !!v && !v.stale && v.quality === "正常";
export const isAbnormal = (p: Point, v?: Value) =>
  !!v &&
  (v.stale ||
    v.quality !== "正常" ||
    (isFaultPoint(p) && v.value === "ON") ||
    (/在线(?:（.*）)?$/.test(p.name) && v.value === "OFF") ||
    ([0x100, 0x101].includes(p.ioa) && Number(v.value) === 3));

const integer = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) && Number.isInteger(number) ? number : null;
};
const unknown = (code: number) => `未知码 ${code}`;
const withCode = (text: string, code: number) => `${text}（${code}）`;
const secondsOfDay = (code: number) =>
  `${String(Math.floor(code / 3600)).padStart(2, "0")}:${String(
    Math.floor(code / 60) % 60,
  ).padStart(2, "0")}:${String(code % 60).padStart(2, "0")}`;

export function pointValue(p: Point, v?: Value): string {
  if (!v) return "—";
  if (p.kind === "遥信") {
    const on = v.value === "ON";
    if (p.ioa === 0x16) return on ? "已使能（导通）" : "已关闭";
    if (p.ioa === 0x11100 || p.ioa === 0x11101)
      return on ? "已使能" : "未使能";
    if (p.ioa === 0x11106) return on ? "逆变已开启" : "逆变已关闭";
    if (p.ioa === 0x11108) return on ? "远程" : "本地";
    if (p.ioa === 0x1110d) return on ? "直流负载已开启" : "直流负载已关闭";
    if (/0=待机/.test(p.name)) return on ? "运行" : "待机";
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
    return ["未知 / 中间", "已打开", "已关闭", "故障"][Number(v.value)] ?? v.value;
  if (p.ioa === 0x101)
    return ["未知 / 中间", "已伸出", "已收回", "故障"][Number(v.value)] ?? v.value;
  if (p.ioa === 0x300c)
    return ["送风", "制冷", "加热", "除湿"][Number(v.value)] ?? v.value;

  const code = integer(v.value);
  if (code !== null && isTimerAdjustment(p.ioa) && code >= 0 && code <= 86399)
    return `${secondsOfDay(code)}（${code} s）`;
  if (code !== null && code >= 0 && code <= 65535) {
    if (p.ioa === 0x13523 || p.ioa === 0x13564) {
      const input = ["输入正常", "输入电压过低", "输入电压过高", "输入未接入等其他"][code >> 14];
      const load = ["轻载", "中度", "额定", "过载"][(code >> 12) & 3];
      return `${input}；${load}（${code}）`;
    }
    if (p.ioa === 0x13559) {
      const input = ["输入电压正常", "输入未接入", "输入电压过高", "输入电压错误"][code >> 14];
      const charge = ["未充电", "浮充", "提升", "均衡"][(code >> 2) & 3];
      return `${input}；${charge}（${code}）`;
    }
    if (p.ioa === 0x13589) {
      const battery = ["正常", "超压", "欠压", "过放", "错误（BMS 保护）"][code & 15] ?? unknown(code & 15);
      const temperature = ["正常", "过高温", "过低温"][(code >> 4) & 15] ?? unknown((code >> 4) & 15);
      return `${battery}；${temperature}（${code}）`;
    }
    if (p.ioa === 0x1960f) {
      const types = [
        "User（用户定义）", "铅酸免维护", "胶体", "铅酸液体", "铁锂电池4串",
        "铁锂电池8串", "铁锂电池15串", "铁锂电池16串", "三元锂电池3串",
        "三元锂电池6串", "三元锂电池7串", "三元锂电池13串", "三元锂电池14串",
      ];
      return withCode(types[code] ?? unknown(code), code);
    }
    if (p.ioa === 0x19621)
      return code === 768 ? "使能（768）" : code === 1024 ? "不使能（1024）" : unknown(code);
    if (p.ioa === 0x19660) {
      const modes = ["手动", "光控开关", "光控＋多时段", "定时开关", "光控＋3时段（LED恒流源）", "午夜、晨亮＋光控多时段"];
      return withCode(modes[code] ?? unknown(code), code);
    }
    if (p.ioa === 0x19624) return `${code >> 8} 分 ${code & 255} 秒（${code}）`;
    if ([0x19661, 0x19662, 0x1966f].includes(p.ioa))
      return `${code >> 8} 小时 ${code & 255} 分（${code}）`;
    if (p.ioa === 0x19670) return `${code + 1} 时段（${code}）`;
    if (p.ioa === 0x19671) return code === 1 ? "开（1）" : code === 0 ? "关（0）" : unknown(code);
  }
  return Number.isFinite(Number(v.value))
    ? String(Number(v.value))
    : displayValue(v.value);
}

export function adjustmentError(ioa: number, input: string): string {
  if (!input.trim()) return "请输入参数值";
  const value = Number(input);
  if (!Number.isFinite(value)) return "请输入有效数值";

  if (isRawAdjustment(ioa)) {
    if (!Number.isInteger(value)) return "请输入整数原始码";
    if (isTimerAdjustment(ioa))
      return value >= 0 && value <= 86399 ? "" : "范围为 0～86399 秒（当天累计秒数）";
    if (ioa === 0x3011)
      return value === 0 || value === 1 ? "" : "风向偏移仅允许 0 或 1";
    if (ioa === 0x1960f)
      return value >= 0 && value <= 12 ? "" : "电池类型范围为 0～12";
    if (ioa === 0x19611)
      return value >= 0 && value <= 9 ? "" : "温度补偿系数范围为 0～9";
    if (ioa === 0x19621)
      return value === 768 || value === 1024 ? "" : "仅允许 768（使能）或 1024（不使能）";
    if (ioa === 0x19622 || ioa === 0x19623)
      return value >= -4000 && value <= 1000 ? "" : "范围为 -4000～1000（℃×100 的 I16 原码）";
    if (ioa === 0x19631)
      return [11000, 12000, 22000, 23000].includes(value) ? "" : "仅允许 11000、12000、22000、23000";
    if (ioa === 0x19632)
      return value === 5000 || value === 6000 ? "" : "仅允许 5000 或 6000";
    if (ioa === 0x19660)
      return value >= 0 && value <= 5 ? "" : "负载控制模式范围为 0～5";
    if (ioa === 0x19671)
      return value === 0 || value === 1 ? "" : "手动开关仅允许 0 或 1";
    if (SIGNED_POWER_IOAS.has(ioa))
      return value >= -32768 && value <= 32767 ? "" : "请输入 I16 原始码（-32768～32767）";
    if (value < 0 || value > 65535) return "请输入 UINT16 原始码（0～65535）";
    if (ioa === 0x19624 && ((value & 255) > 59 || ((value >> 8) & 255) > 59))
      return "高字节分、低字节秒均须为 0～59";
    if ([0x19661, 0x19662, 0x1966f].includes(ioa) && (value & 255) > 59)
      return "低字节分钟须为 0～59";
    return "";
  }

  if (ioa < 0x3000 || ioa > 0x300c) return "不支持的遥调点";
  if (ioa === 0x300c)
    return Number.isInteger(value) && value >= 0 && value <= 3 ? "" : "模式范围为 0–3 的整数";
  if (ioa === 0x300b)
    return Number.isInteger(value) && value >= -3276 && value <= 3276
      ? ""
      : "范围 −3276～3276 的整数";
  if (value < -3276.8 || value > 3276.7) return "超出寄存器范围 −3276.8～3276.7";
  const scaled = Math.trunc(value * 10);
  const limits: Record<number, [number, number]> = {
    0x3000: [200, 550],
    0x3001: [150, 350],
    0x3002: [-300, 150],
    0x3003: [0, 230],
    0x3004: [300, 600],
    0x3005: [-100, 100],
  };
  const range = limits[ioa] ?? [-32768, 32767];
  return scaled >= range[0] && scaled <= range[1]
    ? ""
    : `按 0.1 向零截断后允许原始码 ${range[0]}～${range[1]}`;
}

// 保留原有调用形状；V3.3 的每个界面操作都是单点，后台仍支持同类多点组帧。
export const adjustmentGroup = (ioa: number): number[] => [ioa];

export function parameterReplyMatches(
  objects: { ioa: number; raw: string }[],
  items: { ioa: number; value: number }[],
  pi: number,
): boolean {
  return objects.length === items.length && items.every((item, index) => {
    const timer = isTimerAdjustment(item.ioa);
    const rawInteger = item.ioa === 0x300c || isRawAdjustment(item.ioa);
    const bytes = new Uint8Array(timer || !rawInteger ? 4 : 2);
    const view = new DataView(bytes.buffer);
    if (timer) view.setUint32(0, item.value, true);
    else if (rawInteger) view.setUint16(0, item.value, true);
    else view.setFloat32(0, item.value, true);
    const raw = [pi, ...bytes].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
    return objects[index].ioa === item.ioa && objects[index].raw === raw;
  });
}
