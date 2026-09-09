// 仅供 Vite 开发服务器的交互回归；不会进入生产入口或安装包。
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import definitions from "../src-tauri/src/points.rs?raw";

const points = [
  ...definitions.matchAll(
    /\((0x[\dA-Fa-f]+), "([^"]+)", "([^"]+)", "([^"]*)"\)/g,
  ),
].map((m) => ({ ioa: Number(m[1]), name: m[2], kind: m[3], unit: m[4] }));
const status = {
  serialConnected: false,
  started: false,
  protocolState: "未建立",
  port: null as string | null,
  baudRate: null as number | null,
  ns: 0,
  nr: 0,
  error: null as string | null,
};
const frame = (ti_name: string, objects: unknown[], cot = 3, extra = {}) => ({
  direction: "RX",
  accepted: true,
  format: "I",
  ti_name,
  objects,
  cot,
  cot_name: cot === 7 ? "激活确认" : cot === 10 ? "激活终止" : "自发",
  ns: 0,
  nr: 0,
  error: null,
  ...extra,
});
const rawValue = (value: number, mode = false) => {
  const bytes = new Uint8Array(mode ? 2 : 4);
  const view = new DataView(bytes.buffer);
  if (mode) view.setUint16(0, value, true);
  else view.setFloat32(0, value, true);
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
};
const values: Record<number, number> = {
  0x100: 2,
  0x101: 2,
  0x2000: 24.6,
  0x2001: 56.8,
  0x2010: 2.3,
  0x2011: 135,
  0x3000: 25,
  0x3001: 20,
  0x3002: 10,
  0x3003: 18,
  0x3004: 50,
  0x3005: 5,
  0x300c: 1,
};
const device = {
  ports: ["COM3", "COM5"],
  calls: [] as { cmd: string; args: Record<string, unknown> }[],
  silent: false,
  reject: false,
  failOpen: false,
  failCommand: false,
  emit,
  frame,
  status,
  async publish() {
    await emit(
      "parsed-frame",
      frame(
        "M_SP_NA_1",
        points
          .filter((p) => p.kind === "遥信")
          .map((p) => ({
            ioa: p.ioa,
            value:
              p.name.endsWith("在线") || [2, 4, 0x14, 0x15].includes(p.ioa)
                ? "ON"
                : "OFF",
            raw: "00",
            quality: "正常",
          })),
        20,
      ),
    );
    await emit(
      "parsed-frame",
      frame(
        "M_ME_NC_1",
        points
          .filter((p) => p.kind === "遥测" || p.kind === "遥调")
          .map((p) => ({
            ioa: p.ioa,
            value: String(values[p.ioa] ?? 0),
            raw: "00",
            quality: "正常",
          })),
        20,
      ),
    );
  },
};
Object.assign(window, { testDevice: device });
mockIPC(
  async (cmd, payload) => {
    const args = (payload || {}) as Record<string, unknown>;
    device.calls.push({ cmd, args });
    if (cmd === "points") return points;
    if (cmd === "list_ports") return device.ports;
    if (cmd === "status") return { ...status };
    if (cmd === "connect") {
      if (device.failOpen) throw new Error("打开串口 COM3 失败：Access denied");
      Object.assign(status, {
        serialConnected: true,
        port: args.port,
        baudRate: args.baudRate,
        protocolState: "建立中（等待 STARTDT CON）",
      });
      await emit("link-status", { ...status });
    }
    if (cmd === "connect" || cmd === "start") {
      if (!device.silent)
        setTimeout(async () => {
          Object.assign(status, { started: true, protocolState: "已建立" });
          await emit("link-status", { ...status });
        }, 40);
    }
    if (cmd === "stop" || cmd === "disconnect") {
      Object.assign(status, {
        started: false,
        protocolState: "未建立",
        serialConnected: cmd !== "disconnect",
      });
      await emit("link-status", { ...status });
    }
    if (["control", "adjust", "general_interrogation"].includes(cmd)) {
      if (device.failCommand) throw new Error("模拟业务发送失败");
      await emit("raw-message", {
        direction: "TX",
        hex: "68 0E 00 00 00 00",
        timestamp: "00:00:00",
      });
      const ti =
        cmd === "control"
          ? "C_SC_NA_1"
          : cmd === "adjust"
            ? "C_WS_NA_1"
            : "C_IC_NA_1";
      const obj = {
        ioa: args.ioa || 0,
        value:
          cmd === "control"
            ? `ON ${args.select ? "选择" : "执行"}`
            : cmd === "adjust"
              ? String(args.value)
              : "QOI=0x14",
        quality: "",
        raw:
          cmd === "control"
            ? args.select
              ? "81"
              : "01"
            : cmd === "adjust"
              ? `${args.cancel ? "02" : args.preset ? "01" : "00"} ${rawValue(Number(args.value), args.ioa === 0x300c)}`
              : "14",
      };
      await emit(
        "parsed-frame",
        frame(ti, [obj], 6, { direction: "TX", accepted: false }),
      );
      if (!device.silent)
        setTimeout(async () => {
          await emit("raw-message", {
            direction: "RX",
            hex: "68 0E 00 00 02 00",
            timestamp: "00:00:00",
          });
          const cot = device.reject
            ? 0x47
            : args.select || args.preset || args.cancel
              ? 7
              : 10;
          if (cmd === "general_interrogation" && !device.reject)
            await device.publish();
          await emit("parsed-frame", frame(ti, [obj], cot));
        }, 40);
    }
  },
  { shouldMockEvents: true },
);
await import("../src/main");
const badge = document.createElement("div");
badge.textContent = "模拟设备 · 交互回归";
badge.style.cssText =
  "position:fixed;right:16px;top:0;font:9px sans-serif;color:#8ea4ad;z-index:100;pointer-events:none";
document.body.append(badge);
