export type Point = { ioa: number; name: string; kind: string; unit: string; hint?: string; scale?: number | null; readback?: boolean };
export type Value = {
  value: string;
  quality: string;
  raw: string;
  time: string;
  stale?: boolean;
};
export type Raw = { direction: string; hex: string; timestamp: string };
export type Obj = { ioa: number; value: string; raw: string; quality: string };
export type Frame = {
  direction: "RX" | "TX";
  accepted: boolean;
  format: string;
  ti_name: string;
  ns: number | null;
  nr: number | null;
  cot: number | null;
  cot_name: string;
  objects: Obj[];
  error: string | null;
};
export type Status = {
  serialConnected: boolean;
  protocolState: string;
  started: boolean;
  port: string | null;
  baudRate: number | null;
  ns: number;
  nr: number;
  error: string | null;
};
