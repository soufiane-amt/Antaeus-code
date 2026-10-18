// Status messages from deep inside the agent (compaction, subagents).
// The plain REPL prints them; the TUI swaps in its own sink.
type LogSink = (message: string) => void;

let sink: LogSink = (message) => console.log(`  ${message}`);

export function setLogSink(next: LogSink): void {
  sink = next;
}

export function log(message: string): void {
  sink(message);
}
