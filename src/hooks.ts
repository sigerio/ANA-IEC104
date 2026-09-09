import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { commandText, getPoints, getStatus, listPorts, send } from "./api";
import { adjustmentError, now, showIoa } from "./format";
import type { Frame, Point, Raw, Status, Value } from "./types";

const INITIAL_STATUS: Status = {
  serialConnected: false,
  protocolState: "未建立",
  started: false,
  port: null,
  baudRate: null,
  ns: 0,
  nr: 0,
  error: null,
};
type Pending = {
  ioa: number;
  action: "选择" | "执行" | "预置" | "固化" | "取消" | "总召";
  value?: number;
  deadline: number;
};

export function useLink() {
  const [ports, setPorts] = useState<string[]>([]);
  const [port, setPort] = useState("");
  const [baudRate, setBaudRate] = useState(1000000);
  const [status, setStatus] = useState<Status>(INITIAL_STATUS);
  const [points, setPoints] = useState<Point[]>([]);
  const [values, setValues] = useState<Record<number, Value>>({});
  const [raw, setRaw] = useState<Raw[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [traffic, setTraffic] = useState({ rx: 0, tx: 0, lastRx: "—" });
  const [notice, setNotice] = useState(
    "连接串口后建立 IEC104 会话，再执行总召获取设备状态。",
  );
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [adjustments, setAdjustments] = useState<Record<number, string>>({});
  const [presets, setPresets] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const statusRef = useRef(INITIAL_STATUS);

  const updatePending = (p: Pending | null) => {
    pendingRef.current = p;
    setPending(p);
  };
  const applyStatus = (next: Status) => {
    statusRef.current = next;
    setStatus(next);
    if (next.serialConnected && next.port) {
      setPort(next.port);
      setBaudRate(next.baudRate || 1000000);
    }
    if (!next.started) {
      setSelected(null);
      setPresets({});
      updatePending(null);
      setValues((current) =>
        Object.fromEntries(
          Object.entries(current).map(([ioa, value]) => [
            ioa,
            { ...value, stale: true },
          ]),
        ),
      );
    }
    if (next.error) {
      setNotice(next.error);
      if (/失败|超时|异常|无效/.test(next.error)) setError(next.error);
    }
  };

  const refreshPorts = async () => {
    try {
      const available = await listPorts();
      setPorts(available);
      setPort((current) =>
        available.includes(current) ? current : available[0] || "",
      );
    } catch (e) {
      setError(String(e));
    }
  };

  const run = async (name: string, args?: Record<string, unknown>) => {
    if (!ready || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (name === "connect") {
        setValues({});
        setSelected(null);
        setPresets({});
      }
      if (name === "general_interrogation")
        updatePending({ ioa: 0, action: "总召", deadline: Date.now() + 15000 });
      setNotice(now() + " " + commandText(name));
      // 状态始终由后端事件驱动，避免异步查询覆盖较新的握手状态。
      await send(name, args);
      return true;
    } catch (e) {
      updatePending(null);
      setError(String(e));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const control = async (ioa: number, select: boolean) => {
    if (
      !ready ||
      busyRef.current ||
      pendingRef.current ||
      !statusRef.current.started
    )
      return;
    if (!select && selected !== ioa) {
      setError("请先选择同一控制点并等待确认");
      return;
    }
    const name = points.find((p) => p.ioa === ioa)?.name || showIoa(ioa);
    if (
      !select &&
      !window.confirm(
        `确认执行「${name}」？\n命令接受后，请通过设备遥信确认实际动作结果。`,
      )
    )
      return;
    setSelected(null);
    updatePending({
      ioa,
      action: select ? "选择" : "执行",
      deadline: Date.now() + 15000,
    });
    await run("control", { ioa, select });
  };

  const adjust = async (ioa: number, preset: boolean, cancel: boolean) => {
    if (
      !ready ||
      busyRef.current ||
      pendingRef.current ||
      !statusRef.current.started
    )
      return;
    const input = adjustments[ioa] || "";
    const invalid = adjustmentError(ioa, input);
    if (!cancel && invalid) {
      setError(invalid);
      return;
    }
    const value = cancel ? presets[ioa] : Number(input);
    if (value === undefined) return;
    if (!preset && !cancel && presets[ioa] !== value) {
      setError("请先预置当前数值并等待确认");
      return;
    }
    if (
      !preset &&
      !cancel &&
      !window.confirm(
        `确认固化「${points.find((p) => p.ioa === ioa)?.name}」为 ${value}？`,
      )
    )
      return;
    // 新的参数请求使旧许可失效，发送失败也不能沿用旧预置确认。
    setPresets((current) => {
      const next = { ...current };
      delete next[ioa];
      return next;
    });
    updatePending({
      ioa,
      action: cancel ? "取消" : preset ? "预置" : "固化",
      value,
      deadline: Date.now() + 15000,
    });
    await run("adjust", { ioa, value, preset, cancel });
  };

  useEffect(() => {
    let disposed = false;
    const unlisten: (() => void)[] = [];
    let statusRevision = 0;
    const register = async <T>(
      name: string,
      callback: (payload: T) => void,
    ) => {
      const off = await listen<T>(name, (event) => {
        if (!disposed) callback(event.payload);
      });
      if (disposed) off();
      else unlisten.push(off);
    };
    const initialize = async () => {
      try {
        await Promise.all([
          register<Status>("link-status", (next) => {
            statusRevision++;
            applyStatus(next);
          }),
          register<Raw>("raw-message", (message) => {
            const time = now();
            setRaw((current) =>
              [{ ...message, timestamp: time }, ...current].slice(0, 500),
            );
            setTraffic((current) => ({
              rx: current.rx + (message.direction === "RX" ? 1 : 0),
              tx: current.tx + (message.direction === "TX" ? 1 : 0),
              lastRx: message.direction === "RX" ? time : current.lastRx,
            }));
          }),
          register<Frame>("parsed-frame", (frame) => {
            setFrames((current) => [frame, ...current].slice(0, 200));
            if (frame.error) setError(frame.error);
            if (
              frame.direction !== "RX" ||
              !frame.accepted ||
              frame.error ||
              !statusRef.current.started
            )
              return;
            if (
              ["M_SP_NA_1", "M_DP_NA_1", "M_ME_NC_1"].includes(frame.ti_name) &&
              frame.cot !== null &&
              (frame.cot & 0xc0) === 0
            ) {
              setValues((current) => {
                const next = { ...current };
                frame.objects.forEach((obj) => {
                  next[obj.ioa] = { ...obj, time: now(), stale: false };
                });
                return next;
              });
            }
            const request = pendingRef.current;
            if (!request) return;
            const expectedType =
              request.action === "总召"
                ? "C_IC_NA_1"
                : ["选择", "执行"].includes(request.action)
                  ? "C_SC_NA_1"
                  : "C_WS_NA_1";
            if (
              frame.ti_name !== expectedType ||
              !frame.objects.some((obj) => obj.ioa === request.ioa)
            )
              return;
            const obj = frame.objects.find((item) => item.ioa === request.ioa)!;
            if (request.action === "总召" && frame.cot === 7) {
              setNotice("总召已确认，正在接收点位数据…");
              return;
            }
            const expectedCot = ["执行", "固化", "总召"].includes(
              request.action,
            )
              ? 10
              : 7;
            const commandMatches =
              request.action === "选择"
                ? obj.raw === "81"
                : request.action === "执行"
                  ? obj.raw === "01"
                  : true;
            const parameterMatches =
              request.value === undefined ||
              (Math.fround(Number(obj.value)) === Math.fround(request.value) &&
                obj.raw.startsWith(
                  request.action === "预置"
                    ? "01 "
                    : request.action === "取消"
                      ? "02 "
                      : "00 ",
                ));
            updatePending(null);
            if (
              frame.cot !== expectedCot ||
              !commandMatches ||
              !parameterMatches
            ) {
              setSelected(null);
              setPresets((current) => {
                const next = { ...current };
                delete next[request.ioa];
                return next;
              });
              setError(
                `${request.action}未成功：${frame.cot_name}，请重新开始选择或预置。`,
              );
              return;
            }
            if (request.action === "选择") setSelected(request.ioa);
            if (request.action === "预置")
              setPresets((current) => ({
                ...current,
                [request.ioa]: request.value!,
              }));
            if (["固化", "取消"].includes(request.action))
              setPresets((current) => {
                const next = { ...current };
                delete next[request.ioa];
                return next;
              });
            setNotice(
              request.action === "执行"
                ? "设备已接受动作请求，请通过遥信确认实际结果。"
                : request.action === "固化"
                  ? "设备已接受参数写入请求；请稍后总召核对实际回传值。"
                  : `${request.action}已确认${request.action === "选择" ? "，可执行该控制点" : ""}。`,
            );
          }),
        ]);
        const revision = statusRevision;
        const [definitions, initial] = await Promise.all([
          getPoints(),
          getStatus(),
        ]);
        if (disposed) return;
        setPoints(definitions);
        if (revision === statusRevision) applyStatus(initial);
        setReady(true);
        await refreshPorts();
      } catch (e) {
        if (!disposed) {
          setError(
            `通信初始化失败：${String(e)}。请确认在桌面应用中运行，并检查事件权限。`,
          );
          setReady(false);
        }
      }
    };
    void initialize();
    const timer = window.setInterval(() => {
      const request = pendingRef.current;
      if (request && Date.now() >= request.deadline) {
        updatePending(null);
        setSelected(null);
        setPresets((current) => {
          const next = { ...current };
          delete next[request.ioa];
          return next;
        });
        setError(
          `${request.action}确认超时，结果尚未确认；请检查通信记录并总召核对，避免重复执行动作。`,
        );
      }
    }, 500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      unlisten.forEach((off) => off());
    };
  }, []);

  return {
    ports,
    port,
    setPort,
    baudRate,
    setBaudRate,
    status,
    points,
    values,
    raw,
    frames,
    traffic,
    notice,
    error,
    setError,
    ready,
    busy,
    pending,
    presets,
    adjustments,
    setAdjustments,
    selected,
    refreshPorts,
    run,
    control,
    adjust,
    clearLogs: () => {
      setRaw([]);
      setFrames([]);
    },
  };
}
export type Link = ReturnType<typeof useLink>;
