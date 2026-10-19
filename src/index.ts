import { runRepl } from "./repl";
import { runServer } from "./server";
import { startTui } from "./tui/index";

// --continue resumes the latest session, --resume <n|id> a specific one,
// --plain uses the line-based REPL instead of the TUI,
// --stdio runs headless with a JSON protocol for editor integrations.
const args = process.argv.slice(2);
const resumeIdx = args.indexOf("--resume");
const startRef = args.includes("--continue")
  ? "1"
  : resumeIdx !== -1
    ? args[resumeIdx + 1]
    : undefined;

const usePlain = args.includes("--plain") || !process.stdin.isTTY;

const run = args.includes("--stdio")
  ? runServer(startRef)
  : usePlain
    ? runRepl(startRef)
    : startTui(startRef);

run.catch((error) => {
  console.error(error);
  process.exit(1);
});
