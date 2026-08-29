import Anthropic from "@anthropic-ai/sdk";
import client from "../llm/openrouter";
import { tools, getTool } from "../tools/registry";
import { toJsonSchema } from "../utils/schema";
import { AgentState, MAX_ITERATIONS, MAX_TOOL_CALLS } from "./state";

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { truncateResult } from "../context/truncateResult";
import { compressMessages } from "../context/compressMessages";

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
  const rl = readline.createInterface({
    input,
    output,
  });

  try {
    const answer = await rl.question("Allow this action? (y/n): ");
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

export async function runAgent(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: userMessage,
    },
  ];

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

    console.log(
      `\n--- Agent iteration ${state.iteration}/${MAX_ITERATIONS} ---`,
    );

    const response = await client.messages.create({
      model: "qwen/qwen3-coder",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,

      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: toJsonSchema(tool.inputSchema),
      })),

      messages: compressed,
    });

    console.log("BLOCKS:", response.content);

    messages.push({
      role: "assistant",
      content: response.content,
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    // No tool call means the model has produced its final answer.
    if (toolUseBlocks.length === 0) {
      state.completed = true;

      return response.content;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      // Stop before executing more tools.
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

      try {
        const requiresApproval = [
          "edit_file",
          "write_file",
          "run_command",
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

        const result = await tool.call(block.input);
        const truncatedResult = truncateResult(result);

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: truncatedResult,
        });
      } catch (error) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: String(error),
          is_error: true,
        });
      }
    }

    messages.push({
      role: "user",
      content: toolResults,
    });
  }

  // We only get here if a safety limit stopped the agent.
  return [
    {
      type: "text",
      text:
        `Agent stopped because it reached a safety limit. ` +
        `Iterations: ${state.iteration}/${MAX_ITERATIONS}, ` +
        `tool calls: ${state.toolCalls}/${MAX_TOOL_CALLS}.`,
    },
  ];
}
