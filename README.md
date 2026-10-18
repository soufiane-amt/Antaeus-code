# Coding Agent

A terminal coding agent with a full TUI, saved sessions, and tool approvals.

## Usage

```bash
npm start                     # launch the TUI
npm start -- --continue       # resume the most recent session
npm start -- --resume <n|id>  # resume a specific session
npm run start:plain           # plain line-based REPL (also used when stdin is not a TTY)
```

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