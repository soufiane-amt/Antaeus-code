import Anthropic from "@anthropic-ai/sdk";

const KEEP_RECENT = 6; // Keep the last N tool results intact

function clearOldResults(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  // Find all tool result messages and their positions
  const toolResultPositions: number[] = [];
  messages.forEach((msg, i) => {
    if (typeof msg.content !== "string" && Array.isArray(msg.content)) {
      const hasToolResult = msg.content.some(
        (block: any) => block.type === "tool_result",
      );
      if (hasToolResult) toolResultPositions.push(i);
    }
  });

  // Keep the most recent ones, clear the rest
  const toClear = toolResultPositions.slice(0, -KEEP_RECENT);

  return messages.map((msg, i) => {
    if (!toClear.includes(i)) return msg;

    // Replace tool result content with a stub
    const content = (msg.content as any[]).map((block: any) => {
      if (block.type === "tool_result") {
        return {
          ...block,
          content: "[Previous tool result cleared to save context]",
        };
      }
      return block;
    });

    return { ...msg, content };
  });
}

export { clearOldResults };