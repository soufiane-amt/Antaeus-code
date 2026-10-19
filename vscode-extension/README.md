# Antaeus for VS Code

Chat with the Antaeus coding agent from VS Code's sidebar or an editor tab.

The extension starts `antaeus --stdio` in your workspace folder and talks to it over a JSON-lines
protocol (see `src/server.ts` in the agent). Each chat, whether the sidebar or an editor tab, gets its
own agent process and session.

## Features

- Streaming replies rendered as markdown. Inline file references such as `src/loop.ts:42` open the file.
- A collapsible card for each tool call, showing its result.
- Permission prompts for edits, writes, commands, and web searches: **Yes**, **Always allow**, or **No**
  (keys `y` / `a` / `n`).
- A native diff editor of each proposed `edit_file` / `write_file` change, opened when the agent asks
  for permission.
- The active file and selection attached to your prompt as context. Click the chip to detach it.
- `Alt+K` in an editor inserts an `@file#L1-10` reference into the chat.
- Session commands (`/new`, `/sessions`, `/resume`, `/delete`, `/session`, `/help`) with autocomplete,
  plus toolbar buttons for New Session and Resume Session.
- `Esc` interrupts the agent. `Ctrl+Esc` (`Cmd+Esc` on macOS) focuses the chat.

## Install

1. Make the `antaeus` command available. In the agent's repository, run `npm install && npm link`.
2. Build and install the extension:

   ```bash
   cd vscode-extension
   npm install
   npm run package
   code --install-extension antaeus.vsix
   ```

3. Open the Antaeus icon in the activity bar.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `antaeus.command` | `antaeus` | Command that starts the agent. A bare name is looked up on PATH, then through your login shell (useful with nvm). |
| `antaeus.args` | `[]` | Extra arguments. `--stdio` is always added. |
| `antaeus.autoOpenDiff` | `true` | Open a diff when the agent asks to edit or write a file. |
| `antaeus.includeEditorContext` | `true` | Attach the active file and selection to prompts by default. |

The agent's stderr appears in the **Antaeus** output channel.

## Development

```bash
npm run watch      # rebuild on change
npm run typecheck
```

Press `F5` from this folder with a launch config of type `extensionHost`, or install the packaged `.vsix`.
