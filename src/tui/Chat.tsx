import React from "react";
import { Box, Text } from "ink";
import os from "node:os";
import { COMMANDS } from "../agent/chat";
import { MODEL } from "../agent/loop";
import { SessionInfo } from "../agent/session";
import { AssistantMessage, ErrorMessage, InfoMessage, UserMessage } from "./Message";
import { gradient, theme } from "./theme";
import { ToolCall } from "./ToolCall";
import { Item } from "./types";

// Two-row block font for the banner
const FONT: Record<string, [string, string]> = {
  C: ["█▀▀", "█▄▄"],
  O: ["█▀█", "█▄█"],
  D: ["█▀▄", "█▄▀"],
  I: ["█", "█"],
  N: ["█▄ █", "█ ▀█"],
  G: ["█▀▀", "█▄█"],
  A: ["▄▀█", "█▀█"],
  E: ["█▀▀", "██▄"],
  T: ["▀█▀", " █ "],
  " ": ["  ", "  "],
};

function bannerRows(text: string): [string, string] {
  const glyphs = [...text].map((ch) => FONT[ch] ?? FONT[" "]!);
  return [glyphs.map((g) => g[0]).join(" "), glyphs.map((g) => g[1]).join(" ")];
}

function shortCwd(): string {
  const cwd = process.cwd();
  const home = os.homedir();
  return cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
}

function Banner({ sessionId, resumed }: { sessionId: string; resumed: number }) {
  const [top, bottom] = bannerRows("CODING AGENT");
  const width = top.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.accent}
      paddingX={2}
      paddingY={1}
      alignSelf="flex-start"
    >
      <Text>{gradient(top, width)}</Text>
      <Text>{gradient(bottom, width)}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={theme.dim}>model    </Text>
          <Text color={theme.accent2}>{MODEL}</Text>
        </Text>
        <Text>
          <Text color={theme.dim}>cwd      </Text>
          <Text>{shortCwd()}</Text>
        </Text>
        <Text>
          <Text color={theme.dim}>session  </Text>
          <Text>{sessionId}</Text>
          {resumed > 0 ? <Text color={theme.dim}> · resumed {resumed} messages</Text> : null}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>
          <Text color={theme.muted}>/help</Text> for commands ·{" "}
          <Text color={theme.muted}>esc</Text> to interrupt ·{" "}
          <Text color={theme.muted}>ctrl+c</Text> to quit
        </Text>
      </Box>
    </Box>
  );
}

function Help() {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold>Commands</Text>
      {COMMANDS.map((c) => (
        <Text key={c.name}>
          {"  "}
          <Text color={theme.accent}>{c.name.padEnd(10)}</Text>
          <Text color={theme.dim}>{c.args.padEnd(8)}</Text>
          {c.description}
        </Text>
      ))}
    </Box>
  );
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function SessionList({ sessions, currentId }: { sessions: SessionInfo[]; currentId: string }) {
  if (sessions.length === 0) {
    return <InfoMessage text="No saved sessions yet." />;
  }

  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold>Sessions</Text>
      {sessions.map((s, i) => {
        const current = s.id === currentId;
        return (
          <Text key={s.id}>
            <Text color={current ? theme.accent2 : theme.dim}>{current ? " ● " : "   "}</Text>
            <Text color={theme.accent}>{String(i + 1).padStart(2)}. </Text>
            <Text>{(s.title.length > 40 ? s.title.slice(0, 39) + "…" : s.title).padEnd(40)}</Text>
            <Text color={theme.dim}>
              {"  "}
              {timeAgo(s.updatedAt).padEnd(9)} {String(s.messageCount).padStart(3)} msgs
            </Text>
          </Text>
        );
      })}
      <Text color={theme.dim}>   /resume {"<n>"} to switch · /delete {"<n>"} to remove</Text>
    </Box>
  );
}

export function ChatItem({ item }: { item: Item }) {
  switch (item.type) {
    case "banner":
      return <Banner sessionId={item.sessionId} resumed={item.resumed} />;
    case "user":
      return <UserMessage text={item.text} />;
    case "assistant":
      return <AssistantMessage text={item.text} />;
    case "tool":
      return <ToolCall item={item} />;
    case "info":
      return <InfoMessage text={item.text} />;
    case "error":
      return <ErrorMessage text={item.text} />;
    case "help":
      return <Help />;
    case "sessions":
      return <SessionList sessions={item.sessions} currentId={item.currentId} />;
  }
}
