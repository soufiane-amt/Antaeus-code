import { z } from "zod";
import { Tool } from "./types";
import Anthropic from "@anthropic-ai/sdk";
import { getSubagentEvents, runAgent } from "../agent/loop";
import { log } from "../utils/logger";

async function runSubagent(prompt: string): Promise<string> {
  // Fresh messages, but the same UI for approvals and tool activity.
  // No sessionId, so the subagent's conversation is not persisted.
  const subagentMessages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  return runAgent(subagentMessages, { events: getSubagentEvents() });
}
const subagentTool: Tool = {
  name: "subagent",
  description:
    "Delegate a task to a subagent. The subagent runs in its own context " +
    "and returns a summary. Use this for exploration, research, or " +
    "subtasks that would clutter your main context.",
  inputSchema: z.object({
    prompt: z.string().describe("The task for the subagent to perform"),
  }),
  isConcurrencySafe: false,
  async call(input) {
    const { prompt } = input as { prompt: string };
    log("Subagent started");
    const result = await runSubagent(prompt);
    log("Subagent finished");
    return result;
  },
};

export { subagentTool };
