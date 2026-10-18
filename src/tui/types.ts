import { SessionInfo } from "../agent/session";

export type ToolStatus = "running" | "done" | "error";

export interface ToolItem {
  type: "tool";
  id: string;
  name: string;
  input: Record<string, unknown>;
  depth: number;
  status: ToolStatus;
  result?: string;
}

export type Item =
  | { type: "banner"; id: string; sessionId: string; resumed: number }
  | { type: "user"; id: string; text: string }
  | { type: "assistant"; id: string; text: string }
  | ToolItem
  | { type: "info"; id: string; text: string }
  | { type: "error"; id: string; text: string }
  | { type: "help"; id: string }
  | { type: "sessions"; id: string; sessions: SessionInfo[]; currentId: string };

let counter = 0;
export function nextId(): string {
  return `item-${++counter}`;
}
