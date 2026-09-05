import Anthropic from "@anthropic-ai/sdk";
import { SESSION_FILE } from "./save";
import * as fs from "fs";

function loadSession(): Anthropic.MessageParam[] {
  if (!fs.existsSync(SESSION_FILE)) {
    return [];
  }

  const content = fs.readFileSync(SESSION_FILE, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  return lines.map((line) => JSON.parse(line));
}
export { loadSession };