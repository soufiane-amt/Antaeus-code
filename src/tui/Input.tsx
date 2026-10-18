import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import chalk from "chalk";
import { COMMANDS } from "../agent/chat";
import { theme } from "./theme";

interface Props {
  onSubmit: (value: string) => void;
  disabled: boolean;
  history: string[];
}

function previousWordStart(value: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && value[i - 1] === " ") i--;
  while (i > 0 && value[i - 1] !== " ") i--;
  return i;
}

export function Input({ onSubmit, disabled, history }: Props) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selected, setSelected] = useState(0);

  const suggestions =
    value.startsWith("/") && !value.includes(" ")
      ? COMMANDS.filter((c) => c.name.startsWith(value)).sort(
          (a, b) => Number(b.name === value) - Number(a.name === value),
        )
      : [];
  const showSuggestions =
    suggestions.length > 1 || (suggestions.length === 1 && suggestions[0]!.name !== value);

  const set = (next: string, nextCursor = next.length) => {
    setValue(next);
    setCursor(nextCursor);
    setSelected(0);
  };

  const submit = (text: string) => {
    set("");
    setHistoryIndex(-1);
    onSubmit(text);
  };

  useInput(
    (input, key) => {
      if (key.return) {
        if (showSuggestions) {
          const command = suggestions[selected]!;
          if (command.args) set(command.name + " ");
          else submit(command.name);
        } else if (value.trim()) {
          submit(value);
        }
        return;
      }

      if (key.tab) {
        if (showSuggestions) set(suggestions[selected]!.name + " ");
        return;
      }

      if (key.upArrow) {
        if (showSuggestions) {
          setSelected((s) => (s + suggestions.length - 1) % suggestions.length);
        } else if (history.length > 0) {
          const next = Math.min(historyIndex + 1, history.length - 1);
          setHistoryIndex(next);
          const entry = history[history.length - 1 - next] ?? "";
          setValue(entry);
          setCursor(entry.length);
        }
        return;
      }

      if (key.downArrow) {
        if (showSuggestions) {
          setSelected((s) => (s + 1) % suggestions.length);
        } else if (historyIndex >= 0) {
          const next = historyIndex - 1;
          setHistoryIndex(next);
          const entry = next >= 0 ? (history[history.length - 1 - next] ?? "") : "";
          setValue(entry);
          setCursor(entry.length);
        }
        return;
      }

      if (key.leftArrow) return setCursor((c) => Math.max(0, c - 1));
      if (key.rightArrow) return setCursor((c) => Math.min(value.length, c + 1));

      // Many terminals report backspace as "delete"
      if (key.backspace || key.delete) {
        if (cursor > 0) set(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
        return;
      }

      if (key.ctrl) {
        if (input === "a") setCursor(0);
        else if (input === "e") setCursor(value.length);
        else if (input === "u") set(value.slice(cursor), 0);
        else if (input === "k") set(value.slice(0, cursor), cursor);
        else if (input === "w") {
          const start = previousWordStart(value, cursor);
          set(value.slice(0, start) + value.slice(cursor), start);
        }
        return;
      }

      if (key.escape || key.meta || !input) return;

      // Typed text or a paste; flatten pasted newlines
      const text = input.replace(/\r\n?|\n/g, " ");
      set(value.slice(0, cursor) + text + value.slice(cursor), cursor + text.length);
    },
    { isActive: !disabled },
  );

  const before = value.slice(0, cursor);
  const at = value[cursor] ?? " ";
  const after = value.slice(cursor + 1);

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={disabled ? theme.border : theme.accent}
        paddingX={1}
      >
        <Text color={disabled ? theme.dim : theme.accent} bold>
          ❯{" "}
        </Text>
        {value.length === 0 ? (
          <Text>
            {disabled ? (
              <Text color={theme.dim}>Waiting for the agent…</Text>
            ) : (
              <>
                {chalk.inverse(" ")}
                <Text color={theme.dim}>Ask anything, or type / for commands</Text>
              </>
            )}
          </Text>
        ) : (
          <Text>
            {before}
            {disabled ? at : chalk.inverse(at)}
            {after}
          </Text>
        )}
      </Box>
      {showSuggestions && !disabled ? (
        <Box flexDirection="column" paddingX={2}>
          {suggestions.map((c, i) => (
            <Text key={c.name} color={i === selected ? theme.accent2 : theme.dim}>
              {i === selected ? "❯ " : "  "}
              {c.name.padEnd(10)}
              {c.args.padEnd(8)}
              {c.description}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
