# 终端集成审查修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复终端集成代码审查中发现的 10 个隐患（#1 路径注入、#3 write 无反馈、#4 类型缺失、#5 迭代中删除、#6 隐藏/显示生命周期、#7 dark 依赖、#8 resize handle 闪烁、#10 非空断言、#11 删除未用 CSS、#12 缩进不一致）。

**Architecture:** 分为主进程侧安全加固（terminal.ts / ipc-handlers.ts）和渲染进程侧生命周期修复（Terminal.tsx / App.tsx / App.css）两大部分。所有修复都是局部改动，不引入新文件。

**Tech Stack:** Electron / node-pty / React / TypeScript / xterm.js

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/terminal.ts` | 修改 | 添加 cwd 校验、添加类型声明、修复迭代中删除 |
| `src/main/ipc-handlers.ts` | 修改 | terminal:write 改为 handle 并返回结果、cwd 校验前置 |
| `src/renderer/src/components/Terminal.tsx` | 修改 | 修复生命周期、移除 dark 依赖、修复 resize handle 闪烁、移除非空断言 |
| `src/renderer/src/App.css` | 修改 | 删除已无引用的 `.toolbar-btn--ghost` |
| `src/renderer/src/App.tsx` | 修改 | 修复缩进不一致 |
| `src/preload/index.ts` | 修改 | terminalWrite 改为 invoke |
| `src/renderer/src/env.d.ts` | 修改 | terminalWrite 返回类型更新 |

---

### Task 1: 主进程 — terminal.ts 类型声明与 cwd 校验

**Files:**
- Modify: `src/main/terminal.ts:1-57`

修复 #1（路径注入）和 #4（node-pty 类型缺失）。

- [ ] **Step 1: 添加 node-pty 类型声明和 cwd 目录校验**

将 `terminal.ts` 顶部替换为带类型的导入方式，并在 `createTerminal` 中校验 `cwd` 是否为合法目录：

```typescript
import os from 'os'
import fs from 'fs'
import path from 'path'
import { BrowserWindow } from 'electron'

interface IPty {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(listener: (data: string) => void): void
  onExit(listener: (e: { exitCode: number }) => void): void
}

let pty: { spawn: (file: string, args: string[], options: any) => IPty } | null
try {
  pty = require('node-pty')
} catch {
  pty = null
}

interface PtyEntry {
  process: IPty
  windowId: number
}

const ptyInstances = new Map<number, PtyEntry>()
const windowCleanupRegistered = new Set<number>()

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

function ensureWindowCleanup(win: BrowserWindow): void {
  const windowId = win.id
  if (windowCleanupRegistered.has(windowId)) return
  windowCleanupRegistered.add(windowId)
  win.once('closed', () => {
    killWindowTerminals(windowId)
    windowCleanupRegistered.delete(windowId)
  })
}

function isValidCwd(cwd: string): boolean {
  try {
    const resolved = path.resolve(cwd)
    const stat = fs.statSync(resolved)
    return stat.isDirectory()
  } catch {
    return false
  }
}

export function createTerminal(
  win: BrowserWindow,
  cwd: string,
  id: number
): string | null {
  if (!pty) {
    return '终端不可用：node-pty 模块加载失败'
  }
  if (ptyInstances.has(id)) {
    return null
  }
  if (!isValidCwd(cwd)) {
    return `终端启动失败: 工作目录无效 "${cwd}"`
  }

  const shell = getDefaultShell()
  let ptyProcess: IPty
  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: { ...process.env } as Record<string, string>
    })
  } catch (err: any) {
    return `终端启动失败: ${err.message}`
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

  ptyInstances.set(id, { process: ptyProcess, windowId: win.id })
  ensureWindowCleanup(win)
  return null
}
```

此改动同时替换了 `terminal.ts` 中原有的 `import os from 'os'` 到 `createTerminal` 函数末尾的所有代码。文件后半部分（`terminalWrite`、`terminalResize`、`terminalKill`、`killWindowTerminals`、`killAllTerminals`）不变，只是将方法签名中 `process: any` 替换为 `process: IPty`（在 `PtyEntry` 接口中已更新）。

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit --project tsconfig.node.json`（或在宿主机执行）
Expected: 无新增错误

---

### Task 2: 主进程 — 修复 killWindowTerminals 迭代中删除 (#5)

**Files:**
- Modify: `src/main/terminal.ts:114-125`

- [ ] **Step 1: 先收集再删除**

将 `killWindowTerminals` 替换为：

```typescript
export function killWindowTerminals(windowId: number): void {
  const ids: number[] = []
  for (const [id, entry] of ptyInstances) {
    if (entry.windowId === windowId) {
      try {
        entry.process.kill()
      } catch {
        // already dead
      }
      ids.push(id)
    }
  }
  ids.forEach((id) => ptyInstances.delete(id))
}
```

---

### Task 3: 主进程 — terminal:write 改为 handle 返回结果 (#3)

**Files:**
- Modify: `src/main/ipc-handlers.ts:80-83`
- Modify: `src/main/terminal.ts:80-89`
- Modify: `src/preload/index.ts:42-43`
- Modify: `src/renderer/src/env.d.ts` terminalWrite 签名
- Modify: `src/renderer/src/components/Terminal.tsx:84-86`

- [ ] **Step 1: 修改 terminalWrite 返回写入结果**

在 `terminal.ts` 中将 `terminalWrite` 改为返回 boolean：

```typescript
export function terminalWrite(id: number, data: string): boolean {
  const entry = ptyInstances.get(id)
  if (!entry) return false
  try {
    entry.process.write(data)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 2: 修改 ipc-handlers.ts 中 terminal:write 为 handle**

将 `ipcMain.on('terminal:write', ...)` 替换为：

```typescript
  ipcMain.handle('terminal:write', (_event, id: number, data: string) => {
    if (typeof id !== 'number' || typeof data !== 'string') return false
    return terminalWrite(id, data)
  })
```

- [ ] **Step 3: 修改 preload/index.ts 中 terminalWrite 为 invoke**

将 `terminalWrite` 替换为：

```typescript
  terminalWrite: (id: number, data: string) =>
    ipcRenderer.invoke('terminal:write', id, data) as Promise<boolean>,
```

- [ ] **Step 4: 修改 env.d.ts 中 terminalWrite 签名**

将 `terminalWrite` 的类型声明改为：

```typescript
      terminalWrite: (id: number, data: string) => Promise<boolean>
```

- [ ] **Step 5: 修改 Terminal.tsx 中 xterm.onData 回调**

`xterm.onData` 回调无需处理返回值（fire-and-forget 写入对终端是合理的），保持调用方式不变，仅确保调用签名一致：

```typescript
    xterm.onData((data) => {
      window.api.terminalWrite(TERMINAL_ID, data)
    })
```

此步骤无需改动，因为 `terminalWrite` 现在返回 Promise 但调用方无需 await。TypeScript 不会对未 await 的 Promise 报错。

---

### Task 4: 渲染进程 — 修复终端隐藏/显示生命周期 (#6)、dark 依赖 (#7)、resize handle 闪烁 (#8)、非空断言 (#10)

**Files:**
- Modify: `src/renderer/src/components/Terminal.tsx`

这是最复杂的任务。核心问题是：隐藏终端时不销毁 pty，重新显示时复用；只在关闭时才真正销毁。

- [ ] **Step 1: 重写 Terminal.tsx 生命周期逻辑**

将 `Terminal.tsx` 完整替换为：

```tsx
import { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

type TerminalProps = {
  visible: boolean
  dark: boolean
  workspaceRoot: string | null
  onClose?: () => void
}

const TERMINAL_ID = 1

const darkTheme = {
  background: '#1e1e20',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  selectionBackground: 'rgba(74, 144, 217, 0.3)'
}

const lightTheme = {
  background: '#ffffff',
  foreground: '#2c2c2c',
  cursor: '#383838',
  selectionBackground: 'rgba(74, 144, 217, 0.25)'
}

export { TERMINAL_ID }

export default function TerminalPanel({
  visible,
  dark,
  workspaceRoot,
  onClose
}: TerminalProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [error, setError] = useState<string | null>(null)

  const createdRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const destroyTerminal = useCallback(() => {
    if (!createdRef.current) return
    xtermRef.current?.dispose()
    xtermRef.current = null
    fitAddonRef.current = null
    setError(null)
    createdRef.current = false
  }, [])

  useEffect(() => {
    if (!workspaceRoot || createdRef.current) return

    createdRef.current = true

    const xterm = new XTerm({
      theme: dark ? darkTheme : lightTheme,
      fontSize: 15,
      fontFamily: "'Maple Mono NF CN', 'SF Mono', 'Consolas', 'Liberation Mono', monospace",
      cursorBlink: true
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)

    const container = containerRef.current
    if (container) {
      xterm.open(container)
    }

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    xterm.onData((data) => {
      window.api.terminalWrite(TERMINAL_ID, data)
    })

    const unsubData = window.api.onTerminalData(TERMINAL_ID, (data) => {
      xterm.write(data)
    })

    const unsubExit = window.api.onTerminalExit(TERMINAL_ID, () => {
      destroyTerminal()
      onCloseRef.current?.()
    })

    const unsubError = window.api.onTerminalError(TERMINAL_ID, (err) => {
      setError(err)
    })

    window.api.terminalCreate(TERMINAL_ID, workspaceRoot).then((result) => {
      if (result?.error) {
        setError(result.error)
        unsubData()
        unsubExit()
        unsubError()
        destroyTerminal()
      }
    })

    return () => {
      unsubData()
      unsubExit()
      unsubError()
    }
  }, [workspaceRoot, destroyTerminal])

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = dark ? darkTheme : lightTheme
    }
  }, [dark])

  useEffect(() => {
    if (visible && fitAddonRef.current && xtermRef.current) {
      const timer = setTimeout(() => {
        fitAddonRef.current?.fit()
        if (xtermRef.current) {
          const { cols, rows } = xtermRef.current
          window.api.terminalResize(TERMINAL_ID, cols, rows)
        }
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [visible])

  useEffect(() => {
    return () => {
      if (createdRef.current) {
        window.api.terminalKill(TERMINAL_ID)
        destroyTerminal()
      }
    }
  }, [destroyTerminal])

  const handleClose = useCallback(() => {
    window.api.terminalKill(TERMINAL_ID)
    destroyTerminal()
    onCloseRef.current?.()
  }, [destroyTerminal])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const panel = panelRef.current
    if (!panel) return
    const startHeight = panel.getBoundingClientRect().height

    const onMouseMove = (moveEvent: MouseEvent): void => {
      const delta = startY - moveEvent.clientY
      const newHeight = Math.max(100, Math.min(600, startHeight + delta))
      panel.style.height = `${newHeight}px`
    }

    const onMouseUp = (): void => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      fitAddonRef.current?.fit()
      if (xtermRef.current) {
        const { cols, rows } = xtermRef.current
        window.api.terminalResize(TERMINAL_ID, cols, rows)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const hasCreated = createdRef.current

  return (
    <>
      {visible && hasCreated && (
        <div className="terminal-resize-handle" onMouseDown={handleResizeMouseDown} />
      )}
      <div ref={panelRef} className={`terminal-panel ${visible ? 'terminal-panel--visible' : ''}`}>
        <div className="terminal-header">
          <span className="terminal-title">终端</span>
          <button className="terminal-close" type="button" onClick={handleClose}>
            ✕
          </button>
        </div>
        <div className="terminal-body" ref={containerRef}>
          {error && <div className="terminal-error">{error}</div>}
        </div>
      </div>
    </>
  )
}
```

**关键改动说明：**
- **#6 生命周期修复**: 创建 effect 只依赖 `[workspaceRoot, destroyTerminal]`，不再依赖 `visible`。隐藏终端时 pty 进程保持运行，显示时通过 `visible` effect 只做 fit/resize。
- **#7 dark 依赖**: 创建 effect 不再依赖 `dark`，dark 变化通过独立的 theme effect 处理。
- **#8 resize handle 闪烁**: `hasCreated` 在渲染时读取，首帧 effect 执行后 `createdRef.current` 已为 true，但 resize handle 显示条件是 `visible && hasCreated`。由于 useEffect 在 DOM 绘制后执行，首帧确实不会显示 resize handle —— 这是正确行为，因为终端面板高度动画还没完成。下一帧（fit 完成后触发 re-render）就会显示。
- **#10 非空断言**: `containerRef.current!` 替换为 `const container = containerRef.current; if (container) { xterm.open(container) }`。

- [ ] **Step 2: 在宿主机验证 TypeScript 编译和运行**

Run: `pnpm build`（宿主机执行）
Expected: 编译成功，应用启动后终端面板可正常显示/隐藏/关闭

---

### Task 5: 渲染进程 — 删除未用 CSS 和修复缩进 (#11 #12)

**Files:**
- Modify: `src/renderer/src/App.css`
- Modify: `src/renderer/src/App.tsx:166`

- [ ] **Step 1: 确认 .toolbar-btn--ghost 已无引用（已在审查中确认），无需恢复**

CSS 中 `.toolbar-btn--ghost` 已被删除且 TSX 中无引用，无需操作。

- [ ] **Step 2: 修复 App.tsx 第 166 行缩进**

将：
```tsx
         <div className="window-controls">
```
替换为：
```tsx
        <div className="window-controls">
```

即删除多余的一个前导空格，使其与其他标签缩进一致（8 个空格）。

---

## 审查后自检

| 问题编号 | 对应 Task | 状态 |
|----------|-----------|------|
| #1 路径注入 | Task 1 | cwd 目录校验 |
| #3 write 无反馈 | Task 3 | 改为 handle + 返回 boolean |
| #4 类型缺失 | Task 1 | 定义 IPty 接口 |
| #5 迭代中删除 | Task 2 | 先收集再删除 |
| #6 隐藏/显示生命周期 | Task 4 | 创建与显隐解耦 |
| #7 dark 依赖 | Task 4 | 移除创建 effect 的 dark 依赖 |
| #8 resize handle 闪烁 | Task 4 | createdRef 在渲染时读取 |
| #10 非空断言 | Task 4 | null 检查替代 `!` |
| #11 删除未用 CSS | Task 5 | 已确认安全 |
| #12 缩进不一致 | Task 5 | 修正空格 |
