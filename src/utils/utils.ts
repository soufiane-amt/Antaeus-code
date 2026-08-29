import Anthropic from "@anthropic-ai/sdk";

export function normalizeMessages(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  return messages.filter((msg) => {
    // Remove empty messages
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
