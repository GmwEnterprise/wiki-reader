# Wiki Reader

A local Markdown wiki reader built with Electron, providing a Typora-like distraction-free reading experience while retaining source code viewing and editing capabilities.

[中文文档](./README.zh.md)

## Features

- **Markdown Rendering** — Powered by markdown-it + highlight.js with syntax highlighting
- **Source Code Editor** — CodeMirror 6 based editor with manual save (Ctrl+S)
- **File Tree Browser** — Open any folder and browse Markdown files in a tree view
- **Heading Navigation** — Extract and navigate document headings
- **Built-in Terminal** — Integrated terminal panel with xterm.js + node-pty, supporting multiple tabs
- **Theme Switching** — Light and dark themes with localStorage persistence
- **Multi-Window** — Open multiple folders in separate windows with single-instance lock
- **Welcome Page** — Recent folders quick access with Jump List integration (Windows)
- **Custom Font** — Maple Mono NF CN unified font

## Tech Stack

| Technology | Purpose |
|---|---|
| Electron 33+ | Desktop application framework |
| React 18 | UI rendering |
| TypeScript 5 | Type safety |
| electron-vite | Build tooling |
| markdown-it | Markdown parsing & rendering |
| highlight.js | Code syntax highlighting |
| CodeMirror 6 | Source code editor |
| xterm.js / node-pty | Integrated terminal |
| chokidar | File system watching |
| Vitest | Unit testing |

## Project Structure

```
wiki-reader/
├── src/
│   ├── main/              # Electron main process
│   ├── preload/           # Preload scripts (contextBridge API)
│   └── renderer/          # Renderer process (React)
│       └── src/
│           ├── components/    # UI components
│           ├── hooks/         # Custom React hooks
│           └── utils/         # Utility functions
├── tests/unit/            # Unit tests (Vitest)
├── resources/             # Fonts & icons
├── docs/                  # Design docs & plans
└── build/                 # Build resources
```

## Getting Started

### Prerequisites

- **Node.js** 18+
- **pnpm** (package manager)
- **Windows**: Visual Studio Build Tools with "Desktop development with C++" workload (required by node-pty)
- **Windows**: Python 3.x in PATH (required by node-gyp)
- **Windows**: Developer Mode enabled (for electron-builder symlinks)

### Install & Run

```bash
pnpm install
pnpm dev
```

### Build

```bash
# Windows installer (NSIS .exe)
pnpm build:win

# Unpacked directory (for quick verification)
pnpm build:unpack

# macOS
pnpm build:mac

# Linux
pnpm build:linux
```

### Other Commands

```bash
pnpm test            # Run unit tests
pnpm test:watch      # Run tests in watch mode
pnpm typecheck       # TypeScript type checking
pnpm lint            # ESLint
pnpm format          # Prettier formatting
```

## Screenshots

> Screenshots TBD

## License

[MIT](./LICENSE)


