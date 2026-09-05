import Anthropic from "@anthropic-ai/sdk";
import client from "../llm/openrouter";
import { tools, getTool } from "../tools/registry";
import { toJsonSchema } from "../utils/schema";
import { AgentState, MAX_ITERATIONS, MAX_TOOL_CALLS } from "./state";

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { compressMessages } from "../context/compressMessages";
import { executeBatches, partitionIntoBatches, ToolCall } from "../utils/utils";
import { saveMessage } from "./save";
import { rl } from "..";

const SYSTEM_PROMPT = `
You are a coding agent that helps users understand and modify codebases.

Tool selection rules:
- If the user asks where a specific symbol, function, class, variable, or text appears, use search_files first.
- If you need to understand the project structure, use list_directory.
- If you know the exact file you need to inspect, use read_file.
- Don't read files unnecessarily.
- Don't explore files when search_files can answer the question.
- Use the minimum number of tool calls necessary.

Verification rules:
- After modifying code, determine whether verification is useful.
- When verification is appropriate, use the verify tool.
- Choose a verification command based on the project and the changes made.
- Do not assume a specific programming language, framework, package manager, or test runner.
- Inspect project configuration when necessary to determine the appropriate verification command.
- Reading a modified file or viewing a diff does not count as verification.
- A verification succeeds only when the verification command exits with code 0.
- If verification fails, inspect the error, fix the problem, and verify again.
- Do not claim that a change was verified unless the verify tool actually succeeded.

Task completion rules:
- Once the user's request is completed, stop using tools and provide the final answer.
- Do not perform additional investigation after the task is complete.
- Do not repeat a tool call with the same arguments unless the previous call failed.
- Do not investigate Git history or staged changes unless the user explicitly asks about Git.
`;
async function askForApproval(): Promise<boolean> {
  const answer = await rl.question("Allow this action? (y/n): ");

  return answer.trim().toLowerCase() === "y";
}

export async function runAgent(messages: Anthropic.MessageParam[]) {
  const state: AgentState = {
    iteration: 0,
    toolCalls: 0,
    completed: false,
  };

  while (
    state.iteration < MAX_ITERATIONS &&
    state.toolCalls < MAX_TOOL_CALLS &&
    !state.completed
  ) {
    state.iteration++;

    const compressed = await compressMessages(messages);

    // console.log(
    //   `\n--- Agent iteration ${state.iteration}/${MAX_ITERATIONS} ---`,
    // );

    const stream = client.messages.stream({
      model: process.env.PRIMARY_MODEL || "qwen/qwen3-coder",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,

      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: toJsonSchema(tool.inputSchema),
      })),

      messages: compressed,
    });

    if (messages.length > 1 && messages?.[messages.length - 1] !== undefined) {
      saveMessage({
        role: "user",
        content: messages[messages.length - 1]?.content,
      });
    }

    stream.on("text", (text) => {
      process.stdout.write(text);
    });

    const response = await stream.finalMessage();
    console.log("\n");
    messages.push({
      role: "assistant",
      content: response.content,
    });
    console.log("response: ", response);
    saveMessage({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );

      return textBlocks.map((b) => b.text).join("\n");
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    const executableToolCalls: ToolCall[] = [];

    for (const block of toolUseBlocks) {
      if (state.toolCalls >= MAX_TOOL_CALLS) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content:
            "Tool call limit reached. Stop using tools and provide the best final answer.",
          is_error: true,
        });

        continue;
      }

      const tool = getTool(block.name);

      if (!tool) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        });

        continue;
      }

      state.toolCalls++;
      state.lastTool = tool.name;

      const requiresApproval = [
        "edit_file",
        "write_file",
        "run_command",
        "web_search",
      ].includes(tool.name);

      if (requiresApproval) {
        if (tool.name === "run_command") {
          console.log("\n⚠️ Agent wants to run:");
          console.log(`$ ${block.input.command}`);
        } else {
          console.log("\n⚠️ Agent wants to modify:");
          console.log(block.input);
        }

        const approved = await askForApproval();

        if (!approved) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content:
              "The user denied this action. Do not attempt another command or modification.",
            is_error: true,
          });

          continue;
        }
      }

      executableToolCalls.push({
        block,
        tool,
      });
    }

    const batches = partitionIntoBatches(executableToolCalls);

    const executedResults = await executeBatches(batches);

    toolResults.push(...executedResults);

    messages.push({
      role: "user",
      content: toolResults,
    });
    saveMessage({ role: "user", content: toolResults });
  }

  return `Agent stopped because it reached a safety limit. Iterations: ${state.iteration}/${MAX_ITERATIONS}, tool calls: ${state.toolCalls}/${MAX_TOOL_CALLS}.`;
}
