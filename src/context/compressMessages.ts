import Anthropic from "@anthropic-ai/sdk";
import { clearOldResults } from "./clearOldResults";
import { autoCompact } from "./autoCompact";
import { estimateTokens } from "../utils/utils";

async function compressMessages(
  messages: Anthropic.MessageParam[],
): Promise<Anthropic.MessageParam[]> {
  // Layer 1: Truncation already happened when results were created

  // Layer 2: Clear old tool results
  let compressed = clearOldResults(messages);

  // Layer 3: Autocompact if still too large
  const tokenEstimate = estimateTokens(compressed);
  const { messages: compacted } = await autoCompact(compressed, tokenEstimate);

  return compacted;
}

export { compressMessages };