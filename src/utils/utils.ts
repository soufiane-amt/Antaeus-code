import Anthropic from "@anthropic-ai/sdk";
import { Tool } from "../tools/types";
import { ToolResultBlockParam } from "@anthropic-ai/sdk/resources";
import { truncateResult } from "../context/truncateResult";
import Turndown from "turndown";

export function normalizeMessages(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  return messages.filter((msg) => {
    if (typeof msg.content === "string" && msg.content.trim() === "") {
      return false;
    }
    return true;
  });
}

export function estimateTokens(messages: Anthropic.MessageParam[]): number {
  const text = JSON.stringify(messages);

  return Math.ceil(text.length / 4);
}
export interface ToolCall {
  block: Anthropic.ToolUseBlock;
  tool: Tool;
}

interface Batch {
  tools: ToolCall[];
  concurrent: boolean;
}

export function partitionIntoBatches(toolCalls: ToolCall[]): Batch[] {
  const batches: Batch[] = [];

  let currentBatch: ToolCall[] = [];
  let currentIsConcurrent = true;

  for (const call of toolCalls) {
    const isSafe = call.tool.isConcurrencySafe;

    if (isSafe && currentIsConcurrent) {
      currentBatch.push(call);
    } else {
      if (currentBatch.length > 0) {
        batches.push({
          tools: currentBatch,
          concurrent: currentIsConcurrent,
        });
      }

      currentBatch = [call];
      currentIsConcurrent = isSafe;
    }
  }

  if (currentBatch.length > 0) {
    batches.push({
      tools: currentBatch,
      concurrent: currentIsConcurrent,
    });
  }

  return batches;
}

export interface ExecutionHooks {
  onToolStart?(call: ToolCall): void;
  onToolEnd?(call: ToolCall, result: ToolResultBlockParam): void;
}

async function runTool(call: ToolCall): Promise<ToolResultBlockParam> {
  try {
    const result = await call.tool.call(call.block.input);

    return {
      type: "tool_result",
      tool_use_id: call.block.id,
      content: truncateResult(result),
    };
  } catch (error) {
    return {
      type: "tool_result",
      tool_use_id: call.block.id,
      content: String(error),
      is_error: true,
    };
  }
}

async function executeTool(
  call: ToolCall,
  hooks: ExecutionHooks,
): Promise<ToolResultBlockParam> {
  hooks.onToolStart?.(call);
  const result = await runTool(call);
  hooks.onToolEnd?.(call, result);
  return result;
}

export async function executeBatches(
  batches: Batch[],
  hooks: ExecutionHooks = {},
): Promise<ToolResultBlockParam[]> {
  const allResults: ToolResultBlockParam[] = [];

  for (const batch of batches) {
    if (batch.concurrent) {
      const results = await Promise.all(
        batch.tools.map((tool) => executeTool(tool, hooks)),
      );
      allResults.push(...results);
    } else {
      for (const call of batch.tools) {
        const result = await executeTool(call, hooks);
        allResults.push(result);
      }
    }
  }

  return allResults;
}

const turndown = new Turndown();

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}
