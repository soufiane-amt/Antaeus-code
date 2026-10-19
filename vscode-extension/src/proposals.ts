import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export const PROPOSAL_SCHEME = "antaeus-proposal";

interface Tool {
  name: string;
  input: Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Serves the agent's proposed file contents so they can be shown in a diff editor.
export class ProposalProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private nextId = 1;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  private store(label: string, content: string): vscode.Uri {
    // The id keeps each proposal distinct; the file name keeps language detection working
    const uri = vscode.Uri.from({
      scheme: PROPOSAL_SCHEME,
      path: `/${this.nextId++}/${label}`,
    });
    this.contents.set(uri.toString(), content);
    return uri;
  }

  // Opens a diff of the file as it is now against what the tool would write.
  // Returns false when the change cannot be previewed (e.g. oldText not found).
  async showDiff(tool: Tool, cwd: string): Promise<boolean> {
    if (tool.name !== "edit_file" && tool.name !== "write_file") return false;

    const relative = str(tool.input.path);
    if (!relative) return false;

    const absolute = path.resolve(cwd, relative);
    const exists = fs.existsSync(absolute);
    const current = exists ? fs.readFileSync(absolute, "utf-8") : "";

    let proposed: string;
    if (tool.name === "write_file") {
      proposed = str(tool.input.content);
    } else {
      const oldText = str(tool.input.oldText);
      if (!oldText || !current.includes(oldText)) return false;
      proposed = current.replace(oldText, str(tool.input.newText));
    }

    const name = path.basename(absolute);
    const left = exists ? vscode.Uri.file(absolute) : this.store(name, "");
    const right = this.store(name, proposed);
    const title = `${name} ${exists ? "↔" : "(new file)"} Antaeus proposal`;

    await vscode.commands.executeCommand("vscode.diff", left, right, title, {
      preview: true,
      preserveFocus: true,
    });
    return true;
  }

  // Closes every open proposal diff and forgets their contents.
  async closeAll(): Promise<void> {
    const tabs = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter(
        (tab) =>
          tab.input instanceof vscode.TabInputTextDiff &&
          tab.input.modified.scheme === PROPOSAL_SCHEME,
      );
    if (tabs.length > 0) await vscode.window.tabGroups.close(tabs, true);
    this.contents.clear();
  }
}
