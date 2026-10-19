import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { AgentEvent, AgentProcess } from "./agentProcess";
import { EditorContextTracker } from "./editorContext";
import { ProposalProvider } from "./proposals";

// Messages the chat UI sends to the extension
type UiMessage =
  | { type: "ready" }
  | { type: "focus" }
  | { type: "prompt"; text: string; includeContext: boolean }
  | { type: "command"; text: string }
  | { type: "approval"; requestId: number; decision: "yes" | "always" | "no" }
  | { type: "interrupt" }
  | { type: "openDiff"; requestId: number }
  | { type: "openFile"; path: string; line?: number }
  | { type: "restart" };

interface ToolEvent {
  id: string;
  name: string;
  input: Record<string, unknown>;
  depth: number;
}

export interface Shared {
  extensionUri: vscode.Uri;
  output: vscode.OutputChannel;
  proposals: ProposalProvider;
  editorContext: EditorContextTracker;
}

function workspaceCwd(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
}

function nonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

// One chat UI (sidebar view or editor tab) bound to its own agent process.
export class ChatController implements vscode.Disposable {
  private agent: AgentProcess | undefined;
  private readonly cwd = workspaceCwd();
  private readonly approvals = new Map<number, ToolEvent>();
  private readonly disposables: vscode.Disposable[] = [];
  private pickingSession = false;
  private uiReady = false;
  private readonly queued: Record<string, unknown>[] = [];

  constructor(
    private readonly webview: vscode.Webview,
    private readonly shared: Shared,
    private readonly isPanel: boolean,
    private readonly onFocus: (controller: ChatController) => void,
  ) {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(shared.extensionUri, "dist"),
        vscode.Uri.joinPath(shared.extensionUri, "media"),
      ],
    };
    webview.html = this.html();

    this.disposables.push(
      webview.onDidReceiveMessage((message: UiMessage) => this.handle(message)),
      shared.editorContext.onDidChange(() => this.postContext()),
    );
  }

  private post(message: Record<string, unknown>): void {
    void this.webview.postMessage(message);
  }

  private postContext(): void {
    this.post({ type: "context", label: this.shared.editorContext.current()?.label ?? null });
  }

  private startAgent(): void {
    this.agent?.dispose();
    this.approvals.clear();
    const agent = new AgentProcess(
      this.cwd,
      this.shared.output,
      (event) => this.onAgentEvent(event),
      (message) => {
        if (this.agent !== agent) return;
        this.agent = undefined;
        this.post({ type: "agentExit", message });
      },
    );
    this.agent = agent;
    this.post({ type: "starting" });
    void agent.start();
  }

  private onAgentEvent(event: AgentEvent): void {
    switch (event.type) {
      case "approval_request": {
        const tool = event.tool as ToolEvent;
        this.approvals.set(event.requestId as number, tool);
        const autoOpen = vscode.workspace
          .getConfiguration("antaeus")
          .get<boolean>("autoOpenDiff", true);
        if (autoOpen) void this.shared.proposals.showDiff(tool, this.cwd);
        break;
      }
      case "done":
      case "switched":
        this.approvals.clear();
        void this.shared.proposals.closeAll();
        break;
      case "sessions":
        if (this.pickingSession) {
          this.pickingSession = false;
          void this.pickSession(event);
          return;
        }
        break;
    }
    this.post({ type: "agent", event });
  }

  private async pickSession(event: AgentEvent): Promise<void> {
    type Session = { id: string; title: string; messageCount: number; updatedAt: string };
    const sessions = event.sessions as Session[];
    if (sessions.length === 0) {
      void vscode.window.showInformationMessage("Antaeus: no saved sessions in this workspace.");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      sessions.map((s) => ({
        label: s.title,
        description: `${s.messageCount} messages`,
        detail: `${new Date(s.updatedAt).toLocaleString()} · ${s.id}`,
        id: s.id,
        picked: s.id === event.currentId,
      })),
      { title: "Resume an Antaeus session", matchOnDetail: true },
    );
    if (picked) this.agent?.send({ type: "command", text: `/resume ${picked.id}` });
  }

  private async handle(message: UiMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        this.uiReady = true;
        this.post({
          type: "config",
          includeContext: vscode.workspace
            .getConfiguration("antaeus")
            .get<boolean>("includeEditorContext", true),
        });
        this.postContext();
        this.queued.splice(0).forEach((queued) => this.post(queued));
        if (!this.agent) this.startAgent();
        return;

      case "focus":
        this.onFocus(this);
        return;

      case "prompt": {
        const context = message.includeContext
          ? this.shared.editorContext.current()?.text
          : undefined;
        this.agent?.send({ type: "prompt", text: message.text, ...(context ? { context } : {}) });
        return;
      }

      case "command":
        this.agent?.send({ type: "command", text: message.text });
        return;

      case "approval":
        this.approvals.delete(message.requestId);
        void this.shared.proposals.closeAll();
        this.agent?.send(message);
        return;

      case "interrupt":
        this.agent?.send({ type: "interrupt" });
        return;

      case "openDiff": {
        const tool = this.approvals.get(message.requestId);
        if (tool && !(await this.shared.proposals.showDiff(tool, this.cwd))) {
          void vscode.window.showWarningMessage(
            "Antaeus: this change can't be previewed (the text to replace was not found).",
          );
        }
        return;
      }

      case "openFile":
        await this.openFile(message.path, message.line);
        return;

      case "restart":
        this.startAgent();
        return;
    }
  }

  private async openFile(file: string, line?: number): Promise<void> {
    const uri = vscode.Uri.file(path.resolve(this.cwd, file));
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      return;
    }
    const position = line ? new vscode.Position(Math.max(0, line - 1), 0) : undefined;
    await vscode.window.showTextDocument(uri, {
      preview: true,
      viewColumn: this.isPanel ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
      ...(position ? { selection: new vscode.Range(position, position) } : {}),
    });
  }

  // Commands from the view toolbar and the command palette
  newSession(): void {
    this.agent?.send({ type: "command", text: "/new" });
  }

  resumeSession(): void {
    this.pickingSession = true;
    this.agent?.send({ type: "command", text: "/sessions" });
  }

  restart(): void {
    this.startAgent();
  }

  // Both may arrive before the webview has loaded; queue them until it says ready
  insertText(text: string): void {
    if (this.uiReady) this.post({ type: "insertText", text });
    else this.queued.push({ type: "insertText", text });
  }

  focusInput(): void {
    if (this.uiReady) this.post({ type: "focusInput" });
    else this.queued.push({ type: "focusInput" });
  }

  private html(): string {
    const asset = (...parts: string[]) =>
      this.webview.asWebviewUri(vscode.Uri.joinPath(this.shared.extensionUri, ...parts));
    const n = nonce();
    const csp = [
      "default-src 'none'",
      `style-src ${this.webview.cspSource}`,
      `img-src ${this.webview.cspSource} https: data:`,
      `font-src ${this.webview.cspSource}`,
      `script-src 'nonce-${n}'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${asset("media", "chat.css")}">
  <title>Antaeus</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${n}" src="${asset("dist", "webview.js")}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.agent?.dispose();
    this.agent = undefined;
    this.disposables.forEach((d) => d.dispose());
  }
}
