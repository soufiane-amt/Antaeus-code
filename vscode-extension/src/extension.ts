import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { ChatController, SessionMemory, Shared } from "./chatController";
import { EditorContextTracker } from "./editorContext";
import { PROPOSAL_SCHEME, ProposalProvider } from "./proposals";

const VIEW_ID = "antaeus.chat";
const PANEL_TYPE = "antaeus.panel";

// The sidebar's session id, kept in a file so it is on disk the moment it changes:
// VS Code can kill the extension host (e.g. when memory runs out) at any time.
function sidebarMemory(context: vscode.ExtensionContext): SessionMemory | undefined {
  const dir = context.storageUri?.fsPath;
  if (!dir) return undefined;
  const file = path.join(dir, "sidebar-session");
  return {
    load() {
      try {
        return fs.readFileSync(file, "utf-8").trim() || undefined;
      } catch {
        return undefined;
      }
    },
    save(sessionId) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, sessionId);
    },
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Antaeus");
  const proposals = new ProposalProvider();
  const editorContext = new EditorContextTracker();
  const shared: Shared = { extensionUri: context.extensionUri, output, proposals, editorContext };

  let sidebar: ChatController | undefined;
  let active: ChatController | undefined;
  const setActive = (controller: ChatController) => (active = controller);

  // The chat the toolbar and palette commands act on
  const target = () => active ?? sidebar;

  const iconPath = {
    light: vscode.Uri.joinPath(context.extensionUri, "media", "antaeus-light.svg"),
    dark: vscode.Uri.joinPath(context.extensionUri, "media", "antaeus-dark.svg"),
  };

  const openPanel = () => {
    const panel = vscode.window.createWebviewPanel(
      PANEL_TYPE,
      "Antaeus",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { retainContextWhenHidden: true },
    );
    panel.iconPath = iconPath;
    const controller = new ChatController(panel.webview, shared, true, setActive);
    active = controller;
    panel.onDidChangeViewState(() => {
      if (panel.active) active = controller;
    });
    panel.onDidDispose(() => {
      controller.dispose();
      if (active === controller) active = sidebar;
    });
    return controller;
  };

  const focusChat = async () => {
    const chat = target();
    if (chat && chat !== sidebar) {
      chat.focusInput();
      return chat;
    }
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    sidebar?.focusInput();
    return sidebar;
  };

  context.subscriptions.push(
    output,
    editorContext,
    vscode.workspace.registerTextDocumentContentProvider(PROPOSAL_SCHEME, proposals),

    vscode.window.registerWebviewViewProvider(
      VIEW_ID,
      {
        resolveWebviewView(view) {
          sidebar?.dispose();
          const controller = new ChatController(
            view.webview,
            shared,
            false,
            setActive,
            sidebarMemory(context),
          );
          sidebar = controller;
          view.onDidDispose(() => {
            controller.dispose();
            if (sidebar === controller) sidebar = undefined;
            if (active === controller) active = undefined;
          });
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),

    vscode.commands.registerCommand("antaeus.focus", focusChat),
    vscode.commands.registerCommand("antaeus.openInEditor", openPanel),
    vscode.commands.registerCommand("antaeus.newSession", () => target()?.newSession()),
    vscode.commands.registerCommand("antaeus.resumeSession", () => target()?.resumeSession()),
    vscode.commands.registerCommand("antaeus.restart", () => target()?.restart()),

    vscode.commands.registerCommand("antaeus.insertSelection", async () => {
      // Read the context before focusing the chat moves focus away from the editor
      const mention = editorContext.current()?.mention;
      const chat = await focusChat();
      if (mention) chat?.insertText(mention + " ");
    }),

    { dispose: () => void proposals.closeAll() },
  );
}

export function deactivate(): void {}
