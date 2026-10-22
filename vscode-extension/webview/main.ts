import { marked, type Tokens } from "marked";

// ---------------------------------------------------------------------------
// Types shared with the extension

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

interface ToolEvent {
  id: string;
  name: string;
  input: Record<string, unknown>;
  depth: number;
}

interface HistoryTool {
  kind: "tool";
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "done" | "error";
  result: string;
  depth?: number;
}

type HistoryEntry = { kind: "user"; text: string } | { kind: "assistant"; text: string } | HistoryTool;

interface SessionInfo {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

type AgentEvent =
  | { type: "ready"; model: string; cwd: string; sessionId: string; history: HistoryEntry[]; tokens: number }
  | { type: "busy" }
  | { type: "text_delta"; text: string }
  | { type: "assistant_message"; text: string }
  | { type: "tool_start"; tool: ToolEvent }
  | { type: "tool_end"; tool: ToolEvent; result: string; isError: boolean }
  | { type: "approval_request"; requestId: number; tool: ToolEvent }
  | { type: "done"; interrupted: boolean; limitReached?: string; tokens: number }
  | { type: "switched"; text: string; sessionId: string; history: HistoryEntry[]; tokens: number }
  | { type: "sessions"; sessions: SessionInfo[]; currentId: string }
  | { type: "command_result"; result: { type: string; text?: string } }
  | { type: "log"; text: string; level?: "info" | "warning" }
  | { type: "error"; text: string };

type HostMessage =
  | { type: "agent"; event: AgentEvent }
  | { type: "starting" }
  | { type: "agentExit"; message: string }
  | { type: "context"; label: string | null }
  | { type: "config"; includeContext: boolean }
  | { type: "insertText"; text: string }
  | { type: "focusInput" };

const vscode = acquireVsCodeApi();

const COMMANDS = [
  { name: "/new", args: "", description: "Start a new session" },
  { name: "/sessions", args: "", description: "List saved sessions" },
  { name: "/resume", args: "[n|id]", description: "Resume a session (default: most recent)" },
  { name: "/delete", args: "<n|id>", description: "Delete a session" },
  { name: "/session", args: "", description: "Show the current session" },
  { name: "/help", args: "", description: "Show available commands" },
];

const LABELS: Record<string, string> = {
  read_file: "Read",
  list_directory: "List",
  search_files: "Search",
  write_file: "Write",
  edit_file: "Edit",
  run_command: "Run",
  verify: "Verify",
  git_diff: "Git diff",
  subagent: "Subagent",
  web_fetch: "Fetch",
  web_search: "Web search",
};

const FILE_TOOLS = new Set(["read_file", "write_file", "edit_file"]);

// ---------------------------------------------------------------------------
// Small helpers

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; title?: string } = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  for (const child of children) if (child != null) el.append(child);
  return el;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

function toolLabel(name: string): string {
  return LABELS[name] ?? name;
}

function toolArgs(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "read_file":
    case "write_file":
    case "edit_file":
      return str(input.path);
    case "list_directory":
      return str(input.directory) || ".";
    case "search_files":
      return `"${str(input.pattern)}"` + (input.directory ? ` in ${str(input.directory)}` : "");
    case "run_command":
    case "verify":
      return str(input.command);
    case "subagent":
      return str(input.prompt);
    case "web_fetch":
      return str(input.url);
    case "web_search":
      return str(input.query);
    case "git_diff":
      return "";
    default:
      return JSON.stringify(input);
  }
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const ICONS = {
  send: '<svg viewBox="0 0 16 16"><path d="M1.7 14.3 15 8 1.7 1.7l.9 5.1L10 8l-7.4 1.2z"/></svg>',
  stop: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>',
  file: '<svg viewBox="0 0 16 16"><path d="M9.5 1H3.5A1.5 1.5 0 0 0 2 2.5v11A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V5.5zM9 2.2 12.8 6H9z"/></svg>',
};

// Block-letter banner, same font as the terminal UI
const FONT: Record<string, [string, string]> = {
  A: ["▄▀█", "█▀█"],
  N: ["█▄ █", "█ ▀█"],
  T: ["▀█▀", " █ "],
  E: ["█▀▀", "██▄"],
  U: ["█ █", "█▄█"],
  S: ["█▀▀", "▄▄█"],
};

function bannerText(word: string): string {
  const glyphs = [...word].map((ch) => FONT[ch] ?? ["  ", "  "]);
  return glyphs.map((g) => g[0]).join(" ") + "\n" + glyphs.map((g) => g[1]).join(" ");
}

// ---------------------------------------------------------------------------
// Markdown

const FILE_REF = /^([\w.@~-]+\/)*[\w@.-]+\.[A-Za-z0-9]{1,8}(:\d+(-\d+)?)?$/;

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    // Never render raw HTML from the model
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
    // Inline code that looks like a file path opens the file
    codespan(token: Tokens.Codespan) {
      const text = unescapeHtml(token.text);
      const safe = escapeHtml(text);
      if (FILE_REF.test(text)) {
        return `<code class="file-link" data-path="${safe}">${safe}</code>`;
      }
      return `<code>${safe}</code>`;
    },
  },
});

function renderMarkdown(el: HTMLElement, text: string): void {
  el.innerHTML = marked.parse(text, { async: false }) as string;
}

function openFileRef(ref: string): void {
  const match = /^(.*?)(?::(\d+)(?:-\d+)?)?$/.exec(ref);
  if (!match) return;
  vscode.postMessage({
    type: "openFile",
    path: match[1],
    ...(match[2] ? { line: Number(match[2]) } : {}),
  });
}

// ---------------------------------------------------------------------------
// Layout

const app = document.getElementById("app")!;

const transcript = h("div", { class: "transcript" });
const entries = h("div", { class: "entries" });
const status = h("div", { class: "status hidden" });
transcript.append(entries, status);

const suggestions = h("div", { class: "suggestions hidden" });
const input = h("textarea", { class: "input" });
input.rows = 1;
input.placeholder = "Ask Antaeus…  (/ for commands)";

const contextChip = h("button", { class: "chip hidden", title: "Attach the active file and selection" });
const sendButton = h("button", { class: "send", title: "Send (Enter)" });
sendButton.innerHTML = ICONS.send;

const composer = h(
  "div",
  { class: "composer" },
  suggestions,
  h("div", { class: "input-box" }, input, h("div", { class: "input-row" }, contextChip, h("span", { class: "spacer" }), sendButton)),
);
const footer = h("div", { class: "footer" });

app.append(transcript, composer, footer);

// ---------------------------------------------------------------------------
// State

let model = "";
let sessionId = "";
let cwd = "";
let tokens = 0;
let running = false;
let agentStarted = false;
let startedAt = 0;
let includeContext = true;
let contextLabel: string | null = null;
let liveEl: HTMLElement | null = null;
let liveText = "";
let renderScheduled = false;
let approvalCount = 0;
const toolCards = new Map<string, HTMLDetailsElement>();
const runningTools = new Set<string>();
const promptHistory: string[] = [];
let historyIndex = -1;
let suggestionIndex = 0;

// ---------------------------------------------------------------------------
// Transcript rendering

function nearBottom(): boolean {
  return transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 80;
}

function append(el: HTMLElement): HTMLElement {
  const stick = nearBottom();
  entries.querySelector(".welcome")?.remove();
  entries.append(el);
  if (stick) transcript.scrollTop = transcript.scrollHeight;
  return el;
}

function scrollIfNeeded(stick: boolean): void {
  if (stick) transcript.scrollTop = transcript.scrollHeight;
}

function showWelcome(): void {
  entries.replaceChildren(
    h(
      "div",
      { class: "welcome" },
      h("pre", { class: "banner", text: bannerText("ANTAEUS") }),
      h("p", { text: "Ask about this codebase, or ask for a change. Antaeus asks before it edits files or runs commands." }),
      h(
        "ul",
        { class: "hints" },
        h("li", {}, h("kbd", { text: "Enter" }), " send · ", h("kbd", { text: "Shift+Enter" }), " new line"),
        h("li", {}, h("kbd", { text: "Esc" }), " interrupt the agent"),
        h("li", {}, h("kbd", { text: "Alt+K" }), " in an editor adds the selection to the chat"),
        h("li", {}, h("kbd", { text: "/" }), " session commands"),
      ),
    ),
  );
}

function addUser(text: string): void {
  append(h("div", { class: "msg user" }, h("div", { class: "bubble", text })));
}

function addAssistant(text: string): HTMLElement {
  const el = h("div", { class: "msg assistant markdown" });
  renderMarkdown(el, text);
  return append(el);
}

function addNotice(text: string, kind: "info" | "warning" | "error" | "log" = "info"): HTMLElement {
  return append(h("div", { class: `notice ${kind}`, text }));
}

function diffPreview(oldText: string, newText: string, max = 40): HTMLElement {
  const pre = h("pre", { class: "diff" });
  const lines = (text: string) => (text ? text.replace(/\n+$/, "").split("\n") : []);
  const removed = lines(oldText);
  const added = lines(newText);
  for (const line of removed.slice(0, max)) pre.append(h("div", { class: "del", text: "- " + line }));
  if (removed.length > max) pre.append(h("div", { class: "more", text: `  … ${removed.length - max} more` }));
  for (const line of added.slice(0, max)) pre.append(h("div", { class: "add", text: "+ " + line }));
  if (added.length > max) pre.append(h("div", { class: "more", text: `  … ${added.length - max} more` }));
  return pre;
}

function toolPreview(tool: { name: string; input: Record<string, unknown> }): HTMLElement | null {
  switch (tool.name) {
    case "edit_file":
      return diffPreview(str(tool.input.oldText), str(tool.input.newText));
    case "write_file":
      return diffPreview("", str(tool.input.content), 25);
    case "run_command":
    case "verify":
      return h("pre", { class: "command", text: "$ " + str(tool.input.command) });
    case "subagent":
      return h("div", { class: "prompt-text", text: str(tool.input.prompt) });
    default:
      return null;
  }
}

function toolTitle(tool: { name: string; input: Record<string, unknown>; depth?: number }): HTMLElement {
  const args = toolArgs(tool.name, tool.input);
  const argEl = h("span", { class: "tool-args", text: oneLine(args, 120), title: args });
  if (FILE_TOOLS.has(tool.name) && args) {
    argEl.classList.add("file-link");
    argEl.dataset.path = args;
  }
  return h(
    "span",
    { class: "tool-title" },
    h("span", { class: "tool-name", text: toolLabel(tool.name) }),
    argEl,
    tool.depth ? h("span", { class: "tag", text: "subagent" }) : null,
  );
}

function setToolResult(card: HTMLDetailsElement, result: string, isError: boolean): void {
  card.classList.remove("running");
  card.classList.add(isError ? "error" : "done");
  const body = card.querySelector(".tool-body")!;
  body.querySelector(".result")?.remove();
  const shown = result.length > 6000 ? result.slice(0, 6000) + `\n… (${result.length - 6000} more characters)` : result;
  if (shown.trim()) body.append(h("pre", { class: "result", text: shown }));
  if (isError) card.open = true;
}

function addTool(tool: ToolEvent | HistoryTool): HTMLDetailsElement {
  const card = h("details", { class: "tool running" });
  if (tool.depth) card.classList.add("nested");
  const preview = toolPreview(tool);
  card.append(
    h("summary", {}, h("span", { class: "dot" }), toolTitle(tool)),
    h("div", { class: "tool-body" }, preview),
  );
  append(card);
  toolCards.set(tool.id, card);
  return card;
}

function addHelp(): void {
  const list = h("div", { class: "notice help" }, h("div", { class: "notice-title", text: "Commands" }));
  for (const c of COMMANDS) {
    list.append(
      h("div", { class: "help-row" }, h("code", { text: `${c.name} ${c.args}`.trim() }), h("span", { text: c.description })),
    );
  }
  append(list);
}

function addSessions(sessions: SessionInfo[], currentId: string): void {
  const list = h("div", { class: "notice sessions" }, h("div", { class: "notice-title", text: "Saved sessions" }));
  if (sessions.length === 0) list.append(h("div", { text: "No saved sessions in this workspace." }));
  for (const s of sessions) {
    const row = h(
      "button",
      { class: "session-row" + (s.id === currentId ? " current" : ""), title: `Resume ${s.id}` },
      h("span", { class: "session-title", text: s.title }),
      h("span", { class: "session-meta", text: `${s.messageCount} msgs · ${new Date(s.updatedAt).toLocaleString()}` }),
    );
    row.addEventListener("click", () => sendCommand(`/resume ${s.id}`));
    list.append(row);
  }
  append(list);
}

function renderHistory(history: HistoryEntry[]): void {
  entries.replaceChildren();
  toolCards.clear();
  runningTools.clear();
  if (history.length === 0) {
    showWelcome();
    return;
  }
  for (const entry of history) {
    if (entry.kind === "user") addUser(entry.text);
    else if (entry.kind === "assistant") addAssistant(entry.text);
    else setToolResult(addTool(entry), entry.result, entry.status === "error");
  }
  transcript.scrollTop = transcript.scrollHeight;
}

// ---------------------------------------------------------------------------
// Streaming text

function scheduleLiveRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    if (!liveEl) return;
    const stick = nearBottom();
    renderMarkdown(liveEl, liveText);
    scrollIfNeeded(stick);
  });
}

function finishLive(text?: string): void {
  const final = text ?? liveText;
  if (liveEl) {
    if (final.trim()) renderMarkdown(liveEl, final);
    else liveEl.remove();
  } else if (final.trim()) {
    addAssistant(final);
  }
  liveEl = null;
  liveText = "";
}

// ---------------------------------------------------------------------------
// Approvals

function addApproval(requestId: number, tool: ToolEvent): void {
  approvalCount++;
  const isFile = tool.name === "edit_file" || tool.name === "write_file";

  const decide = (decision: "yes" | "always" | "no") => {
    vscode.postMessage({ type: "approval", requestId, decision });
    card.remove();
    approvalCount--;
    document.removeEventListener("keydown", onKey, true);
    updateStatus();
    input.focus();
  };

  const button = (label: string, cls: string, decision: "yes" | "always" | "no") => {
    const b = h("button", { class: cls, text: label });
    b.addEventListener("click", () => decide(decision));
    return b;
  };

  const yes = button("Yes", "primary", "yes");
  const actions = h(
    "div",
    { class: "actions" },
    yes,
    button(`Always allow ${toolLabel(tool.name)}`, "secondary", "always"),
    button("No", "secondary", "no"),
  );

  if (isFile) {
    const diff = h("button", { class: "link", text: "Open diff" });
    diff.addEventListener("click", () => vscode.postMessage({ type: "openDiff", requestId }));
    actions.append(h("span", { class: "spacer" }), diff);
  }

  const card = h(
    "div",
    { class: "approval" },
    h("div", { class: "approval-head" }, h("span", { class: "warn", text: "Permission needed" }), toolTitle(tool)),
    toolPreview(tool),
    h("div", { class: "approval-question", text: "Allow this action?  (y / a / n)" }),
    actions,
  );

  // y/a/n shortcuts, unless the user is typing in the prompt box
  const onKey = (event: KeyboardEvent) => {
    if (event.target === input || event.ctrlKey || event.metaKey || event.altKey) return;
    const decision = ({ y: "yes", a: "always", n: "no", "1": "yes", "2": "always", "3": "no" } as const)[
      event.key as "y"
    ];
    if (decision) {
      event.preventDefault();
      decide(decision);
    }
  };
  document.addEventListener("keydown", onKey, true);

  append(card);
  transcript.scrollTop = transcript.scrollHeight;
  yes.focus();
  updateStatus();
}

function clearApprovals(): void {
  entries.querySelectorAll(".approval").forEach((el) => el.remove());
  approvalCount = 0;
}

// ---------------------------------------------------------------------------
// Status, footer, composer

let statusTimer: number | undefined;

function updateStatus(): void {
  if (!running || approvalCount > 0) {
    status.classList.add("hidden");
    return;
  }
  const label = runningTools.size > 0 ? "Working" : liveText ? "Writing" : "Thinking";
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  status.replaceChildren(
    h("span", { class: "spinner" }),
    h("span", { text: `${label}… ` }),
    h("span", { class: "dim", text: `${seconds}s · esc to interrupt` }),
  );
  status.classList.remove("hidden");
}

function setRunning(value: boolean): void {
  running = value;
  sendButton.innerHTML = value ? ICONS.stop : ICONS.send;
  sendButton.title = value ? "Interrupt (Esc)" : "Send (Enter)";
  sendButton.classList.toggle("stop", value);
  if (value) {
    startedAt = Date.now();
    statusTimer = window.setInterval(updateStatus, 1000);
  } else if (statusTimer !== undefined) {
    clearInterval(statusTimer);
    statusTimer = undefined;
  }
  updateStatus();
}

function updateFooter(): void {
  const parts = [model, tokens ? `~${formatTokens(tokens)} tokens` : "", sessionId].filter(Boolean);
  footer.textContent = parts.join(" · ");
  footer.title = cwd;
}

function updateChip(): void {
  if (!contextLabel) {
    contextChip.classList.add("hidden");
    return;
  }
  contextChip.classList.remove("hidden");
  contextChip.classList.toggle("off", !includeContext);
  contextChip.innerHTML = ICONS.file;
  contextChip.append(h("span", { text: contextLabel }));
  contextChip.title = includeContext
    ? "This file (and selection) is attached to your next message. Click to detach."
    : "Not attached. Click to attach the active file and selection.";
}

function autoResize(): void {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 240) + "px";
}

function matchingCommands(): typeof COMMANDS {
  const value = input.value;
  if (!value.startsWith("/") || /\s/.test(value)) return [];
  return COMMANDS.filter((c) => c.name.startsWith(value) && c.name !== value);
}

function updateSuggestions(): void {
  const matches = matchingCommands();
  if (matches.length === 0) {
    suggestions.classList.add("hidden");
    return;
  }
  suggestionIndex = Math.min(suggestionIndex, matches.length - 1);
  suggestions.replaceChildren(
    ...matches.map((c, i) => {
      const row = h(
        "div",
        { class: "suggestion" + (i === suggestionIndex ? " selected" : "") },
        h("code", { text: `${c.name} ${c.args}`.trim() }),
        h("span", { text: c.description }),
      );
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        completeCommand(c.name);
      });
      return row;
    }),
  );
  suggestions.classList.remove("hidden");
}

function completeCommand(name: string): void {
  const command = COMMANDS.find((c) => c.name === name);
  input.value = name + (command?.args ? " " : "");
  suggestionIndex = 0;
  updateSuggestions();
  input.focus();
}

function sendCommand(text: string): void {
  if (running) {
    addNotice("Wait for the agent to finish, or interrupt it first.", "error");
    return;
  }
  const command = text.trim().split(/\s+/)[0];
  if (command === "/help") {
    addHelp();
    return;
  }
  if (command === "/exit" || command === "/quit") {
    addNotice("Close this panel to quit. Use /new to start over.");
    return;
  }
  vscode.postMessage({ type: "command", text });
}

function submit(): void {
  const text = input.value.trim();
  if (!text) return;
  if (running && !text.startsWith("/")) return;

  promptHistory.push(text);
  historyIndex = -1;
  input.value = "";
  autoResize();
  updateSuggestions();

  if (text.startsWith("/")) {
    sendCommand(text);
    return;
  }

  addUser(text);
  transcript.scrollTop = transcript.scrollHeight;
  vscode.postMessage({ type: "prompt", text, includeContext: includeContext && contextLabel !== null });
}

function interrupt(): void {
  if (running) vscode.postMessage({ type: "interrupt" });
}

input.addEventListener("input", () => {
  autoResize();
  suggestionIndex = 0;
  updateSuggestions();
});

input.addEventListener("keydown", (event) => {
  const matches = matchingCommands();

  if (matches.length > 0) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : matches.length - 1;
      suggestionIndex = (suggestionIndex + step) % matches.length;
      updateSuggestions();
      return;
    }
    if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault();
      completeCommand(matches[suggestionIndex]!.name);
      return;
    }
  }

  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
    return;
  }

  // Prompt history when the caret is at the very start (up) or end (down)
  if (event.key === "ArrowUp" && input.selectionStart === 0 && input.selectionEnd === 0 && promptHistory.length) {
    event.preventDefault();
    historyIndex = historyIndex === -1 ? promptHistory.length - 1 : Math.max(0, historyIndex - 1);
    input.value = promptHistory[historyIndex]!;
    autoResize();
    return;
  }
  if (event.key === "ArrowDown" && historyIndex !== -1 && input.selectionStart === input.value.length) {
    event.preventDefault();
    historyIndex++;
    input.value = historyIndex < promptHistory.length ? promptHistory[historyIndex]! : "";
    if (historyIndex >= promptHistory.length) historyIndex = -1;
    autoResize();
  }
});

sendButton.addEventListener("click", () => (running ? interrupt() : submit()));

contextChip.addEventListener("click", () => {
  includeContext = !includeContext;
  updateChip();
  input.focus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && running) {
    event.preventDefault();
    interrupt();
  }
});

// File links in markdown and tool cards
entries.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(".file-link");
  if (!target?.dataset.path) return;
  event.preventDefault();
  event.stopPropagation();
  openFileRef(target.dataset.path);
});

window.addEventListener("focus", () => vscode.postMessage({ type: "focus" }));
document.addEventListener("mousedown", () => vscode.postMessage({ type: "focus" }));

// ---------------------------------------------------------------------------
// Messages from the extension

function onAgentEvent(event: AgentEvent): void {
  switch (event.type) {
    case "ready":
      model = event.model;
      sessionId = event.sessionId;
      cwd = event.cwd;
      tokens = event.tokens;
      renderHistory(event.history);
      if (agentStarted) addNotice(`Agent restarted · session ${event.sessionId}`);
      else if (event.history.length > 0) {
        addNotice("Continuing your last conversation · /new starts a fresh one");
      }
      agentStarted = true;
      updateFooter();
      setRunning(false);
      input.disabled = false;
      break;

    case "busy":
      setRunning(true);
      break;

    case "text_delta":
      if (!liveEl) liveEl = append(h("div", { class: "msg assistant markdown" }));
      liveText += event.text;
      scheduleLiveRender();
      updateStatus();
      break;

    case "assistant_message":
      finishLive(event.text);
      break;

    case "tool_start": {
      finishLive();
      const existing = toolCards.get(event.tool.id);
      if (!existing) addTool(event.tool);
      runningTools.add(event.tool.id);
      updateStatus();
      break;
    }

    case "tool_end": {
      const card = toolCards.get(event.tool.id) ?? addTool(event.tool);
      setToolResult(card, event.result, event.isError);
      runningTools.delete(event.tool.id);
      updateStatus();
      break;
    }

    case "approval_request":
      finishLive();
      addApproval(event.requestId, event.tool);
      break;

    case "done":
      finishLive();
      clearApprovals();
      for (const id of runningTools) {
        const card = toolCards.get(id);
        if (card) setToolResult(card, "Interrupted", true);
      }
      runningTools.clear();
      setRunning(false);
      tokens = event.tokens;
      updateFooter();
      if (event.interrupted) addNotice("Interrupted by user");
      if (event.limitReached) addNotice(event.limitReached);
      break;

    case "switched":
      sessionId = event.sessionId;
      tokens = event.tokens;
      clearApprovals();
      renderHistory(event.history);
      addNotice(event.text);
      updateFooter();
      break;

    case "sessions":
      addSessions(event.sessions, event.currentId);
      break;

    case "command_result":
      if (event.result.type === "help") addHelp();
      else if (event.result.text) addNotice(event.result.text, event.result.type === "error" ? "error" : "info");
      break;

    case "log":
      addNotice(event.text, event.level === "warning" ? "warning" : "log");
      break;

    case "error":
      addNotice(event.text, "error");
      break;
  }
}

window.addEventListener("message", (message: MessageEvent<HostMessage>) => {
  const data = message.data;
  switch (data.type) {
    case "agent":
      onAgentEvent(data.event);
      break;

    case "starting":
      setRunning(false);
      break;

    case "agentExit": {
      finishLive();
      clearApprovals();
      setRunning(false);
      const notice = addNotice(data.message, "error");
      const restart = h("button", { class: "link", text: "Restart agent" });
      restart.addEventListener("click", () => {
        restart.remove();
        vscode.postMessage({ type: "restart" });
      });
      notice.append(" ", restart);
      break;
    }

    case "context":
      contextLabel = data.label;
      updateChip();
      break;

    case "config":
      includeContext = data.includeContext;
      updateChip();
      break;

    case "insertText": {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const before = input.value.slice(0, start);
      const pad = before && !/\s$/.test(before) ? " " : "";
      input.value = before + pad + data.text + input.value.slice(end);
      const caret = start + pad.length + data.text.length;
      input.setSelectionRange(caret, caret);
      autoResize();
      input.focus();
      break;
    }

    case "focusInput":
      input.focus();
      break;
  }
});

showWelcome();
updateFooter();
input.focus();
vscode.postMessage({ type: "ready" });
