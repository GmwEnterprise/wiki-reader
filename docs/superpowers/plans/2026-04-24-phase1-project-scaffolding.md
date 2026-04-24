# Phase 1: 项目基础搭建

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 Electron + React + Vite 项目脚手架，应用能启动并显示包含工具栏、侧栏和主内容区的基本窗口布局。

**Architecture:** 使用 `electron-vite` 作为构建工具管理主进程、预加载脚本和渲染进程的三路构建。主进程创建 BrowserWindow 并加载渲染进程页面。渲染进程使用 React 构建界面，采用全局状态管理 workspace 和文档状态。

**Tech Stack:** Electron 33+, React 18, TypeScript 5, electron-vite, Vitest

**前置条件:** Node.js >= 18, npm >= 9

---

## 文件结构

本阶段完成后项目结构：

```
wiki-reader/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── electron-builder.json5
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   └── window.ts
│   ├── preload/
│   │   └── index.ts
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── App.css
│           ├── types.ts
│           └── env.d.ts
├── resources/
│   └── icon.png
```

---

### Task 1: 初始化 npm 项目并安装依赖

**Files:**
- Create: `package.json`

- [ ] **Step 1: 初始化项目并安装依赖**

```bash
cd /mnt/c/Users/90949/myprojects/wiki-reader
npm init -y
```

- [ ] **Step 2: 安装核心依赖**

```bash
npm install react react-dom
npm install -D electron electron-vite electron-builder typescript @types/react @types/react-dom vitest
```

- [ ] **Step 3: 确认安装成功**

```bash
npx electron --version
```

Expected: 输出 Electron 版本号（如 v33.x.x）

- [ ] **Step 4: 配置 package.json**

将 `package.json` 修改为以下内容（保留已安装的依赖版本号）：

```json
{
  "name": "wiki-reader",
  "version": "0.1.0",
  "description": "本地 Markdown Wiki Reader",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.6.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "vitest": "^2.1.0"
  }
}
```

> 注意：实际版本号以 npm install 安装的为准，这里给出的是最低要求版本。安装完成后只需修改 `main`、`description` 和 `scripts` 字段。

- [ ] **Step 5: Commit**

```bash
git init
git add package.json package-lock.json
git commit -m "chore: init project with electron, react, vite dependencies"
```

---

### Task 2: 配置 TypeScript 和构建工具

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `electron.vite.config.ts`
- Create: `electron-builder.json5`

- [ ] **Step 1: 创建 tsconfig.json（根配置）**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

- [ ] **Step 2: 创建 tsconfig.node.json（主进程 + preload）**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/main/**/*", "src/preload/**/*"]
}
```

- [ ] **Step 3: 创建 tsconfig.web.json（渲染进程）**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "outDir": "./out",
    "rootDir": "./src/renderer",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/renderer/**/*"]
}
```

- [ ] **Step 4: 创建 electron.vite.config.ts**

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      outDir: resolve('out/renderer')
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 5: 安装 vite-plugin-react**

```bash
npm install -D @vitejs/plugin-react
```

- [ ] **Step 6: 创建 electron-builder.json5（打包配置，暂写最小配置）**

```json5
{
  appId: "com.wiki-reader.app",
  productName: "Wiki Reader",
  directories: {
    output: "dist"
  },
  files: [
    "out/**/*"
  ]
}
```

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json tsconfig.node.json tsconfig.web.json electron.vite.config.ts electron-builder.json5 package.json package-lock.json
git commit -m "chore: add typescript, electron-vite, and electron-builder config"
```

---

### Task 3: 创建主进程入口

**Files:**
- Create: `src/main/index.ts`
- Create: `src/main/window.ts`

- [ ] **Step 1: 创建 src/main/window.ts**

```ts
import { BrowserWindow, shell } from 'electron'
import { join } from 'path'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Wiki Reader',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  return win
}
```

- [ ] **Step 2: 创建 src/main/index.ts**

```ts
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 3: Commit**

```bash
mkdir -p src/main
git add src/main/
git commit -m "feat(main): add main process entry and window creation"
```

---

### Task 4: 创建预加载脚本

**Files:**
- Create: `src/preload/index.ts`

- [ ] **Step 1: 创建 src/preload/index.ts**

```ts
import { contextBridge } from 'electron'

const api = {}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/preload
git add src/preload/
git commit -m "feat(preload): add preload script with empty api bridge"
```

---

### Task 5: 创建渲染进程入口和类型声明

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/env.d.ts`
- Create: `src/renderer/src/types.ts`

- [ ] **Step 1: 创建 src/renderer/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wiki Reader</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: 创建 src/renderer/src/env.d.ts**

```ts
export {}

declare global {
  interface Window {
    api: {}
  }
}
```

- [ ] **Step 3: 创建 src/renderer/src/types.ts**

```ts
export type Workspace = {
  id: string
  rootPath: string
  name: string
}

export type WikiFile = {
  relativePath: string
  name: string
  mtimeMs: number
  size: number
}

export type DocumentState = {
  file: WikiFile | null
  content: string
  mode: 'preview' | 'source'
  dirty: boolean
}

export type Heading = {
  id: string
  level: number
  text: string
}
```

- [ ] **Step 4: 创建 src/renderer/src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Commit**

```bash
mkdir -p src/renderer/src
git add src/renderer/
git commit -m "feat(renderer): add renderer entry, type definitions, and html shell"
```

---

### Task 6: 创建 App 组件和基础布局

**Files:**
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/App.css`

- [ ] **Step 1: 创建 src/renderer/src/App.tsx**

```tsx
import { useState } from 'react'
import type { DocumentState } from './types'

export default function App() {
  const [doc, setDoc] = useState<DocumentState>({
    file: null,
    content: '',
    mode: 'preview',
    dirty: false
  })

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <span className="toolbar-title">Wiki Reader</span>
        </div>
        <div className="toolbar-right">
          <span className="toolbar-status">
            {doc.file ? (doc.dirty ? '未保存' : '已保存') : ''}
          </span>
        </div>
      </header>
      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-empty">未打开文件夹</div>
        </aside>
        <main className="content">
          <div className="content-empty">请打开一个文件夹开始阅读</div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 src/renderer/src/App.css**

```css
:root {
  --bg: #ffffff;
  --bg-sidebar: #f7f7f7;
  --bg-toolbar: #fafafa;
  --text: #333333;
  --text-secondary: #888888;
  --border: #e5e5e5;
  --accent: #4a90d9;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--text);
  background: var(--bg);
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 12px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  -webkit-app-region: drag;
  user-select: none;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-title {
  font-size: 13px;
  font-weight: 600;
}

.toolbar-status {
  font-size: 12px;
  color: var(--text-secondary);
}

.body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 240px;
  min-width: 200px;
  max-width: 400px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-empty,
.content-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 14px;
}

.content {
  flex: 1;
  overflow-y: auto;
}
```

- [ ] **Step 3: 创建 resources 占位**

```bash
mkdir -p resources
touch resources/.gitkeep
```

- [ ] **Step 4: 创建 .gitignore**

```
node_modules/
out/
dist/
.tmp/
```

- [ ] **Step 5: 启动开发服务器验证**

```bash
npm run dev
```

Expected: Electron 窗口启动，显示工具栏、左侧灰色侧栏（显示"未打开文件夹"）和右侧主内容区（显示"请打开一个文件夹开始阅读"）。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css resources/.gitkeep .gitignore
git commit -m "feat(renderer): add App component with basic toolbar, sidebar, and content layout"
```

---

## 自检清单

- [ ] `npm run dev` 能启动 Electron 窗口
- [ ] 窗口显示三段式布局：顶部工具栏、左侧栏、右侧内容区
- [ ] `npm run build` 能成功构建到 `out/` 目录
- [ ] TypeScript 类型检查通过
