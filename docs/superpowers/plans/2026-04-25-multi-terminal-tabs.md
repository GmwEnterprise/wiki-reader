# 多终端标签页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在底部终端面板中支持多个终端标签页，用户可以新建、切换、关闭多个终端实例。

**Architecture:** 改造现有 `TerminalPanel` 组件内部结构，新增 `TerminalInstance`（单终端实例）和 `TerminalTabs`（标签栏）子组件，用 `useTerminalTabs` hook 管理多标签状态。主进程侧仅小改 `createTerminal` 返回值以支持进程名探测。preload 和 IPC 通道无结构性改动。

**Tech Stack:** React 18 Hooks / TypeScript / xterm.js / node-pty / Electron IPC

**Design Spec:** `docs/superpowers/specs/2026-04-25-multi-terminal-tabs-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/main/terminal.ts` | 修改 | `createTerminal` 返回 `processName` |
| `src/main/ipc-handlers.ts` | 修改 | 透传 `processName` |
| `src/preload/index.ts` | 修改 | `terminalCreate` 返回类型 |
| `src/renderer/src/env.d.ts` | 修改 | 类型声明 |
| `src/renderer/src/hooks/useTerminal.ts` | 重写为 `useTerminalTabs.ts` | 多标签状态管理 |
| `src/renderer/src/components/Terminal.tsx` | 重写为 `TerminalPanel.tsx` | 面板容器 + 标签页调度 + 拖拽 |
| `src/renderer/src/components/TerminalInstance.tsx` | 新建 | 单个 XTerm 实例 |
| `src/renderer/src/components/TerminalTabs.tsx` | 新建 | 标签栏 UI |
| `src/renderer/src/App.tsx` | 修改 | import 路径更新 |
| `src/renderer/src/App.css` | 修改 | 标签栏样式 |
| `tests/unit/terminal-cwd.test.ts` | 不动 | — |
| `tests/unit/terminal-layout.test.ts` | 不动 | — |
| `tests/unit/terminal-css.test.ts` | 修改 | 更新 CSS 正则匹配 |
| `tests/unit/useTerminalTabs.test.ts` | 新建 | hook 单元测试 |

---

### Task 1: 主进程 — createTerminal 返回 processName

**Files:**
- Modify: `src/main/terminal.ts:60-103`
- Modify: `src/main/ipc-handlers.ts:72-78`
- Modify: `src/preload/index.ts:40-41`
- Modify: `src/renderer/src/env.d.ts:37`
- Test: `tests/unit/terminal-cwd.test.ts`（确认不动，验证通过）

- [ ] **Step 1: 修改 `src/main/terminal.ts` 的 `createTerminal` 函数**

将 `createTerminal` 的返回类型从 `string | null`（error string 或 null）改为 `{ error?: string; processName?: string } | null`。成功时返回 `{ processName: ptyProcess.process }` 或 `{ processName: shell }`（回退）。

```typescript
// src/main/terminal.ts — 替换整个 createTerminal 函数（第 60-103 行）

export function createTerminal(
  win: BrowserWindow,
  cwd: string | null,
  id: number
): { error?: string; processName?: string } | null {
  if (!pty) {
    return { error: '终端不可用：node-pty 模块加载失败' }
  }
  if (ptyInstances.has(id)) {
    return null
  }

  const shell = getDefaultShell()
  const terminalCwd = resolveTerminalCwd(cwd)
  let ptyProcess: IPty
  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: terminalCwd,
      env: { ...process.env } as Record<string, string>
    })
  } catch (err: any) {
    return { error: `终端启动失败: ${err.message}` }
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

  const processName = (ptyProcess as any).process || shell
  return { processName }
}
```

- [ ] **Step 2: 修改 `src/main/ipc-handlers.ts` 透传 processName**

```typescript
// src/main/ipc-handlers.ts — 替换第 72-78 行

  ipcMain.handle('terminal:create', (event, id: number, cwd: string | null) => {
    if (typeof id !== 'number' || (cwd !== null && typeof cwd !== 'string')) return null
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { error: '窗口不存在' }
    return createTerminal(win, cwd, id)
  })
```

- [ ] **Step 3: 修改 `src/renderer/src/env.d.ts` 更新类型**

```typescript
// src/renderer/src/env.d.ts — 替换第 37 行

      terminalCreate: (id: number, cwd: string | null) => Promise<{ error?: string; processName?: string } | null>
```

- [ ] **Step 4: 确认 preload 层无需改动**

`src/preload/index.ts` 第 40-41 行 `terminalCreate` 只是直接透传 `ipcRenderer.invoke` 的结果，返回值由 TS 类型推断，不需要修改函数体。确认当前代码：

```typescript
  terminalCreate: (id: number, cwd: string | null) =>
    ipcRenderer.invoke('terminal:create', id, cwd),
```

无需改动。

- [ ] **Step 5: 提交**

```bash
git add src/main/terminal.ts src/main/ipc-handlers.ts src/renderer/src/env.d.ts
git commit -m "feat(terminal): createTerminal 返回 processName 用于标签标题"
```

---

### Task 2: useTerminalTabs hook

**Files:**
- Create: `src/renderer/src/hooks/useTerminalTabs.ts`
- Test: `tests/unit/useTerminalTabs.test.ts`

- [ ] **Step 1: 编写 useTerminalTabs 测试**

```typescript
// tests/unit/useTerminalTabs.test.ts

import { describe, expect, it } from 'vitest'
import { useTerminalTabs } from '../../src/renderer/src/hooks/useTerminalTabs'

describe('useTerminalTabs', () => {
  it('初始状态：面板不可见，无标签', () => {
    const { visible, tabs, activeTabId } = useTerminalTabs()
    expect(visible).toBe(false)
    expect(tabs).toEqual([])
    expect(activeTabId).toBeNull()
  })
})
```

注意：由于 `useTerminalTabs` 是 React hook，直接在非组件环境调用会报错。这里改用简单的导出函数/纯逻辑测试方案——将核心逻辑提取为纯函数 `createTerminalTabsManager`，hook 只做薄封装。或者，用 `renderHook` 测试。

检查项目是否有 `@testing-library/react`：

如果项目没有 `@testing-library/react`，则测试策略改为：只测纯函数部分（如 ID 生成、标签列表操作逻辑），不测 hook 本身。将标签列表操作逻辑提取为独立纯函数模块 `terminalTabActions.ts`。

**最终测试策略：** 将标签列表操作逻辑提取到 `src/renderer/src/components/terminalTabActions.ts` 作为纯函数，hook 调用这些纯函数。测试只测纯函数。

- [ ] **Step 2: 创建纯函数模块 `terminalTabActions.ts`**

```typescript
// src/renderer/src/components/terminalTabActions.ts

export interface TerminalTab {
  id: number
  title: string
}

export interface TabState {
  tabs: TerminalTab[]
  activeTabId: number | null
}

let nextId = 1

export function resetNextId(): void {
  nextId = 1
}

export function generateId(): number {
  return nextId++
}

export function addTab(state: TabState): TabState {
  const id = generateId()
  const title = `终端 ${id}`
  return {
    tabs: [...state.tabs, { id, title }],
    activeTabId: id
  }
}

export function removeTab(state: TabState, idToRemove: number): TabState {
  const tabs = state.tabs.filter((t) => t.id !== idToRemove)
  if (tabs.length === 0) {
    return { tabs, activeTabId: null }
  }
  if (state.activeTabId !== idToRemove) {
    return { tabs, activeTabId: state.activeTabId }
  }
  const oldIndex = state.tabs.findIndex((t) => t.id === idToRemove)
  const newIndex = Math.min(oldIndex, tabs.length - 1)
  return { tabs, activeTabId: tabs[newIndex].id }
}

export function updateTabTitle(state: TabState, id: number, title: string): TabState {
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t))
  }
}

export const MAX_TABS = 10
```

- [ ] **Step 3: 编写 terminalTabActions 测试**

```typescript
// tests/unit/terminal-tab-actions.test.ts

import { describe, expect, it, beforeEach } from 'vitest'
import {
  addTab,
  removeTab,
  updateTabTitle,
  resetNextId,
  MAX_TABS,
  type TabState
} from '../../src/renderer/src/components/terminalTabActions'

beforeEach(() => {
  resetNextId()
})

describe('terminalTabActions', () => {
  describe('addTab', () => {
    it('从空状态添加第一个标签', () => {
      const state: TabState = { tabs: [], activeTabId: null }
      const next = addTab(state)
      expect(next.tabs).toHaveLength(1)
      expect(next.tabs[0]).toEqual({ id: 1, title: '终端 1' })
      expect(next.activeTabId).toBe(1)
    })

    it('连续添加多个标签，ID 自增', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = addTab(state)
      state = addTab(state)
      expect(state.tabs).toHaveLength(3)
      expect(state.tabs.map((t) => t.id)).toEqual([1, 2, 3])
      expect(state.activeTabId).toBe(3)
    })
  })

  describe('removeTab', () => {
    it('删除唯一标签后列表为空，activeTabId 为 null', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = removeTab(state, 1)
      expect(state.tabs).toEqual([])
      expect(state.activeTabId).toBeNull()
    })

    it('删除非活跃标签不影响 activeTabId', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = addTab(state)
      state = addTab(state)
      state = { ...state, activeTabId: 2 }
      const next = removeTab(state, 1)
      expect(next.activeTabId).toBe(2)
      expect(next.tabs).toHaveLength(2)
    })

    it('删除活跃标签时切换到右侧相邻标签', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = addTab(state)
      state = addTab(state)
      state = { ...state, activeTabId: 2 }
      const next = removeTab(state, 2)
      expect(next.activeTabId).toBe(3)
    })

    it('删除最后一个活跃标签时切换到左侧相邻标签', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = addTab(state)
      state = addTab(state)
      const next = removeTab(state, 3)
      expect(next.activeTabId).toBe(2)
    })
  })

  describe('updateTabTitle', () => {
    it('更新指定标签标题', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      const next = updateTabTitle(state, 1, 'bash')
      expect(next.tabs[0].title).toBe('bash')
    })
  })

  it('MAX_TABS 为 10', () => {
    expect(MAX_TABS).toBe(10)
  })
})
```

- [ ] **Step 4: 创建 `useTerminalTabs` hook**

```typescript
// src/renderer/src/hooks/useTerminalTabs.ts

import { useState, useCallback } from 'react'
import {
  addTab,
  removeTab,
  updateTabTitle,
  generateId,
  MAX_TABS,
  type TerminalTab,
  type TabState
} from '../components/terminalTabActions'

export type { TerminalTab }

export interface UseTerminalTabsReturn {
  visible: boolean
  tabs: TerminalTab[]
  activeTabId: number | null
  tabCount: number
  toggle: () => void
  close: () => void
  openNewTab: () => void
  removeTab: (id: number) => void
  setActive: (id: number) => void
  updateTitle: (id: number, title: string) => void
}

export function useTerminalTabs(): UseTerminalTabsReturn {
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<TabState>({ tabs: [], activeTabId: null })

  const toggle = useCallback(() => {
    setVisible((prev) => {
      if (!prev && state.tabs.length === 0) {
        setState((s) => addTab(s))
      }
      return !prev
    })
  }, [state.tabs.length])

  const close = useCallback(() => {
    setVisible(false)
  }, [])

  const openNewTab = useCallback(() => {
    if (state.tabs.length >= MAX_TABS) {
      return
    }
    setState((s) => addTab(s))
    setVisible(true)
  }, [state.tabs.length])

  const removeTabById = useCallback(
    (id: number) => {
      setState((s) => {
        const next = removeTab(s, id)
        if (next.tabs.length === 0) {
          setVisible(false)
        }
        return next
      })
    },
    []
  )

  const setActive = useCallback((id: number) => {
    setState((s) => ({ ...s, activeTabId: id }))
  }, [])

  const updateTitle = useCallback((id: number, title: string) => {
    setState((s) => updateTabTitle(s, id, title))
  }, [])

  return {
    visible,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    tabCount: state.tabs.length,
    toggle,
    close,
    openNewTab,
    removeTab: removeTabById,
    setActive,
    updateTitle
  }
}
```

- [ ] **Step 5: 删除旧 `useTerminal.ts`**

删除文件 `src/renderer/src/hooks/useTerminal.ts`。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/terminalTabActions.ts tests/unit/terminal-tab-actions.test.ts src/renderer/src/hooks/useTerminalTabs.ts
git rm src/renderer/src/hooks/useTerminal.ts
git commit -m "feat(terminal): 添加 useTerminalTabs hook 和标签操作纯函数"
```

---

### Task 3: TerminalInstance 组件

**Files:**
- Create: `src/renderer/src/components/TerminalInstance.tsx`

- [ ] **Step 1: 创建 TerminalInstance 组件**

从现有 `Terminal.tsx` 提取 XTerm 核心逻辑，封装为可复用的单终端实例组件。

```typescript
// src/renderer/src/components/TerminalInstance.tsx

import { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { createTerminalTheme, fitAndResizeTerminal } from './terminalLayout'

interface TerminalInstanceProps {
  id: number
  active: boolean
  dark: boolean
  workspaceRoot: string | null
  onCreate: (processName: string) => void
  onExit: () => void
}

export default function TerminalInstance({
  id,
  active,
  dark,
  workspaceRoot,
  onCreate,
  onExit
}: TerminalInstanceProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)

  const createdRef = useRef(false)
  const darkRef = useRef(dark)
  const terminalCwdRef = useRef<string | null>(null)
  const unsubscribeRef = useRef<(() => void)[]>([])
  const onExitRef = useRef(onExit)
  const onCreateRef = useRef(onCreate)
  darkRef.current = dark
  onExitRef.current = onExit
  onCreateRef.current = onCreate

  const cleanupListeners = useCallback(() => {
    unsubscribeRef.current.forEach((fn) => fn())
    unsubscribeRef.current = []
  }, [])

  const destroyTerminal = useCallback(() => {
    if (!createdRef.current) return
    cleanupListeners()
    xtermRef.current?.dispose()
    xtermRef.current = null
    fitAddonRef.current = null
    terminalCwdRef.current = null
    setError(null)
    createdRef.current = false
    setCreated(false)
  }, [cleanupListeners])

  const syncSize = useCallback(() => {
    fitAndResizeTerminal(fitAddonRef.current, xtermRef.current, (cols, rows) => {
      window.api.terminalResize(id, cols, rows)
    })
  }, [id])

  useEffect(() => {
    if (!createdRef.current || terminalCwdRef.current === workspaceRoot) return
    window.api.terminalKill(id)
    destroyTerminal()
  }, [workspaceRoot, id, destroyTerminal])

  useEffect(() => {
    if (createdRef.current) return

    createdRef.current = true
    setCreated(true)
    terminalCwdRef.current = workspaceRoot

    const xterm = new XTerm({
      theme: createTerminalTheme(darkRef.current),
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
      window.api.terminalWrite(id, data)
    })

    const unsubData = window.api.onTerminalData(id, (data) => {
      xterm.write(data)
    })

    const unsubExit = window.api.onTerminalExit(id, () => {
      destroyTerminal()
      onExitRef.current()
    })

    const unsubError = window.api.onTerminalError(id, (err) => {
      setError(err)
    })
    unsubscribeRef.current = [unsubData, unsubExit, unsubError]

    window.api.terminalCreate(id, workspaceRoot).then((result) => {
      if (result?.error) {
        destroyTerminal()
        setError(result.error)
      } else if (result?.processName) {
        onCreateRef.current(result.processName)
      }
    })
  }, [id, workspaceRoot, destroyTerminal])

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = createTerminalTheme(dark)
    }
  }, [dark])

  useEffect(() => {
    if (active && fitAddonRef.current && xtermRef.current) {
      const timer = setTimeout(syncSize, 150)
      return () => clearTimeout(timer)
    }
  }, [active, syncSize])

  useEffect(() => {
    if (!active || !containerRef.current) return

    let frameId: number | null = null
    const observer = new ResizeObserver(() => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        syncSize()
        frameId = null
      })
    })

    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      if (frameId !== null) cancelAnimationFrame(frameId)
    }
  }, [active, syncSize])

  useEffect(() => {
    return () => {
      if (createdRef.current) {
        window.api.terminalKill(id)
        destroyTerminal()
      }
      cleanupListeners()
    }
  }, [id, destroyTerminal, cleanupListeners])

  return (
    <div
      ref={containerRef}
      className="terminal-body"
      style={{ display: active ? undefined : 'none' }}
    >
      {error && <div className="terminal-error">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/components/TerminalInstance.tsx
git commit -m "feat(terminal): 添加 TerminalInstance 单终端实例组件"
```

---

### Task 4: TerminalTabs 组件 + 标签栏 CSS

**Files:**
- Create: `src/renderer/src/components/TerminalTabs.tsx`
- Modify: `src/renderer/src/App.css`

- [ ] **Step 1: 创建 TerminalTabs 组件**

```typescript
// src/renderer/src/components/TerminalTabs.tsx

import type { TerminalTab } from '../hooks/useTerminalTabs'

interface TerminalTabsProps {
  tabs: TerminalTab[]
  activeTabId: number | null
  onTabClick: (id: number) => void
  onTabClose: (id: number) => void
  onAddClick: () => void
}

export default function TerminalTabs({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onAddClick
}: TerminalTabsProps): React.JSX.Element | null {
  if (tabs.length === 0) return null

  return (
    <div className="terminal-tabs">
      <div className="terminal-tabs-list">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`terminal-tab ${tab.id === activeTabId ? 'terminal-tab--active' : ''}`}
            type="button"
            onClick={() => onTabClick(tab.id)}
          >
            <span className="terminal-tab-title">{tab.title}</span>
            <span
              className="terminal-tab-close"
              role="button"
              onClick={(e) => {
                e.stopPropagation()
                onTabClose(tab.id)
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
      <button className="terminal-tabs-add" type="button" onClick={onAddClick} title="新建终端">
        +
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 在 `App.css` 中替换终端 header 样式并添加标签栏样式**

替换 `App.css` 中的 `.terminal-header`、`.terminal-title`、`.terminal-close` 三个样式块（第 370-399 行），改为标签栏样式：

```css
/* 替换第 370-399 行（.terminal-header 到 .terminal-close:hover） */

.terminal-header {
  display: flex;
  align-items: center;
  background: var(--bg-toolbar);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  height: 32px;
}

.terminal-tabs {
  display: flex;
  align-items: center;
  flex: 1;
  height: 100%;
  min-width: 0;
}

.terminal-tabs-list {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.terminal-tabs-list::-webkit-scrollbar {
  display: none;
}

.terminal-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  flex-shrink: 0;
}

.terminal-tab:hover {
  background: var(--bg-hover);
}

.terminal-tab--active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

.terminal-tab-title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.terminal-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  font-size: 14px;
  line-height: 1;
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity 0.1s;
}

.terminal-tab:hover .terminal-tab-close {
  opacity: 1;
}

.terminal-tab-close:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.terminal-tabs-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
}

.terminal-tabs-add:hover {
  background: var(--bg-hover);
  color: var(--text);
}
```

- [ ] **Step 3: 更新 terminal-css 测试**

原测试中匹配的 `.terminal-body .xterm .xterm-viewport` 样式仍然存在（`TerminalInstance` 使用同样的 `.terminal-body` class），CSS 正则不受影响。确认测试仍通过。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/TerminalTabs.tsx src/renderer/src/App.css
git commit -m "feat(terminal): 添加 TerminalTabs 标签栏组件和 CSS 样式"
```

---

### Task 5: 重写 TerminalPanel + 更新 App.tsx

**Files:**
- Rename: `src/renderer/src/components/Terminal.tsx` → `src/renderer/src/components/TerminalPanel.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: 重写 TerminalPanel**

将 `Terminal.tsx` 的内容替换为新的面板容器逻辑。保留面板展开/折叠和拖拽调整高度，内部管理多个 `TerminalInstance`。

```typescript
// src/renderer/src/components/TerminalPanel.tsx（替换 Terminal.tsx 全部内容）

import { useRef, useState, useCallback, type CSSProperties } from 'react'
import { calculateTerminalPanelHeight, fitAndResizeTerminal } from './terminalLayout'
import TerminalTabs from './TerminalTabs'
import TerminalInstance from './TerminalInstance'
import type { UseTerminalTabsReturn } from '../hooks/useTerminalTabs'

interface TerminalPanelProps {
  terminal: UseTerminalTabsReturn
  dark: boolean
  workspaceRoot: string | null
}

export default function TerminalPanel({
  terminal,
  dark,
  workspaceRoot
}: TerminalPanelProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = useState(250)
  const [resizing, setResizing] = useState(false)

  const { visible, tabs, activeTabId, close, openNewTab, removeTab, setActive, updateTitle } =
    terminal

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const panel = panelRef.current
      if (!panel) return
      setResizing(true)
      const startHeight = panel.getBoundingClientRect().height

      const onMouseMove = (moveEvent: MouseEvent): void => {
        setPanelHeight(calculateTerminalPanelHeight(startHeight, startY, moveEvent.clientY))
      }

      const onMouseUp = (): void => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        setResizing(false)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    []
  )

  const panelStyle = visible
    ? ({ '--terminal-panel-height': `${panelHeight}px` } as CSSProperties)
    : undefined
  const panelClassName = `terminal-panel ${visible ? 'terminal-panel--visible' : ''} ${resizing ? 'terminal-panel--resizing' : ''}`

  return (
    <>
      {visible && tabs.length > 0 && (
        <div className="terminal-resize-handle" onMouseDown={handleResizeMouseDown} />
      )}
      <div ref={panelRef} className={panelClassName} style={panelStyle}>
        <div className="terminal-header">
          <TerminalTabs
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={setActive}
            onTabClose={removeTab}
            onAddClick={openNewTab}
          />
        </div>
        {tabs.map((tab) => (
          <TerminalInstance
            key={tab.id}
            id={tab.id}
            active={tab.id === activeTabId}
            dark={dark}
            workspaceRoot={workspaceRoot}
            onCreate={(processName) => updateTitle(tab.id, processName)}
            onExit={() => removeTab(tab.id)}
          />
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: 删除旧 `Terminal.tsx` 并创建新文件**

```bash
git rm src/renderer/src/components/Terminal.tsx
```

然后将上面的代码写入 `src/renderer/src/components/TerminalPanel.tsx`。

- [ ] **Step 3: 更新 `App.tsx`**

```typescript
// src/renderer/src/App.tsx — 替换第 6 行和第 10 行

// 第 6 行：替换 import
import { useTerminalTabs } from './hooks/useTerminalTabs'

// 第 10 行：替换 import
import TerminalPanel from './components/TerminalPanel'
```

```typescript
// src/renderer/src/App.tsx — 替换第 19 行

  const terminal = useTerminalTabs()
```

```typescript
// src/renderer/src/App.tsx — 替换第 245-250 行

      <TerminalPanel
        terminal={terminal}
        dark={theme === 'dark'}
        workspaceRoot={workspace?.rootPath ?? null}
      />
```

```typescript
// src/renderer/src/App.tsx — 替换第 254-258 行（状态栏终端按钮）

          <button
            className={`statusbar-btn ${terminal.visible ? 'statusbar-btn--active' : ''}`}
            type="button"
            onClick={terminal.toggle}
            title={terminal.visible ? '隐藏终端' : '显示终端'}
          >
```

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/components/TerminalPanel.tsx src/renderer/src/App.tsx
git commit -m "feat(terminal): 重写 TerminalPanel 支持多标签页，更新 App.tsx 集成"
```

---

### Task 6: 清理和验证

**Files:**
- Verify: 所有文件
- Modify: `tests/unit/terminal-css.test.ts`（如有需要）

- [ ] **Step 1: 确认所有 import 路径正确**

全局搜索 `useTerminal` 和 `from './components/Terminal'` 和 `from '../components/Terminal'`，确认没有遗留旧引用。

- [ ] **Step 2: 确认旧文件已删除**

确认 `src/renderer/src/components/Terminal.tsx` 和 `src/renderer/src/hooks/useTerminal.ts` 已不存在。

- [ ] **Step 3: 提交最终清理**

```bash
git add -A
git commit -m "chore(terminal): 清理旧文件引用"
```

- [ ] **Step 4: 用户在宿主机验证**

用户在 Windows 终端执行：
```bash
pnpm dev
```

验证项：
1. 点击状态栏"终端"按钮，面板展开并自动创建第一个终端
2. 点击 `+` 按钮能新建终端标签
3. 标签标题显示进程名（如 `powershell` 或 `bash`）
4. 点击不同标签能切换终端
5. 点击标签 `×` 能关闭终端
6. 关闭最后一个标签时面板自动折叠
7. 拖拽调整面板高度正常
8. 主题切换时所有终端同步变色
```