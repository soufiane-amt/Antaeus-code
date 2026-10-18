import Anthropic from "@anthropic-ai/sdk";
import { AgentEvents, runAgent } from "./loop";
import {
  createSessionId,
  deleteSession,
  listSessions,
  loadSession,
  resolveSession,
  saveMessage,
  SessionInfo,
} from "./session";

export const COMMANDS = [
  { name: "/new", args: "", description: "Start a new session" },
  { name: "/sessions", args: "", description: "List saved sessions" },
  { name: "/resume", args: "[n|id]", description: "Resume a session (default: most recent)" },
  { name: "/delete", args: "<n|id>", description: "Delete a session" },
  { name: "/session", args: "", description: "Show the current session" },
  { name: "/help", args: "", description: "Show available commands" },
  { name: "/exit", args: "", description: "Quit" },
];

export type CommandResult =
  | { type: "info"; text: string }
  | { type: "error"; text: string }
  | { type: "sessions"; sessions: SessionInfo[]; currentId: string }
  | { type: "help" }
  // The conversation was replaced (new, resumed, or current one deleted)
  | { type: "switched"; text: string }
  | { type: "exit" };

// Holds the current conversation and session; shared by the TUI and the plain REPL.
export class ChatSession {
  messages: Anthropic.MessageParam[] = [];
  id = createSessionId();

  switchTo(id: string): void {
    this.id = id;
    this.messages = loadSession(id);
  }

  startNew(): void {
    this.id = createSessionId();
    this.messages = [];
  }

  async send(prompt: string, events: AgentEvents): Promise<string> {
    const userMessage: Anthropic.MessageParam = { role: "user", content: prompt };
    this.messages.push(userMessage);
    saveMessage(this.id, userMessage);
    return runAgent(this.messages, { sessionId: this.id, events });
  }

  runCommand(input: string): CommandResult {
    const [command, ref] = input.trim().split(/\s+/, 2);

    switch (command) {
      case "/help":
        return { type: "help" };

      case "/exit":
      case "/quit":
        return { type: "exit" };

      case "/new":
        this.startNew();
        return { type: "switched", text: `Started new session ${this.id}` };

      case "/sessions":
        return { type: "sessions", sessions: listSessions(), currentId: this.id };

      case "/session":
        return {
          type: "info",
          text: `Current session: ${this.id} (${this.messages.length} messages)`,
        };

      case "/resume": {
        const found = resolveSession(ref ?? "1");
        if (!found) {
          return {
            type: "error",
            text: ref
              ? `Session "${ref}" not found. Use /sessions to list them.`
              : "No previous session found.",
          };
        }
        this.switchTo(found.id);
        return {
          type: "switched",
          text: `Resumed session ${found.id} (${this.messages.length} messages)`,
        };
      }

      case "/delete": {
        const found = ref ? resolveSession(ref) : undefined;
        if (!found) {
          return { type: "error", text: "Usage: /delete <n|id>. Use /sessions to list them." };
        }
        deleteSession(found.id);
        if (found.id === this.id) {
          this.startNew();
          return {
            type: "switched",
            text: `Deleted current session ${found.id}. Started new session ${this.id}`,
          };
        }
        return { type: "info", text: `Deleted session ${found.id}` };
      }

      default:
        return { type: "error", text: `Unknown command: ${command}. Type /help for commands.` };
    }
  }
}
