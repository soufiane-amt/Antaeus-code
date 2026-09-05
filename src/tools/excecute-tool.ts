import Anthropic from "@anthropic-ai/sdk";
import { getTool } from "./registry";
import { truncateResult } from "../context/truncateResult";

async function executeTool(
  block: Anthropic.ToolUseBlock
): Promise<Anthropic.ToolResultBlockParam> {
  const tool = getTool(block.name);

  if (!tool) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Unknown tool: ${block.name}`,
      is_error: true,
    };
  }

  try {
    const result = await tool.call(block.input);

    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: truncateResult(result),
    };
  } catch (error) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: String(error),
      is_error: true,
    };
  }
}