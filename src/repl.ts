import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { ChatSession, COMMANDS } from "./agent/chat";
import { resolveSession } from "./agent/session";
import { AgentEvents } from "./agent/loop";

// Plain line-based interface, used with --plain or when stdin is not a TTY.
export async function runRepl(startRef?: string) {
  const rl = readline.createInterface({ input, output });
  const chat = new ChatSession();

  if (startRef) {
    const found = resolveSession(startRef);
    if (found) {
      chat.switchTo(found.id);
      console.log(`Resumed session ${found.id} (${chat.messages.length} messages).`);
    } else {
      console.log(`Session "${startRef}" not found. Starting a new one.`);
    }
  }

  const events: AgentEvents = {
    onTextDelta: (text) => process.stdout.write(text),
    onAssistantMessage: (text) => {
      if (text) process.stdout.write("\n\n");
    },
    onToolStart: (tool) => {
      const indent = "  ".repeat(tool.depth);
      console.log(`${indent}→ ${tool.name} ${JSON.stringify(tool.input).slice(0, 100)}`);
    },
    onToolEnd: (tool, _result, isError) => {
      if (isError) console.log(`${"  ".repeat(tool.depth)}✗ ${tool.name} failed`);
    },
    async requestApproval(tool) {
      if (tool.name === "run_command") {
        console.log("\n⚠️ Agent wants to run:");
        console.log(`$ ${tool.input.command}`);
      } else {
        console.log("\n⚠️ Agent wants to modify:");
        console.log(tool.input);
      }
      const answer = await rl.question("Allow this action? (y/n): ");
      return answer.trim().toLowerCase() === "y";
    },
  };

  console.log(
    `Coding Agent started (session ${chat.id}). Type "/help" for commands, "exit" to quit.\n`,
  );

  try {
    while (true) {
      const prompt = (await rl.question("> ")).trim();

      if (prompt.toLowerCase() === "exit") break;
      if (!prompt) continue;

      if (prompt.startsWith("/")) {
        const result = chat.runCommand(prompt);
        if (result.type === "exit") break;
        if (result.type === "help") {
          for (const c of COMMANDS) {
            console.log(`  ${`${c.name} ${c.args}`.padEnd(18)}${c.description}`);
          }
        } else if (result.type === "sessions") {
          if (result.sessions.length === 0) console.log("No saved sessions.");
          result.sessions.forEach((s, i) => {
            const marker = s.id === result.currentId ? "*" : " ";
            console.log(
              `${marker} ${String(i + 1).padStart(2)}. ${s.id}  ${s.updatedAt.toLocaleString()}  ` +
                `(${s.messageCount} msgs)  ${s.title}`,
            );
          });
        } else {
          console.log(result.text);
        }
        continue;
      }

      try {
        await chat.send(prompt, events);
      } catch (error) {
        console.error("Agent error:", error);
      }
    }
  } finally {
    rl.close();
  }
}
