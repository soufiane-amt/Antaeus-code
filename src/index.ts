import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { runAgent } from "./agent/loop";
import { loadSession } from "./agent/load";

export const rl = readline.createInterface({ input, output });

async function main() {
  const messages: Anthropic.MessageParam[] = [];

  console.log('Coding Agent started. Type "exit" to quit.\n');

  try {
    while (true) {
      const userInput = await rl.question("> ");

      const prompt = userInput.trim();

      // Exit
      if (prompt.toLowerCase() === "exit") {
        break;
      }

      // Ignore empty input
      if (!prompt) {
        continue;
      }

      // Commands
      if (prompt === "/resume") {
        const loaded = loadSession();

        if (loaded.length === 0) {
          console.log("No previous session found.");
        } else {
          messages.push(...loaded);
          console.log(
            `Loaded ${loaded.length} messages from previous session.`,
          );
        }

        continue;
      }

      if (prompt === "/new") {
        messages.length = 0;
        console.log("Started new session.");
        continue;
      }

      // Normal user message
      messages.push({
        role: "user",
        content: prompt,
      });

      try {
        await runAgent(messages);
      } catch (error) {
        console.error("Agent error:", error);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch(console.error);