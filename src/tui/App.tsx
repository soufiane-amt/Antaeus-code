import React, { useEffect, useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import Anthropic from "@anthropic-ai/sdk";
import { ChatSession } from "../agent/chat";
import { AgentEvents, MODEL, ToolEvent } from "../agent/loop";
import { estimateTokens } from "../utils/utils";
import { setLogSink } from "../utils/logger";
import { Approval, ApprovalChoice } from "./Approval";
import { ChatItem } from "./Chat";
import { Input } from "./Input";
import { AssistantMessage } from "./Message";
import { WorkingIndicator } from "./Spinner";
import { theme } from "./theme";
import { ToolCall } from "./ToolCall";
import { Item, nextId, ToolItem } from "./types";

// Rebuilds the on-screen transcript from a saved conversation.
function messagesToItems(messages: Anthropic.MessageParam[]): Item[] {
  const items: Item[] = [];
  const tools = new Map<string, ToolItem>();

  for (const message of messages) {
    const role = message.role === "user" ? "user" : "assistant";

    if (typeof message.content === "string") {
      if (message.content.trim()) items.push({ type: role, id: nextId(), text: message.content });
      continue;
    }

    for (const block of message.content) {
      if (block.type === "text" && block.text.trim()) {
        items.push({ type: role, id: nextId(), text: block.text });
      } else if (block.type === "tool_use") {
        const tool: ToolItem = {
          type: "tool",
          id: nextId(),
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
          depth: 0,
          status: "running",
        };
        tools.set(block.id, tool);
        items.push(tool);
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

  for (const tool of tools.values()) {
    if (tool.status === "running") {
      tool.status = "error";
      tool.result = "No result recorded";
    }
  }

  return items;
}

function bannerFor(chat: ChatSession): Item {
  return {
    type: "banner",
    id: nextId(),
    sessionId: chat.id,
    resumed: chat.messages.length,
  };
}

// API errors carry a JSON body; show just its message
function formatError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    const body = error.error as { error?: { message?: string } } | undefined;
    const message = body?.error?.message ?? error.message;
    return `API error ${error.status ?? ""}: ${message}`.replace(/\s+/g, " ");
  }
  return error instanceof Error ? error.message : String(error);
}

function countTokens(messages: Anthropic.MessageParam[]): number {
  return messages.length > 0 ? estimateTokens(messages) : 0;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

interface PendingApproval {
  tool: ToolEvent;
  resolve: (approved: boolean) => void;
}

export function App({ chat }: { chat: ChatSession }) {
  const { exit } = useApp();

  const [items, setItems] = useState<Item[]>(() => [
    bannerFor(chat),
    ...messagesToItems(chat.messages),
  ]);
  // Changing the key remounts <Static>, which re-prints the whole transcript
  const [staticKey, setStaticKey] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [liveTools, setLiveTools] = useState<ToolItem[]>([]);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [tokens, setTokens] = useState(() => countTokens(chat.messages));

  const abortRef = useRef<AbortController | null>(null);
  const autoApprove = useRef(new Set<string>());
  const textBuffer = useRef("");
  const flushTimer = useRef<NodeJS.Timeout | null>(null);
  const toolsRef = useRef<ToolItem[]>([]);

  const push = (...newItems: Item[]) => setItems((prev) => [...prev, ...newItems]);

  useEffect(() => {
    setLogSink((message) => push({ type: "info", id: nextId(), text: message }));
  }, []);

  useInput(
    (_input, key) => {
      if (key.escape) abortRef.current?.abort();
    },
    { isActive: running && !approval },
  );

  const flushText = () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const text = textBuffer.current;
    textBuffer.current = "";
    setLiveText("");
    return text;
  };

  // Finished tools move into the static transcript once nothing is running
  const syncTools = () => {
    const current = toolsRef.current;
    if (current.length > 0 && current.every((t) => t.status !== "running")) {
      push(...current);
      toolsRef.current = [];
    }
    setLiveTools([...toolsRef.current]);
  };

  const events = (signal: AbortSignal): AgentEvents => ({
    signal,
    onTextDelta(text) {
      textBuffer.current += text;
      flushTimer.current ??= setTimeout(() => {
        flushTimer.current = null;
        setLiveText(textBuffer.current);
      }, 40);
    },
    onAssistantMessage(text) {
      flushText();
      if (text.trim()) push({ type: "assistant", id: nextId(), text });
    },
    onToolStart(tool) {
      toolsRef.current = [
        ...toolsRef.current,
        { type: "tool", ...tool, status: "running" },
      ];
      setLiveTools([...toolsRef.current]);
    },
    onToolEnd(tool, result, isError) {
      toolsRef.current = toolsRef.current.map((t) =>
        t.id === tool.id ? { ...t, status: isError ? "error" : "done", result } : t,
      );
      syncTools();
    },
    requestApproval(tool) {
      if (autoApprove.current.has(tool.name)) return Promise.resolve(true);
      return new Promise((resolve) => setApproval({ tool, resolve }));
    },
  });

  const decide = (choice: ApprovalChoice) => {
    if (!approval) return;
    setApproval(null);
    if (choice === "always") autoApprove.current.add(approval.tool.name);
    if (choice === "interrupt") abortRef.current?.abort();
    approval.resolve(choice === "yes" || choice === "always");
  };

  const runPrompt = async (prompt: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setStartedAt(Date.now());

    try {
      const result = await chat.send(prompt, events(controller.signal));
      if (result.startsWith("Agent stopped because")) {
        push({ type: "info", id: nextId(), text: result });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        push({
          type: "error",
          id: nextId(),
          text: formatError(error),
        });
      }
    } finally {
      const partial = flushText();
      if (partial.trim()) push({ type: "assistant", id: nextId(), text: partial });

      toolsRef.current = toolsRef.current.map((t) =>
        t.status === "running" ? { ...t, status: "error", result: "Interrupted" } : t,
      );
      syncTools();

      if (controller.signal.aborted) {
        push({ type: "info", id: nextId(), text: "Interrupted by user" });
      }

      abortRef.current = null;
      setRunning(false);
      setTokens(countTokens(chat.messages));
    }
  };

  const handleSubmit = (raw: string) => {
    const value = raw.trim();
    if (!value) return;

    setInputHistory((h) => [...h, value]);

    if (value === "exit" || value === "quit") {
      exit();
      return;
    }

    if (!value.startsWith("/")) {
      push({ type: "user", id: nextId(), text: value });
      void runPrompt(value);
      return;
    }

    const result = chat.runCommand(value);

    switch (result.type) {
      case "exit":
        exit();
        return;
      case "switched":
        // Clear the screen and scrollback, then redraw the new conversation
        process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
        autoApprove.current.clear();
        setItems([
          bannerFor(chat),
          ...messagesToItems(chat.messages),
          { type: "info", id: nextId(), text: result.text },
        ]);
        setStaticKey((k) => k + 1);
        setTokens(countTokens(chat.messages));
        return;
      case "help":
        push({ type: "user", id: nextId(), text: value }, { type: "help", id: nextId() });
        return;
      case "sessions":
        push(
          { type: "user", id: nextId(), text: value },
          { type: "sessions", id: nextId(), sessions: result.sessions, currentId: result.currentId },
        );
        return;
      default:
        push({ type: "user", id: nextId(), text: value }, { ...result, id: nextId() });
    }
  };

  const label = liveTools.some((t) => t.status === "running")
    ? "Working"
    : liveText
      ? "Writing"
      : "Thinking";

  return (
    <Box flexDirection="column">
      <Static key={staticKey} items={items}>
        {(item) => <ChatItem key={item.id} item={item} />}
      </Static>

      {liveText ? <AssistantMessage text={liveText} /> : null}
      {liveTools.map((tool) => (
        <ToolCall key={tool.id} item={tool} />
      ))}

      {approval ? <Approval tool={approval.tool} onDecide={decide} /> : null}

      {running && !approval ? (
        <Box marginTop={1}>
          <WorkingIndicator label={label} startedAt={startedAt} />
        </Box>
      ) : null}

      {!approval ? (
        <Box marginTop={1} flexDirection="column">
          <Input onSubmit={handleSubmit} disabled={running} history={inputHistory} />
          <Box justifyContent="space-between" paddingX={2}>
            <Text color={theme.dim}>
              <Text color={theme.accent2}>{MODEL}</Text> · ~{formatTokens(tokens)} tokens ·{" "}
              {chat.id}
            </Text>
            <Text color={theme.dim}>/help · ctrl+c quit</Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
