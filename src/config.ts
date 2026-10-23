import "dotenv/config";

// Every setting the agent reads from the environment (.env), with its default.
// Documented in .env.example.

function text(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const primaryModel = text("PRIMARY_MODEL", "qwen/qwen3-coder");

export const config = {
  apiKey: process.env.OPENROUTER_API_KEY,
  // Any Anthropic-compatible Messages API endpoint
  baseURL: text("API_BASE_URL", "https://openrouter.ai/api"),

  primaryModel,
  // Helper tasks: web search and summarizing fetched pages
  cheapModel: text("CHEAP_MODEL", "qwen/qwen3-4b"),
  // Summarizes the conversation when it nears the context window
  compactModel: text("COMPACT_MODEL", primaryModel),

  maxTokens: positiveNumber("MAX_TOKENS", 2000),
  // The primary model's context window, in tokens; compaction starts at 80% of it
  contextWindow: positiveNumber("CONTEXT_WINDOW", 200_000),

  // Safety limits for one request to the agent
  maxIterations: positiveNumber("MAX_ITERATIONS", 30),
  maxToolCalls: positiveNumber("MAX_TOOL_CALLS", 50),

  // How long run_command may take, in seconds
  commandTimeoutSeconds: positiveNumber("COMMAND_TIMEOUT", 30),
};
