// Status messages from deep inside the agent (compaction, subagents, truncation).
// The plain REPL prints them; the TUI and the --stdio server swap in their own sinks.
export type LogLevel = "info" | "warning";

type LogSink = (message: string, level: LogLevel) => void;

let sink: LogSink = (message, level) =>
  console.log(`  ${level === "warning" ? "⚠ " : ""}${message}`);

export function setLogSink(next: LogSink): void {
  sink = next;
}

export function log(message: string, level: LogLevel = "info"): void {
  sink(message, level);
}
