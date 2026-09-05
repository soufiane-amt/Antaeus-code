import { z } from "zod";
import { Tool } from "./types";
import Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "../agent/loop";

async function runSubagent(
  prompt: string,
  parentAbortSignal?: AbortSignal,
): Promise<string> {
  // Create a child abort controller linked to the parent
  const childAbort = new AbortController();
  if (parentAbortSignal) {
    parentAbortSignal.addEventListener("abort", () => childAbort.abort());
  }

  // Fresh messages, but shared everything else
  const subagentMessages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  return runAgent(subagentMessages);
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
  async call(input) {
    const prompt = input.prompt as string;
    console.log("  [subagent] Starting...");
    const result = await runSubagent(prompt);
    console.log("  [subagent] Done.");
    return result;
  },
};

export { subagentTool };