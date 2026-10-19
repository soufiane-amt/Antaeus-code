import * as vscode from "vscode";
import { ChatController, Shared } from "./chatController";
import { EditorContextTracker } from "./editorContext";
import { PROPOSAL_SCHEME, ProposalProvider } from "./proposals";

const VIEW_ID = "antaeus.chat";
const PANEL_TYPE = "antaeus.panel";

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
          const controller = new ChatController(view.webview, shared, false, setActive);
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
