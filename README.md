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