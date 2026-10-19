import * as vscode from "vscode";

const MAX_SELECTION_CHARS = 12_000;

export interface EditorContext {
  // Short label for the chip in the chat input, e.g. "loop.ts:12-30"
  label: string;
  // Text attached to the prompt
  text: string;
  // Reference inserted by "Add Selection to Chat", e.g. "@src/loop.ts#L12-30"
  mention: string;
}

function lineRange(selection: vscode.Selection): string {
  const start = selection.start.line + 1;
  // A selection ending at column 0 doesn't really include that line
  const endLine =
    selection.end.character === 0 && selection.end.line > selection.start.line
      ? selection.end.line
      : selection.end.line + 1;
  return start === endLine ? `${start}` : `${start}-${endLine}`;
}

// Remembers the last real text editor, since focusing the chat clears activeTextEditor.
export class EditorContextTracker implements vscode.Disposable {
  private editor: vscode.TextEditor | undefined;
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[];

  readonly onDidChange = this.emitter.event;

  constructor() {
    this.editor = this.usable(vscode.window.activeTextEditor);
    this.subscriptions = [
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.usable(editor)) {
          this.editor = editor;
          this.emitter.fire();
        } else if (!vscode.window.visibleTextEditors.includes(this.editor!)) {
          this.editor = undefined;
          this.emitter.fire();
        }
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === this.editor) this.emitter.fire();
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (this.editor?.document === document) {
          this.editor = undefined;
          this.emitter.fire();
        }
      }),
    ];
  }

  private usable(editor: vscode.TextEditor | undefined): vscode.TextEditor | undefined {
    const scheme = editor?.document.uri.scheme;
    return scheme === "file" || scheme === "untitled" ? editor : undefined;
  }

  current(): EditorContext | undefined {
    const editor = this.editor;
    if (!editor) return undefined;

    const document = editor.document;
    const relative = vscode.workspace.asRelativePath(document.uri, false);
    const name = relative.split("/").pop() ?? relative;
    const selection = editor.selection;

    if (selection.isEmpty) {
      return {
        label: name,
        text: `The user has \`${relative}\` open in the editor.`,
        mention: `@${relative}`,
      };
    }

    const range = lineRange(selection);
    let selected = document.getText(selection);
    if (selected.length > MAX_SELECTION_CHARS) {
      selected = selected.slice(0, MAX_SELECTION_CHARS) + "\n… (selection truncated)";
    }

    return {
      label: `${name}:${range}`,
      text:
        `The user has \`${relative}\` open and selected lines ${range}:\n` +
        "```" + document.languageId + "\n" + selected + "\n```",
      mention: `@${relative}#L${range}`,
    };
  }

  dispose(): void {
    this.subscriptions.forEach((s) => s.dispose());
    this.emitter.dispose();
  }
}
