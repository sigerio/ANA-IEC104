import { invoke } from "@tauri-apps/api/core";
import type { Point, Status } from "./types";

const COMMAND_TEXT: Record<string, string> = {
  connect: "物理串口已打开，已发送 STARTDT ACT，等待主从通信确认",
  disconnect: "物理串口已关闭",
  start: "已发送 STARTDT ACT，等待主从通信确认",
  stop: "已发送 STOPDT ACT，等待停止确认",
  general_interrogation: "已发送站总召唤",
};

export const listPorts = () => invoke<string[]>("list_ports");
export const getPoints = () => invoke<Point[]>("points");
export const getStatus = () => invoke<Status>("status");
export const send = (name: string, args?: Record<string, unknown>) => invoke(name, args);
export const commandText = (name: string) => COMMAND_TEXT[name] ?? "指令已发送";
