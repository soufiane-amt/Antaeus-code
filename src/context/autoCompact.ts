import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import client from "../llm/openrouter";
import { log } from "../utils/logger";

const CONTEXT_WINDOW = config.contextWindow; // Model's context limit in tokens
const COMPACT_THRESHOLD = 0.8; // Compact when we hit 80% of the limit

async function autoCompact(
  messages: Anthropic.MessageParam[],
  tokenEstimate: number,
): Promise<{
  messages: Anthropic.MessageParam[];
  wasCompacted: boolean;
}> {
  // Only compact if we are approaching the limit
  if (tokenEstimate < CONTEXT_WINDOW * COMPACT_THRESHOLD) {
    return { messages, wasCompacted: false };
  }

  log("Context is large, summarizing conversation...");

  // Ask the model to summarize
  const summaryResponse = await client.messages.create({
    model: config.compactModel,
    // A summary doesn't need the full reply budget, and this request isn't streamed
    max_tokens: Math.min(config.maxTokens, 8192),
    system:
      "Summarize this conversation between a user and a coding assistant. " +
      "Write in third person (say 'the user asked' and 'the assistant edited', not 'I'). " +
      "Preserve: file paths mentioned, code changes made, current task state, " +
      "and any decisions or preferences expressed. Be concise but complete.",
    messages: messages,
  });

  const summaryText = summaryResponse.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Replace old messages with the summary
  // Keep the most recent messages intact (they are likely still relevant)
  const keepRecent = 4;
  const recentMessages = messages.slice(-keepRecent);

  const compactedMessages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `[Conversation summary]\n${summaryText}\n\n` +
        `[The conversation continues from here.]`,
    },
    {
      role: "assistant",
      content:
        "I understand the context. I will continue from where we left off.",
    },
    ...recentMessages,
  ];

  return { messages: compactedMessages, wasCompacted: true };
}

export { autoCompact };