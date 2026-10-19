# Antaeus

A terminal coding agent with a full TUI, saved sessions, and tool approvals.

## Install

```bash
npm install
npm link        # puts the `antaeus` command on your PATH
```

Put `OPENROUTER_API_KEY` (and optionally `PRIMARY_MODEL`, `CHEAP_MODEL`, `MAX_TOKENS`) in this repo's `.env`.
A `.env` in the directory you run `antaeus` from takes precedence.

## Usage

Run it from inside any project:

```bash
antaeus                       # launch the TUI
antaeus --continue            # resume the most recent session
antaeus --resume <n|id>       # resume a specific session
antaeus --plain               # plain line-based REPL (also used when stdin is not a TTY)
```

Inside this repo, `npm start` works too.

Commands: `/new`, `/sessions`, `/resume [n|id]`, `/delete <n|id>`, `/session`, `/help`, `/exit`.

Keys: `esc` interrupts the agent, `tab` completes commands, `↑/↓` browses prompt history,
`ctrl+c` quits. Sessions are stored in `.agent/sessions/`.

Recommended structure:

coding-agent/
│
├── src/
│   │
│   ├── index.ts
│   │
│   ├── agent/
│   │   ├── agent.ts
│   │   ├── loop.ts
│   │   └── types.ts
│   │
│   ├── llm/
│   │   ├── provider.ts
│   │   └── openrouter.ts
│   │
│   ├── tools/
│   │   ├── registry.ts
│   │   ├── types.ts
│   │   │
│   │   ├── search-files.ts
│   │   ├── read-file.ts
│   │   ├── write-file.ts
│   │   ├── edit-file.ts
│   │   ├── run-command.ts
│   │   └── git.ts
│   │
│   ├── context/
│   │   ├── conversation.ts
│   │   └── workspace.ts
│   │
│   └── utils/
│       ├── errors.ts
│       └── logger.ts
│
├── .env
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md