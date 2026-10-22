# Antaeus

A coding agent for your terminal and VS Code. Ask it about a codebase or ask for a change; it reads,
searches, edits, and runs commands with its own tools, and asks before it changes anything.

## Features

- **Tools**: search, list, and read files; edit and write files; run shell commands; git diff; run
  tests or builds to verify its own changes; delegate to a subagent; web search and web fetch.
- **Approvals**: edits, file writes, shell commands, and web searches wait for your yes. Approve once,
  always allow a tool, or say no.
- **Parallel tools**: read-only tools run concurrently.
- **Sessions**: every conversation is saved per project and can be resumed.
- **Context management**: long tool results are truncated and old ones cleared to keep requests small.
- **Terminal UI** built with Ink, plus a plain line-based mode.
- **VS Code extension** with a chat panel, native diffs for proposed edits, and your selection as context.

## Setup

```bash
npm install
cp .env.example .env    # then put your OpenRouter key in .env
npm link                # puts the `antaeus` command on your PATH
```

Settings in `.env`:

| Variable | Default | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | (required) | Your [OpenRouter](https://openrouter.ai/keys) API key. |
| `PRIMARY_MODEL` | `qwen/qwen3-coder` | Model the agent runs on. Needs tool use support. |
| `CHEAP_MODEL` | `qwen/qwen3-4b` | Model for helper tasks (web fetch summaries, web search). |
| `MAX_TOKENS` | `2000` | Maximum tokens per reply. If it's too low, replies are cut off and the agent warns you. |

A `.env` in the directory you run `antaeus` from takes precedence over this repo's `.env`.
After changing `.env`, restart the agent.

## Usage

Run it from inside any project:

```bash
antaeus                       # launch the TUI
antaeus --continue            # resume the most recent session
antaeus --resume <n|id>       # resume a specific session
antaeus --plain               # plain line-based REPL (also used when stdin is not a TTY)
antaeus --stdio               # headless JSON-lines mode, used by editor integrations
```

Inside this repo, `npm start` works too.

Commands: `/new`, `/sessions`, `/resume [n|id]`, `/delete <n|id>`, `/session`, `/help`, `/exit`.

Keys: `esc` interrupts the agent, `tab` completes commands, `↑/↓` browses prompt history,
`ctrl+c` quits. Sessions are stored in `.agent/sessions/` in the project you run it from.

## VS Code extension

The [vscode-extension/](vscode-extension/) folder holds a chat panel for VS Code with streaming replies,
tool approvals, and native diffs for proposed edits. See its [README](vscode-extension/README.md) to
build and install it.

## Project structure

```
bin/antaeus.js        entry point for the `antaeus` command
src/
  index.ts            parses flags and starts the TUI, REPL, or stdio server
  server.ts           headless --stdio mode for editor integrations
  repl.ts             plain line-based interface
  agent/              agent loop, sessions, slash commands
  context/            truncating, clearing, and compacting conversation history
  llm/openrouter.ts   API client
  tools/              tool definitions and registry
  tui/                terminal UI (Ink)
  utils/              logging, schemas, tool batching
vscode-extension/     VS Code extension
```
