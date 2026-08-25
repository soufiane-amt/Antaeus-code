import Anthropic from "@anthropic-ai/sdk";
import client from "../llm/openrouter";
import { tools, getTool } from "../tools/registry";
import { toJsonSchema } from "../utils/schema";

const MAX_ITERATIONS = 10;

export async function runAgent(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: userMessage,
    },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: "qwen/qwen3-coder",
      max_tokens: 2000,

      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: toJsonSchema(tool.inputSchema),
      })),

      messages,
    });

    console.log("BLOCKS:", response.content);

    // Add assistant response to conversation
    messages.push({
      role: "assistant",
      content: response.content,
    });

    // Check whether the model wants to use a tool
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    // No tool call = final answer
    if (toolUseBlocks.length === 0) {
      return response.content;
    }

    // Execute requested tools
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
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

      try {
        const result = await tool.call(block.input);

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
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

    // Give tool results back to the model
    messages.push({
      role: "user",
      content: toolResults,
    });
  }
}
