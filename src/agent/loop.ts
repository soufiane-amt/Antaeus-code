import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import client from "../llm/openrouter";
import { tools, getTool } from "../tools/registry";
import { toJsonSchema } from "../utils/schema";
import { AgentState, MAX_ITERATIONS, MAX_TOOL_CALLS } from "./state";
import { compressMessages } from "../context/compressMessages";
import { executeBatches, partitionIntoBatches, ToolCall } from "../utils/utils";
import { log } from "../utils/logger";
import { saveMessage } from "./session";

export const MODEL = config.primaryModel;
export const MAX_TOKENS = config.maxTokens;

export const APPROVAL_TOOLS = [
  "edit_file",
  "write_file",
  "run_command",
  "web_search",
];

export interface ToolEvent {
  id: string;
  name: string;
  input: Record<string, unknown>;
  // 0 for the main agent, 1+ for subagents
  depth: number;
}

// How the agent talks to whatever UI is driving it.
export interface AgentEvents {
  onTextDelta?(text: string): void;
  onAssistantMessage?(text: string): void;
  onToolStart?(tool: ToolEvent): void;
  onToolEnd?(tool: ToolEvent, result: string, isError: boolean): void;
  requestApproval(tool: ToolEvent): Promise<boolean>;
  signal?: AbortSignal;
}

export interface RunOptions {
  sessionId?: string;
  events: AgentEvents;
}

const SYSTEM_PROMPT = `
You are Antaeus, a coding agent that helps users understand and modify codebases.

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

// The events of the agent run currently in progress, so the subagent tool
// can route its approvals and tool activity to the same UI.
let activeEvents: AgentEvents | undefined;
let depth = 0;

export function getSubagentEvents(): AgentEvents {
  const parent = activeEvents;
  return {
    onToolStart: parent?.onToolStart?.bind(parent),
    onToolEnd: parent?.onToolEnd?.bind(parent),
    requestApproval: (tool) =>
      parent ? parent.requestApproval(tool) : Promise.resolve(false),
    signal: parent?.signal,
  } as AgentEvents;
}

// Chat-template tokens some providers leak into the reply text (e.g. Qwen's <|im_end|>)
const SPECIAL_TOKENS = /<\|(?:im_start|im_end|endoftext|eot_id|eom_id)\|>/g;

function stripSpecialTokens(text: string): string {
  return text.replace(SPECIAL_TOKENS, "");
}

// Leaves the reply untouched unless a leaked token is present, since some models
// (Claude) tie their thinking blocks to the exact reply they produced.
function cleanContent(content: Anthropic.ContentBlock[]): Anthropic.ContentBlock[] {
  return content.flatMap<Anthropic.ContentBlock>((block) => {
    if (block.type !== "text") return [block];
    const text = stripSpecialTokens(block.text);
    if (text === block.text) return [block];
    return text.trim() ? [{ ...block, text }] : [];
  });
}

function toToolEvent(block: Anthropic.ToolUseBlock): ToolEvent {
  return {
    id: block.id,
    name: block.name,
    input: (block.input ?? {}) as Record<string, unknown>,
    depth: depth - 1,
  };
}

export async function runAgent(
  messages: Anthropic.MessageParam[],
  { sessionId, events }: RunOptions,
): Promise<string> {
  const persist = (message: Anthropic.MessageParam) => {
    if (sessionId) saveMessage(sessionId, message);
  };

  const previousEvents = activeEvents;
  activeEvents = events;
  depth++;

  try {
    return await loop(messages, events, persist);
  } finally {
    depth--;
    activeEvents = previousEvents;
  }
}

async function loop(
  messages: Anthropic.MessageParam[],
  events: AgentEvents,
  persist: (message: Anthropic.MessageParam) => void,
): Promise<string> {
  const state: AgentState = {
    iteration: 0,
    toolCalls: 0,
    completed: false,
  };
  const signal = events.signal;

  while (
    state.iteration < MAX_ITERATIONS &&
    state.toolCalls < MAX_TOOL_CALLS &&
    !state.completed
  ) {
    if (signal?.aborted) {
      return "Interrupted.";
    }

    state.iteration++;

    const compressed = await compressMessages(messages);

    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,

        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: toJsonSchema(tool.inputSchema),
        })),

        messages: compressed,
      },
      signal ? { signal } : undefined,
    );

    stream.on("text", (text) => {
      const clean = stripSpecialTokens(text);
      if (clean) events.onTextDelta?.(clean);
    });

    const response = await stream.finalMessage();
    const content = cleanContent(response.content);
    messages.push({
      role: "assistant",
      content,
    });
    persist({ role: "assistant", content });

    const text = content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((b) => b.text)
      .join("\n");

    events.onAssistantMessage?.(text);

    // The reply ended early: out of output tokens, or declined by the model
    const endedEarly =
      response.stop_reason === "max_tokens"
        ? `Reply cut off: it reached the MAX_TOKENS limit (${MAX_TOKENS}). ` +
          "Raise MAX_TOKENS in .env, then restart the agent."
        : response.stop_reason === "refusal"
          ? "The model declined to continue this request."
          : undefined;
    if (endedEarly) log(endedEarly, "warning");

    const toolUseBlocks = content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      return text;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    const executableToolCalls: ToolCall[] = [];

    const reject = (block: Anthropic.ToolUseBlock, content: string) => {
      const event = toToolEvent(block);
      events.onToolStart?.(event);
      events.onToolEnd?.(event, content, true);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content,
        is_error: true,
      });
    };

    // A tool call from a reply that ended early may have incomplete input, so
    // don't run it. Stop here instead of retrying straight into the same limit.
    if (endedEarly) {
      for (const block of toolUseBlocks) {
        reject(
          block,
          `Not run: your reply ended early (${response.stop_reason}), so this tool call may be incomplete.`,
        );
      }
      messages.push({ role: "user", content: toolResults });
      persist({ role: "user", content: toolResults });
      return text;
    }

    for (const block of toolUseBlocks) {
      if (signal?.aborted) {
        reject(block, "The user interrupted the agent before this tool ran.");
        continue;
      }

      if (state.toolCalls >= MAX_TOOL_CALLS) {
        reject(
          block,
          "Tool call limit reached. Stop using tools and provide the best final answer.",
        );
        continue;
      }

      const tool = getTool(block.name);

      if (!tool) {
        reject(block, `Unknown tool: ${block.name}`);
        continue;
      }

      state.toolCalls++;
      state.lastTool = tool.name;

      if (APPROVAL_TOOLS.includes(tool.name)) {
        const approved = await events.requestApproval(toToolEvent(block));

        if (!approved) {
          reject(
            block,
            "The user denied this action. Do not attempt another command or modification.",
          );
          continue;
        }
      }

      executableToolCalls.push({
        block,
        tool,
      });
    }

    const batches = partitionIntoBatches(executableToolCalls);

    const executedResults = await executeBatches(batches, {
      onToolStart: (call) => events.onToolStart?.(toToolEvent(call.block)),
      onToolEnd: (call, result) =>
        events.onToolEnd?.(
          toToolEvent(call.block),
          typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content),
          result.is_error === true,
        ),
    });

    toolResults.push(...executedResults);

    // Keep results in the order the model asked for them
    const order = toolUseBlocks.map((b) => b.id);
    toolResults.sort(
      (a, b) => order.indexOf(a.tool_use_id) - order.indexOf(b.tool_use_id),
    );

    messages.push({
      role: "user",
      content: toolResults,
    });
    persist({ role: "user", content: toolResults });
  }

  return `Agent stopped because it reached a safety limit. Iterations: ${state.iteration}/${MAX_ITERATIONS}, tool calls: ${state.toolCalls}/${MAX_TOOL_CALLS}.`;
}
