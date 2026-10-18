import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { runAgent } from "./agent/loop";
import {
  createSessionId,
  deleteSession,
  listSessions,
  loadSession,
  resolveSession,
  saveMessage,
} from "./agent/session";

export const rl = readline.createInterface({ input, output });

const HELP = `Commands:
  /new              Start a new session
  /sessions         List saved sessions
  /resume [n|id]    Resume a session (default: most recent)
  /delete <n|id>    Delete a session
  /session          Show the current session id
  /help             Show this help
  exit              Quit`;

function printSessions(currentId: string) {
  const sessions = listSessions();

  if (sessions.length === 0) {
    console.log("No saved sessions.");
    return;
  }

  sessions.forEach((s, i) => {
    const marker = s.id === currentId ? "*" : " ";
    const when = s.updatedAt.toLocaleString();
    console.log(
      `${marker} ${String(i + 1).padStart(2)}. ${s.id}  ${when}  ` +
        `(${s.messageCount} msgs)  ${s.title}`,
    );
  });
}

async function main() {
  const messages: Anthropic.MessageParam[] = [];
  let sessionId = createSessionId();

  const switchTo = (id: string) => {
    sessionId = id;
    messages.length = 0;
    messages.push(...loadSession(id));
  };

  // --continue resumes the latest session, --resume <n|id> a specific one
  const args = process.argv.slice(2);
  const resumeIdx = args.indexOf("--resume");
  const startRef = args.includes("--continue")
    ? "1"
    : resumeIdx !== -1
      ? args[resumeIdx + 1]
      : undefined;

  if (startRef) {
    const found = resolveSession(startRef);
    if (found) {
      switchTo(found.id);
      console.log(`Resumed session ${found.id} (${messages.length} messages).`);
    } else {
      console.log(`Session "${startRef}" not found. Starting a new one.`);
    }
  }

  console.log(
    `Coding Agent started (session ${sessionId}). Type "/help" for commands, "exit" to quit.\n`,
  );

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
      if (prompt.startsWith("/")) {
        const [command, ref] = prompt.split(/\s+/, 2);

        if (command === "/help") {
          console.log(HELP);
          continue;
        }

        if (command === "/new") {
          sessionId = createSessionId();
          messages.length = 0;
          console.log(`Started new session ${sessionId}.`);
          continue;
        }

        if (command === "/sessions") {
          printSessions(sessionId);
          continue;
        }

        if (command === "/session") {
          console.log(`Current session: ${sessionId} (${messages.length} messages)`);
          continue;
        }

        if (command === "/resume") {
          const found = resolveSession(ref ?? "1");

          if (!found) {
            console.log(
              ref
                ? `Session "${ref}" not found. Use /sessions to list them.`
                : "No previous session found.",
            );
          } else {
            switchTo(found.id);
            console.log(
              `Resumed session ${found.id} (${messages.length} messages): ${found.title}`,
            );
          }
          continue;
        }

        if (command === "/delete") {
          const found = ref ? resolveSession(ref) : undefined;

          if (!found) {
            console.log("Usage: /delete <n|id>. Use /sessions to list them.");
          } else {
            deleteSession(found.id);
            if (found.id === sessionId) {
              sessionId = createSessionId();
              messages.length = 0;
              console.log(
                `Deleted current session ${found.id}. Started new session ${sessionId}.`,
              );
            } else {
              console.log(`Deleted session ${found.id}.`);
            }
          }
          continue;
        }

        console.log(`Unknown command: ${command}. Type /help for commands.`);
        continue;
      }

      // Normal user message
      const userMessage: Anthropic.MessageParam = {
        role: "user",
        content: prompt,
      };
      messages.push(userMessage);
      saveMessage(sessionId, userMessage);

      try {
        await runAgent(messages, sessionId);
      } catch (error) {
        console.error("Agent error:", error);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch(console.error);
