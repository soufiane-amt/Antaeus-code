import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { ToolEvent } from "../agent/loop";
import { theme } from "./theme";
import { DiffPreview, toolArgs, toolLabel } from "./ToolCall";

export type ApprovalChoice = "yes" | "always" | "no" | "interrupt";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function Preview({ tool }: { tool: ToolEvent }) {
  switch (tool.name) {
    case "run_command":
      return (
        <Text>
          <Text color={theme.accent2}>$ </Text>
          {str(tool.input.command)}
        </Text>
      );
    case "edit_file":
      return (
        <Box flexDirection="column">
          <Text color={theme.muted}>{str(tool.input.path)}</Text>
          <DiffPreview
            oldText={str(tool.input.oldText)}
            newText={str(tool.input.newText)}
            maxLines={15}
          />
        </Box>
      );
    case "write_file": {
      const rows = str(tool.input.content).split("\n");
      return (
        <Box flexDirection="column">
          <Text color={theme.muted}>{str(tool.input.path)}</Text>
          {rows.slice(0, 12).map((row, i) => (
            <Text key={i}>
              <Text color={theme.dim}>{String(i + 1).padStart(3)} </Text>
              {row}
            </Text>
          ))}
          {rows.length > 12 ? (
            <Text color={theme.dim}>    … {rows.length - 12} more lines</Text>
          ) : null}
        </Box>
      );
    }
    default:
      return <Text>{toolArgs(tool.name, tool.input)}</Text>;
  }
}

const OPTIONS: { choice: ApprovalChoice; label: string }[] = [
  { choice: "yes", label: "Yes" },
  { choice: "always", label: "Yes, and don't ask again for this tool" },
  { choice: "no", label: "No, tell the agent to do something else" },
];

export function Approval({
  tool,
  onDecide,
}: {
  tool: ToolEvent;
  onDecide: (choice: ApprovalChoice) => void;
}) {
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) setSelected((s) => (s + OPTIONS.length - 1) % OPTIONS.length);
    else if (key.downArrow || key.tab) setSelected((s) => (s + 1) % OPTIONS.length);
    else if (key.return) onDecide(OPTIONS[selected]!.choice);
    else if (key.escape) onDecide("interrupt");
    else if (input === "y") onDecide("yes");
    else if (input === "a") onDecide("always");
    else if (input === "n") onDecide("no");
    else if (/^[1-3]$/.test(input)) onDecide(OPTIONS[Number(input) - 1]!.choice);
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.warning}
      paddingX={1}
      marginTop={1}
    >
      <Text color={theme.warning} bold>
        ⚠ {toolLabel(tool.name)}
        {tool.depth > 0 ? <Text color={theme.dim}> (subagent)</Text> : null}
      </Text>
      <Box marginY={1} flexDirection="column">
        <Preview tool={tool} />
      </Box>
      <Text>Allow this action?</Text>
      {OPTIONS.map((option, i) => (
        <Text key={option.choice} {...(i === selected ? { color: theme.accent2 } : {})}>
          {i === selected ? "❯ " : "  "}
          {i + 1}. {option.label}
        </Text>
      ))}
      <Text color={theme.dim}>↑↓ select · enter confirm · y/a/n · esc interrupt</Text>
    </Box>
  );
}
