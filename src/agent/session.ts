import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";

export const SESSIONS_DIR = ".agent/sessions";
const LEGACY_SESSION_FILE = ".agent/session.jsonl";

export interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: Date;
}

function sessionPath(id: string): string {
  return path.join(SESSIONS_DIR, `${id}.jsonl`);
}

// Sortable ids like 20261018-143005-a1b2
function createSessionId(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${stamp}-${randomBytes(2).toString("hex")}`;
}

// Moves the old single-file session into the sessions directory once.
function migrateLegacySession(): void {
  if (!fs.existsSync(LEGACY_SESSION_FILE)) {
    return;
  }

  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const mtime = fs.statSync(LEGACY_SESSION_FILE).mtime;
  fs.renameSync(LEGACY_SESSION_FILE, sessionPath(createSessionId(mtime)));
}

function saveMessage(sessionId: string, message: Anthropic.MessageParam): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.appendFileSync(sessionPath(sessionId), JSON.stringify(message) + "\n");
}

function loadSession(sessionId: string): Anthropic.MessageParam[] {
  const file = sessionPath(sessionId);

  if (!fs.existsSync(file)) {
    return [];
  }

  const content = fs.readFileSync(file, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  return lines.map((line) => JSON.parse(line));
}

function sessionTitle(messages: Anthropic.MessageParam[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue;

    const text =
      typeof message.content === "string"
        ? message.content
        : message.content
            .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
            .map((b) => b.text)
            .join(" ");

    if (text.trim()) {
      const oneLine = text.trim().replace(/\s+/g, " ");
      return oneLine.length > 60 ? oneLine.slice(0, 57) + "..." : oneLine;
    }
  }

  return "(no user messages)";
}

// Most recently updated first.
function listSessions(): SessionInfo[] {
  migrateLegacySession();

  if (!fs.existsSync(SESSIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const id = f.replace(/\.jsonl$/, "");
      const messages = loadSession(id);
      return {
        id,
        title: sessionTitle(messages),
        messageCount: messages.length,
        updatedAt: fs.statSync(sessionPath(id)).mtime,
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

// Accepts a list number (1 = most recent), a full id, or a unique id prefix.
function resolveSession(ref: string): SessionInfo | undefined {
  const sessions = listSessions();

  if (/^\d+$/.test(ref)) {
    const byIndex = sessions[Number(ref) - 1];
    if (byIndex) return byIndex;
  }

  const exact = sessions.find((s) => s.id === ref);
  if (exact) return exact;

  const matches = sessions.filter((s) => s.id.startsWith(ref));
  return matches.length === 1 ? matches[0] : undefined;
}

function deleteSession(sessionId: string): void {
  fs.rmSync(sessionPath(sessionId), { force: true });
}

export {
  createSessionId,
  saveMessage,
  loadSession,
  listSessions,
  resolveSession,
  deleteSession,
};
