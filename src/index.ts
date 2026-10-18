import { runRepl } from "./repl";
import { startTui } from "./tui/index";

// --continue resumes the latest session, --resume <n|id> a specific one,
// --plain uses the line-based REPL instead of the TUI.
const args = process.argv.slice(2);
const resumeIdx = args.indexOf("--resume");
const startRef = args.includes("--continue")
  ? "1"
  : resumeIdx !== -1
    ? args[resumeIdx + 1]
    : undefined;

const usePlain = args.includes("--plain") || !process.stdin.isTTY;

(usePlain ? runRepl(startRef) : startTui(startRef)).catch((error) => {
  console.error(error);
  process.exit(1);
});
