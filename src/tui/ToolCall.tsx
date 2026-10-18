import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "./Spinner";
import { theme } from "./theme";
import { ToolItem } from "./types";

const LABELS: Record<string, string> = {
  read_file: "Read",
  list_directory: "List",
  search_files: "Search",
  write_file: "Write",
  edit_file: "Edit",
  run_command: "Run",
  verify: "Verify",
  git_diff: "Git diff",
  subagent: "Subagent",
  web_fetch: "Fetch",
  web_search: "Web search",
};

export function toolLabel(name: string): string {
  return LABELS[name] ?? name;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

export function toolArgs(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "read_file":
    case "write_file":
    case "edit_file":
      return str(input.path);
    case "list_directory":
      return str(input.directory) || ".";
    case "search_files":
      return `"${str(input.pattern)}"` + (input.directory ? ` in ${str(input.directory)}` : "");
    case "run_command":
    case "verify":
      return str(input.command);
    case "subagent":
      return str(input.prompt);
    case "web_fetch":
      return str(input.url);
    case "web_search":
      return str(input.query);
    case "git_diff":
      return "";
    default:
      return JSON.stringify(input);
  }
}

function lines(text: string): string[] {
  return text.replace(/\n+$/, "").split("\n");
}

function plural(n: number, word: string, many = word + "s"): string {
  return `${n} ${n === 1 ? word : many}`;
}

// Red/green preview of an edit_file change.
export function DiffPreview({
  oldText,
  newText,
  maxLines = 8,
}: {
  oldText: string;
  newText: string;
  maxLines?: number;
}) {
  const removed = lines(oldText);
  const added = lines(newText);

  const section = (rows: string[], sign: string, color: string, bg: string) => (
    <>
      {rows.slice(0, maxLines).map((row, i) => (
        <Text key={sign + i} color={color} backgroundColor={bg}>
          {` ${sign} ${row} `}
        </Text>
      ))}
      {rows.length > maxLines ? (
        <Text color={theme.dim}>{`   … ${rows.length - maxLines} more lines`}</Text>
      ) : null}
    </>
  );

  return (
    <Box flexDirection="column">
      {section(removed, "-", "#FCA5A5", "#3B1219")}
      {section(added, "+", "#86EFAC", "#0F2E1C")}
    </Box>
  );
}

function ResultSummary({ item }: { item: ToolItem }) {
  const result = item.result ?? "";

  if (item.status === "running") {
    return <Text color={theme.dim}>Running…</Text>;
  }

  if (item.status === "error") {
    if (result.startsWith("The user denied")) {
      return <Text color={theme.warning}>Denied by user</Text>;
    }
    return <Text color={theme.error}>{truncate(lines(result)[0] ?? "Failed", 100)}</Text>;
  }

  switch (item.name) {
    case "read_file":
      return <Text color={theme.dim}>Read {plural(lines(result).length, "line")}</Text>;
    case "list_directory":
      return <Text color={theme.dim}>{plural(lines(result).filter(Boolean).length, "entry", "entries")}</Text>;
    case "search_files": {
      const n = /no matches/i.test(result) ? 0 : lines(result).filter(Boolean).length;
      return <Text color={theme.dim}>Found {plural(n, "match", "matches")}</Text>;
    }
    case "write_file":
      return (
        <Text color={theme.dim}>
          Wrote {plural(lines(str(item.input.content)).length, "line")}
        </Text>
      );
    case "edit_file":
      return (
        <DiffPreview
          oldText={str(item.input.oldText)}
          newText={str(item.input.newText)}
          maxLines={4}
        />
      );
    case "run_command":
    case "verify": {
      const output = lines(result).filter((l) => l.trim() && !/^(STDOUT|STDERR):$/.test(l));
      const tail = output.slice(-4);
      return (
        <Box flexDirection="column">
          {output.length > 4 ? (
            <Text color={theme.dim}>… {output.length - 4} more lines</Text>
          ) : null}
          {tail.map((l, i) => (
            <Text key={i} color={theme.dim}>
              {truncate(l, 110)}
            </Text>
          ))}
        </Box>
      );
    }
    default:
      return <Text color={theme.dim}>{truncate(lines(result)[0] ?? "Done", 100)}</Text>;
  }
}

export function ToolCall({ item }: { item: ToolItem }) {
  const icon =
    item.status === "running" ? (
      <Spinner color={theme.accent2} />
    ) : (
      <Text color={item.status === "done" ? theme.success : theme.error}>●</Text>
    );

  const args = toolArgs(item.name, item.input);

  return (
    <Box flexDirection="column" marginLeft={item.depth * 2} marginTop={item.depth ? 0 : 1}>
      <Text>
        {icon} <Text bold>{toolLabel(item.name)}</Text>
        {args ? <Text color={theme.muted}>({truncate(args, 80)})</Text> : null}
      </Text>
      <Box flexDirection="row">
        <Text color={theme.dim}>  ⎿  </Text>
        <ResultSummary item={item} />
      </Box>
    </Box>
  );
}
