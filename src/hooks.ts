import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { commandText, getPoints, getStatus, listPorts, send } from "./api";
import { now, showIoa } from "./format";
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

export function useLink() {
  const [ports, setPorts] = useState<string[]>([]);
  const [port, setPort] = useState("");
  const [baudRate, setBaudRate] = useState(115200);
  const [status, setStatus] = useState<Status>(INITIAL_STATUS);
  const [points, setPoints] = useState<Point[]>([]);
  const [values, setValues] = useState<Record<number, Value>>({});
  const [raw, setRaw] = useState<Raw[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [notice, setNotice] = useState("等待连接串口");
  const [adjustments, setAdjustments] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [pendingControl, setPendingControl] = useState<number | null>(null);
  const pendingControlRef = useRef<number | null>(null);

  const refreshPorts = async () => {
    try {
      const p = await listPorts();
      setPorts(p);
      setPort((v) => v || p[0] || "");
    } catch (e) {
      setNotice(String(e));
    }
  };

  const run = async (name: string, args?: Record<string, unknown>) => {
    try {
      await send(name, args);
      if (name === "connect" || name === "disconnect") setStatus(await getStatus());
      setNotice(now() + " " + commandText(name));
      return true;
    } catch (e) {
      setNotice(String(e));
      return false;
    }
  };

  const control = async (ioa: number, select: boolean) => {
    if (!select && selected !== ioa) {
      setNotice("请先选择同一控制点并等待确认");
      return;
    }
    if (!select && !window.confirm("确认执行 " + showIoa(ioa) + "？")) return;
    if (await run("control", { ioa, select })) {
      if (select) {
        pendingControlRef.current = ioa;
        setPendingControl(ioa);
        setSelected(null);
      } else {
        setSelected(null);
      }
    }
  };

  const adjust = (ioa: number, preset: boolean, cancel: boolean) =>
    run("adjust", { ioa, value: Number(adjustments[ioa]), preset, cancel });

  useEffect(() => {
    refreshPorts();
    getPoints().then(setPoints).catch((e) => setNotice(String(e)));
    getStatus().then(setStatus).catch((e) => setNotice(String(e)));

    let unlisten: (() => void)[] = [];
    Promise.all([
      listen<Status>("link-status", (e) => {
        setStatus(e.payload);
        if (e.payload.error) setNotice(e.payload.error);
      }),
      listen<Raw>("raw-message", (e) => setRaw((v) => [e.payload, ...v].slice(0, 300))),
      listen<Frame>("parsed-frame", (e) => {
        const f = e.payload;
        setFrames((v) => [f, ...v].slice(0, 120));
        if (f.error) setNotice(f.error);
        if (!f.objects.length) return;
        setValues((v) => {
          const n = { ...v };
          f.objects.forEach((o) => {
            n[o.ioa] = { value: o.value, raw: o.raw, quality: o.quality, time: now() };
          });
          return n;
        });
        const pending = pendingControlRef.current;
        if (
          pending !== null &&
          f.ti_name === "C_SC_NA_1" &&
          f.cot_name === "激活确认" &&
          f.objects.some((o) => o.ioa === pending)
        ) {
          setSelected(pending);
          pendingControlRef.current = null;
          setPendingControl(null);
          setNotice("收到选择确认，可执行该控制点");
        }
      }),
    ]).then((v) => {
      unlisten = v;
    });
    return () => unlisten.forEach((f) => f());
  }, []);

  return {
    ports, port, setPort, baudRate, setBaudRate, status, points, values, raw, frames,
    notice, adjustments, setAdjustments, selected, pendingControl,
    refreshPorts, run, control, adjust,
  };
}

export type Link = ReturnType<typeof useLink>;
