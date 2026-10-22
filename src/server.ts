import readline from "node:readline";
import Anthropic from "@anthropic-ai/sdk";
import { ChatSession } from "./agent/chat";
import { AgentEvents, MODEL, ToolEvent } from "./agent/loop";
import { resolveSession } from "./agent/session";
import { setLogSink } from "./utils/logger";
import { estimateTokens } from "./utils/utils";

// Headless mode for editor integrations (--stdio).
// Speaks newline-delimited JSON: requests on stdin, events on stdout.

type Decision = "yes" | "always" | "no";

type Request =
  | { type: "prompt"; text: string; context?: string }
  | { type: "command"; text: string }
  | { type: "approval"; requestId: number; decision: Decision }
  | { type: "interrupt" };

export type TranscriptEntry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "done" | "error";
      result: string;
    };

const CONTEXT_TAG = /\n*<ide_context>[\s\S]*?<\/ide_context>\s*$/;

// Rebuilds a displayable transcript from a saved conversation.
function toTranscript(messages: Anthropic.MessageParam[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const tools = new Map<string, Extract<TranscriptEntry, { kind: "tool" }>>();

  for (const message of messages) {
    const role = message.role;
    if (role !== "user" && role !== "assistant") continue;

    if (typeof message.content === "string") {
      const text = message.content.replace(CONTEXT_TAG, "");
      if (text.trim()) entries.push({ kind: role, text });
      continue;
    }

    for (const block of message.content) {
      if (block.type === "text" && block.text.trim()) {
        entries.push({ kind: role, text: block.text });
      } else if (block.type === "tool_use") {
        const tool = {
          kind: "tool" as const,
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
          status: "error" as "done" | "error",
          result: "No result recorded",
        };
        tools.set(block.id, tool);
        entries.push(tool);
      } else if (block.type === "tool_result") {
        const tool = tools.get(block.tool_use_id);
        if (tool) {
          tool.status = block.is_error ? "error" : "done";
          tool.result =
            typeof block.content === "string" ? block.content : JSON.stringify(block.content);
        }
      }
    }
  }

  return entries;
}

function formatError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    const body = error.error as { error?: { message?: string } } | undefined;
    const message = body?.error?.message ?? error.message;
    return `API error${error.status ? ` ${error.status}` : ""}: ${message}`.replace(/\s+/g, " ");
  }
  return error instanceof Error ? error.message : String(error);
}

export async function runServer(startRef?: string): Promise<void> {
  // stdout carries the protocol; anything else printed goes to stderr
  const out = process.stdout.write.bind(process.stdout);
  console.log = (...args: unknown[]) => console.error(...args);

  const send = (event: Record<string, unknown>) => out(JSON.stringify(event) + "\n");

  const chat = new ChatSession();
  if (startRef) {
    const found = resolveSession(startRef);
    if (found) chat.switchTo(found.id);
  }

  const autoApprove = new Set<string>();
  const pending = new Map<number, (decision: Decision) => void>();
  let nextRequestId = 1;
  let abort: AbortController | null = null;

  const tokens = () => (chat.messages.length > 0 ? estimateTokens(chat.messages) : 0);

  const sessionState = () => ({
    sessionId: chat.id,
    history: toTranscript(chat.messages),
    tokens: tokens(),
  });

  setLogSink((text, level) => send({ type: "log", text, level }));

  const events = (signal: AbortSignal): AgentEvents => ({
    signal,
    onTextDelta: (text) => send({ type: "text_delta", text }),
    onAssistantMessage: (text) => send({ type: "assistant_message", text }),
    onToolStart: (tool) => send({ type: "tool_start", tool }),
    onToolEnd: (tool, result, isError) => send({ type: "tool_end", tool, result, isError }),
    requestApproval(tool: ToolEvent) {
      if (autoApprove.has(tool.name)) return Promise.resolve(true);
      const requestId = nextRequestId++;
      send({ type: "approval_request", requestId, tool });
      return new Promise<boolean>((resolve) => {
        pending.set(requestId, (decision) => {
          if (decision === "always") autoApprove.add(tool.name);
          resolve(decision !== "no");
        });
      });
    },
  });

  const runPrompt = async (text: string, context?: string) => {
    if (abort) {
      send({ type: "error", text: "The agent is already running." });
      return;
    }

    const controller = new AbortController();
    abort = controller;
    send({ type: "busy" });

    const prompt = context ? `${text}\n\n<ide_context>\n${context}\n</ide_context>` : text;
    let result = "";

    try {
      result = await chat.send(prompt, events(controller.signal));
    } catch (error) {
      if (!controller.signal.aborted) send({ type: "error", text: formatError(error) });
    } finally {
      // Anything still waiting on the user is moot now
      for (const resolve of pending.values()) resolve("no");
      pending.clear();
      abort = null;
      send({
        type: "done",
        interrupted: controller.signal.aborted,
        limitReached: result.startsWith("Agent stopped because") ? result : undefined,
        tokens: tokens(),
      });
    }
  };

  const runCommand = (text: string) => {
    if (abort) {
      send({ type: "error", text: "Wait for the agent to finish, or interrupt it first." });
      return;
    }

    const result = chat.runCommand(text);

    if (result.type === "switched") {
      autoApprove.clear();
      send({ type: "switched", text: result.text, ...sessionState() });
    } else if (result.type === "sessions") {
      send({
        type: "sessions",
        currentId: result.currentId,
        sessions: result.sessions.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() })),
      });
    } else {
      send({ type: "command_result", result });
    }
  };

  const handle = (request: Request) => {
    switch (request.type) {
      case "prompt":
        void runPrompt(request.text, request.context);
        return;
      case "command":
        runCommand(request.text);
        return;
      case "approval": {
        const resolve = pending.get(request.requestId);
        pending.delete(request.requestId);
        resolve?.(request.decision);
        return;
      }
      case "interrupt":
        abort?.abort();
        for (const resolve of pending.values()) resolve("no");
        pending.clear();
        return;
    }
  };

  send({ type: "ready", model: MODEL, cwd: process.cwd(), ...sessionState() });

  const rl = readline.createInterface({ input: process.stdin });

  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      handle(JSON.parse(line) as Request);
    } catch (error) {
      send({ type: "error", text: `Bad request: ${formatError(error)}` });
    }
  });

  await new Promise<void>((resolve) =>
    rl.on("close", () => {
      abort?.abort();
      resolve();
    }),
  );
}
