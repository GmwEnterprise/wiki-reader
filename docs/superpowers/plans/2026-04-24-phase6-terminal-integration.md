# Phase 6: 终端集成

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在主界面底部集成可展开/收起的终端面板，使用 xterm.js 显示和交互真实 shell，面板高度可拖拽调整。

**Architecture:** 主进程使用 `node-pty` 启动真实 shell 进程，根据平台选择 PowerShell（Windows）或 bash（Linux/macOS）。渲染进程使用 `@xterm/xterm` 显示终端 UI，通过 IPC 进行数据传输。终端面板通过拖拽分隔条调整高度。

**Tech Stack:** @xterm/xterm, @xterm/addon-fit, node-pty

**前置条件:** Phase 5 完成。

---

## 文件结构

```
src/
├── main/
│   ├── terminal.ts          # 新增：pty 管理
│   └── ipc-handlers.ts      # 修改：添加终端 handlers
├── preload/
│   └── index.ts             # 修改：暴露终端 API
└── renderer/
    └── src/
        ├── components/
        │   └── Terminal.tsx  # 新增：终端组件
        ├── hooks/
        │   └── useTerminal.ts # 新增
        ├── App.tsx           # 修改
        ├── App.css           # 修改
        └── env.d.ts          # 修改
```

---

### Task 1: 安装终端依赖

- [ ] **Step 1: 安装 xterm 和 node-pty**

```bash
npm install @xterm/xterm @xterm/addon-fit node-pty
```

> `node-pty` 是原生模块，需要编译环境。Windows 上需要 Visual Studio Build Tools，Linux 上需要 build-essential，macOS 上需要 Xcode Command Line Tools。

- [ ] **Step 2: 确认 node-pty 编译成功**

```bash
node -e "require('node-pty')"
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add xterm.js and node-pty dependencies"
```

---

### Task 2: 创建主进程终端模块

**Files:**
- Create: `src/main/terminal.ts`

- [ ] **Step 1: 创建 src/main/terminal.ts**

```ts
import os from 'os'
import path from 'path'
import { BrowserWindow } from 'electron'

const ptyInstances = new Map<number, any>()

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

export function createTerminal(
  win: BrowserWindow,
  cwd: string,
  id: number
): void {
  const pty = require('node-pty')
  const shell = getDefaultShell()

  let ptyProcess: any
  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: { ...process.env } as Record<string, string>
    })
  } catch (err: any) {
    win.webContents.send('terminal:error', id, `终端启动失败: ${err.message}`)
    return
  }

  ptyProcess.onData((data: string) => {
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:data', id, data)
    }
  })

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', id, exitCode)
    }
    ptyInstances.delete(id)
  })

  ptyInstances.set(id, ptyProcess)
}

export function terminalWrite(id: number, data: string): void {
  const ptyProcess = ptyInstances.get(id)
  if (ptyProcess) {
    ptyProcess.write(data)
  }
}

export function terminalResize(id: number, cols: number, rows: number): void {
  const ptyProcess = ptyInstances.get(id)
  if (ptyProcess) {
    ptyProcess.resize(cols, rows)
  }
}

export function terminalKill(id: number): void {
  const ptyProcess = ptyInstances.get(id)
  if (ptyProcess) {
    ptyProcess.kill()
    ptyInstances.delete(id)
  }
}

export function killAllTerminals(): void {
  for (const [id, ptyProcess] of ptyInstances) {
    ptyProcess.kill()
  }
  ptyInstances.clear()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/terminal.ts
git commit -m "feat(main): add terminal module with node-pty management"
```

---

### Task 3: 添加终端 IPC handlers

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 在 src/main/ipc-handlers.ts 中添加终端 handlers**

在文件顶部导入终端模块：

```ts
import { createTerminal, terminalWrite, terminalResize, terminalKill } from './terminal'
```

在 `registerIpcHandlers` 函数末尾添加：

```ts
  ipcMain.handle('terminal:create', (event, id: number, cwd: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      createTerminal(win, cwd, id)
    }
  })

  ipcMain.on('terminal:write', (_event, id: number, data: string) => {
    terminalWrite(id, data)
  })

  ipcMain.on('terminal:resize', (_event, id: number, cols: number, rows: number) => {
    terminalResize(id, cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, id: number) => {
    terminalKill(id)
  })
```

- [ ] **Step 2: 在 src/main/index.ts 中处理窗口关闭时销毁终端**

修改文件：

```ts
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { registerIpcHandlers } from './ipc-handlers'
import { killAllTerminals } from './terminal'

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  killAllTerminals()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat(main): add terminal IPC handlers and cleanup on window close"
```

---

### Task 4: 更新 preload 和类型

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`

- [ ] **Step 1: 修改 src/preload/index.ts，添加终端 API**

```ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
  scanFiles: (rootPath: string) => ipcRenderer.invoke('workspace:scanFiles', rootPath),
  readFile: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('workspace:readFile', rootPath, relativePath),
  saveFile: (rootPath: string, relativePath: string, content: string) =>
    ipcRenderer.invoke('workspace:saveFile', rootPath, relativePath, content),
  watchWorkspace: (rootPath: string) => ipcRenderer.invoke('workspace:watch', rootPath),
  unwatchWorkspace: (rootPath: string) => ipcRenderer.invoke('workspace:unwatch', rootPath),
  onFilesChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('workspace:filesChanged', handler)
    return () => ipcRenderer.removeListener('workspace:filesChanged', handler)
  },
  terminalCreate: (id: number, cwd: string) => ipcRenderer.invoke('terminal:create', id, cwd),
  terminalWrite: (id: number, data: string) => ipcRenderer.send('terminal:write', id, data),
  terminalResize: (id: number, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', id, cols, rows),
  terminalKill: (id: number) => ipcRenderer.invoke('terminal:kill', id),
  onTerminalData: (callback: (data: string) => void) => {
    const handler = (_event: any, _id: number, data: string) => callback(data)
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.removeListener('terminal:data', handler)
  },
  onTerminalExit: (callback: (exitCode: number) => void) => {
    const handler = (_event: any, _id: number, exitCode: number) => callback(exitCode)
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },
  onTerminalError: (callback: (error: string) => void) => {
    const handler = (_event: any, _id: number, error: string) => callback(error)
    ipcRenderer.on('terminal:error', handler)
    return () => ipcRenderer.removeListener('terminal:error', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 2: 修改 src/renderer/src/env.d.ts，更新类型**

```ts
export {}

declare global {
  interface Window {
    api: {
      openFolder: () => Promise<{ rootPath: string; name: string } | null>
      scanFiles: (rootPath: string) => Promise<import('./types').WikiFile[]>
      readFile: (
        rootPath: string,
        relativePath: string
      ) => Promise<{ success: boolean; content?: string; error?: string }>
      saveFile: (
        rootPath: string,
        relativePath: string,
        content: string
      ) => Promise<{ success: boolean; error?: string }>
      watchWorkspace: (rootPath: string) => Promise<void>
      unwatchWorkspace: (rootPath: string) => Promise<void>
      onFilesChanged: (callback: () => void) => () => void
      terminalCreate: (id: number, cwd: string) => Promise<void>
      terminalWrite: (id: number, data: string) => void
      terminalResize: (id: number, cols: number, rows: number) => void
      terminalKill: (id: number) => Promise<void>
      onTerminalData: (callback: (data: string) => void) => () => void
      onTerminalExit: (callback: (exitCode: number) => void) => () => void
      onTerminalError: (callback: (error: string) => void) => () => void
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat(preload): expose terminal API to renderer"
```

---

### Task 5: 创建终端组件

**Files:**
- Create: `src/renderer/src/components/Terminal.tsx`

- [ ] **Step 1: 创建 src/renderer/src/components/Terminal.tsx**

```tsx
import { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

type TerminalProps = {
  visible: boolean
  workspaceRoot: string | null
}

const TERMINAL_ID = 1

export default function TerminalPanel({ visible, workspaceRoot }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [error, setError] = useState<string | null>(null)

  const initTerminal = useCallback(() => {
    if (!containerRef.current || xtermRef.current || !workspaceRoot) return

    const xterm = new XTerm({
      theme: {
        background: '#1e1e20',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: 'rgba(74, 144, 217, 0.3)'
      },
      fontSize: 13,
      fontFamily: "'SF Mono', 'Consolas', 'Liberation Mono', monospace",
      cursorBlink: true
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.open(containerRef.current)
    fitAddon.fit()

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    xterm.onData((data) => {
      window.api.terminalWrite(TERMINAL_ID, data)
    })

    const unsubscribeData = window.api.onTerminalData((data) => {
      xterm.write(data)
    })

    const unsubscribeExit = window.api.onTerminalExit(() => {
      setError('终端已退出')
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    })

    const unsubscribeError = window.api.onTerminalError((err) => {
      setError(err)
    })

    window.api.terminalCreate(TERMINAL_ID, workspaceRoot)

    return () => {
      unsubscribeData()
      unsubscribeExit()
      unsubscribeError()
    }
  }, [workspaceRoot])

  useEffect(() => {
    if (visible && workspaceRoot) {
      const cleanup = initTerminal()
      return () => {
        cleanup?.()
      }
    }
  }, [visible, workspaceRoot, initTerminal])

  useEffect(() => {
    if (visible && fitAddonRef.current) {
      const timer = setTimeout(() => {
        fitAddonRef.current?.fit()
        if (xtermRef.current) {
          const { cols, rows } = xtermRef.current
          window.api.terminalResize(TERMINAL_ID, cols, rows)
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [visible])

  const handleClose = useCallback(() => {
    window.api.terminalKill(TERMINAL_ID)
    xtermRef.current?.dispose()
    xtermRef.current = null
    fitAddonRef.current = null
    setError(null)
  }, [])

  return (
    <div className={`terminal-panel ${visible ? 'terminal-panel--visible' : ''}`}>
      <div className="terminal-header">
        <span className="terminal-title">终端</span>
        <button className="terminal-close" onClick={handleClose}>
          ✕
        </button>
      </div>
      <div className="terminal-body" ref={containerRef}>
        {error && <div className="terminal-error">{error}</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/Terminal.tsx
git commit -m "feat(renderer): add Terminal component with xterm.js integration"
```

---

### Task 6: 创建 useTerminal hook

**Files:**
- Create: `src/renderer/src/hooks/useTerminal.ts`

- [ ] **Step 1: 创建 src/renderer/src/hooks/useTerminal.ts**

```ts
import { useState, useCallback } from 'react'

export function useTerminal() {
  const [visible, setVisible] = useState(false)

  const toggle = useCallback(() => {
    setVisible((prev) => !prev)
  }, [])

  return { visible, toggle }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/hooks/useTerminal.ts
git commit -m "feat(renderer): add useTerminal hook"
```

---

### Task 7: 接入 App 组件和拖拽调整高度

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

- [ ] **Step 1: 在 App.tsx 中添加终端按钮和面板**

添加导入：

```tsx
import { useTerminal } from './hooks/useTerminal'
import TerminalPanel from './components/Terminal'
```

在 App 组件内部添加：

```tsx
const { visible: terminalVisible, toggle: toggleTerminal } = useTerminal()
```

在工具栏右侧添加终端按钮（在 ThemeToggle 之前）：

```tsx
{workspace && (
  <button
    className="toolbar-btn toolbar-btn--ghost"
    onClick={toggleTerminal}
    title={terminalVisible ? '隐藏终端' : '显示终端'}
  >
    终端
  </button>
)}
```

在 `.body` div 之后、`</div>` 之前添加终端面板：

```tsx
      </div>
      <TerminalPanel visible={terminalVisible} workspaceRoot={workspace?.rootPath ?? null} />
    </div>
```

- [ ] **Step 2: 在 App.css 末尾追加终端样式**

```css
.terminal-panel {
  height: 0;
  display: flex;
  flex-direction: column;
  background: #1e1e20;
  border-top: 1px solid var(--border);
  overflow: hidden;
  transition: height 0.15s ease;
  flex-shrink: 0;
}

.terminal-panel--visible {
  height: 250px;
}

.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 32px;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.terminal-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.terminal-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 3px;
}

.terminal-close:hover {
  background: var(--bg-hover);
}

.terminal-body {
  flex: 1;
  padding: 4px 8px;
  overflow: hidden;
  position: relative;
}

.terminal-body .xterm {
  height: 100%;
}

.terminal-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #f87171;
  font-size: 13px;
  font-family: 'SF Mono', 'Consolas', monospace;
}
```

- [ ] **Step 3: 添加拖拽调整高度功能**

在 App.tsx 中添加拖拽逻辑。在终端面板渲染位置替换为：

```tsx
<TerminalPanel
  visible={terminalVisible}
  workspaceRoot={workspace?.rootPath ?? null}
  panelRef={terminalPanelRef}
/>
{terminalVisible && (
  <div
    className="terminal-resize-handle"
    onMouseDown={handleTerminalResize}
  />
)}
```

在 App 组件内部添加：

```tsx
const terminalPanelRef = useRef<HTMLDivElement>(null)

const handleTerminalResize = useCallback((e: React.MouseEvent) => {
  e.preventDefault()
  const startY = e.clientY
  const panel = terminalPanelRef.current
  if (!panel) return
  const startHeight = panel.getBoundingClientRect().height

  const onMouseMove = (moveEvent: MouseEvent) => {
    const delta = startY - moveEvent.clientY
    const newHeight = Math.max(100, Math.min(600, startHeight + delta))
    panel.style.height = `${newHeight}px`
  }

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    if (xtermRef.current) {
      const fitAddon = fitAddonRef.current
      fitAddon?.fit()
    }
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}, [])
```

在 CSS 中添加：

```css
.terminal-resize-handle {
  height: 4px;
  cursor: ns-resize;
  background: transparent;
  flex-shrink: 0;
}

.terminal-resize-handle:hover {
  background: var(--accent);
  opacity: 0.3;
}
```

需要将 `terminalPanelRef` 和 resize handler 传入 TerminalPanel。修改 TerminalPanel 组件接受 `panelRef`：

在 Terminal.tsx 的 props 中添加 `panelRef`:

```tsx
type TerminalProps = {
  visible: boolean
  workspaceRoot: string | null
  panelRef?: React.RefObject<HTMLDivElement>
}
```

并将 `panelRef` 附加到 `.terminal-panel` div：

```tsx
<div ref={panelRef} className={`terminal-panel ${visible ? 'terminal-panel--visible' : ''}`}>
```

同时，终端面板在 `.terminal-panel--visible` 中不再使用固定高度 CSS 过渡，改由 JS 控制：

```css
.terminal-panel--visible {
  height: 250px; /* 默认高度，可被 JS 覆盖 */
}
```

- [ ] **Step 4: 启动验证**

```bash
npm run dev
```

验证步骤：
1. 打开一个文件夹
2. 点击工具栏"终端"按钮，底部展开终端面板
3. 终端显示 shell 提示符，可输入命令
4. Windows 下默认 PowerShell，Linux/macOS 下默认 bash
5. 拖拽终端面板顶部边缘可调整高度
6. 点击终端右上角"✕"关闭终端
7. 再次点击"终端"按钮可重新打开
8. 终端启动目录为当前 workspace 根目录

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css src/renderer/src/components/Terminal.tsx src/renderer/src/hooks/useTerminal.ts
git commit -m "feat: integrate terminal panel with drag resize and shell management"
```

---

## 自检清单

- [ ] 终端面板可展开/收起
- [ ] Windows 下默认启动 PowerShell
- [ ] Linux/macOS 下默认启动 bash
- [ ] 可在终端中输入命令并看到输出
- [ ] 终端面板高度可拖拽调整
- [ ] 关闭终端按钮能销毁 pty 进程
- [ ] 窗口关闭时所有 pty 被清理
- [ ] 终端启动目录为 workspace 根目录
- [ ] pty 启动失败时有错误提示
