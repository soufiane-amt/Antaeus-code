import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";

export const SESSION_FILE = ".agent/session.jsonl";

function saveMessage(message: Anthropic.MessageParam): void {
  fs.mkdirSync(".agent", { recursive: true });
  const line = JSON.stringify(message) + "\n";
  fs.appendFileSync(SESSION_FILE, line);
}

export { saveMessage };
