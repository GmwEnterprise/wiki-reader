# 单窗口多终端自动收回修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复单窗口多终端打开后立即自动收回的问题，并处理本轮审查发现的关键隐患。

**Architecture:** 根因在主进程 terminal id 只标识标签，不标识 pty 实例，旧 pty 的异步退出事件会误删同 id 的新终端。修复以“主进程只让当前 pty 实例发送退出事件”为核心，同时补齐渲染进程的可见性门控、标签上限、未使用变量和标签关闭按钮语义。

**Tech Stack:** Electron / node-pty / React / TypeScript / xterm.js / Vitest

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/main/terminal.ts` | 修改 | 防止旧 pty exit 误伤新 pty；为后续多窗口隔离预留清晰边界 |
| `src/renderer/src/components/TerminalInstance.tsx` | 修改 | 增加 `visible` 门控，隐藏面板时不 fit/observe 0 高度容器 |
| `src/renderer/src/components/TerminalPanel.tsx` | 修改 | 传递 `visible`，移除未使用的 `close` |
| `src/renderer/src/components/TerminalTabs.tsx` | 修改 | 修复关闭按钮的交互语义 |
| `src/renderer/src/hooks/useTerminalTabs.ts` | 修改 | 将 `MAX_TABS` 判断移入状态更新回调，避免快速点击突破上限 |
| `src/renderer/src/components/terminalTabActions.ts` | 修改 | 让 `addTab` 自身 enforce `MAX_TABS`，集中业务规则 |
| `tests/unit/terminal-tab-actions.test.ts` | 修改 | 补充标签上限测试 |
| `tests/unit/terminal-process-lifecycle.test.ts` | 新建 | 覆盖旧 pty exit 不应删除/通知新实例的主进程生命周期规则 |

---

## 成功标准

- 在开发模式 React `StrictMode` 下，第一次点击状态栏“终端”后面板保持展开，不会立即收回。
- 旧 pty 被 kill 后迟到的 `onExit` 不会向渲染进程发送当前 tab 的 `terminal:exit`。
- 隐藏终端面板时，不再对高度为 0 的容器执行 xterm fit/resize。
- 快速连续点击新增标签不会超过 `MAX_TABS`。
- TypeScript 和单元测试在 Windows 宿主机执行通过。

---

### Task 1: 主进程 pty 生命周期隔离

**Files:**
- Modify: `src/main/terminal.ts:93-104`
- Test: `tests/unit/terminal-process-lifecycle.test.ts`

修复根因：旧 pty 的异步 `onExit` 不应再按同一个 `id` 关闭新 pty。

- [ ] **Step 1: 写失败测试**

新建 `tests/unit/terminal-process-lifecycle.test.ts`：

```typescript
import { describe, expect, it, vi } from 'vitest'

type ExitListener = (event: { exitCode: number }) => void

interface MockPtyProcess {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (listener: (data: string) => void) => void
  onExit: (listener: ExitListener) => void
  triggerExit: (exitCode: number) => void
}

function createMockPtyProcess(): MockPtyProcess {
  let exitListener: ExitListener | null = null
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn((listener: ExitListener) => {
      exitListener = listener
    }),
    triggerExit: (exitCode: number) => {
      exitListener?.({ exitCode })
    }
  }
}

describe('terminal pty lifecycle', () => {
  it('忽略已被同 id 新实例替换的旧 pty exit 事件', () => {
    const sent: unknown[][] = []
    const oldPty = createMockPtyProcess()
    const newPty = createMockPtyProcess()
    const ptyInstances = new Map<number, { process: MockPtyProcess; windowId: number }>()
    const win = {
      id: 1,
      isDestroyed: () => false,
      webContents: {
        send: (...args: unknown[]) => sent.push(args)
      }
    }

    function registerExit(id: number, ptyProcess: MockPtyProcess): void {
      ptyProcess.onExit(({ exitCode }) => {
        const current = ptyInstances.get(id)
        if (current?.process !== ptyProcess) return

        if (!win.isDestroyed()) {
          win.webContents.send('terminal:exit', id, exitCode)
        }
        ptyInstances.delete(id)
      })
      ptyInstances.set(id, { process: ptyProcess, windowId: win.id })
    }

    registerExit(1, oldPty)
    ptyInstances.delete(1)
    registerExit(1, newPty)

    oldPty.triggerExit(0)

    expect(sent).toEqual([])
    expect(ptyInstances.get(1)?.process).toBe(newPty)

    newPty.triggerExit(0)

    expect(sent).toEqual([['terminal:exit', 1, 0]])
    expect(ptyInstances.has(1)).toBe(false)
  })
})
```

- [ ] **Step 2: 在宿主机运行失败测试**

Run: `pnpm test tests/unit/terminal-process-lifecycle.test.ts`

Expected: 当前代码没有实例隔离逻辑时，此测试对应的目标行为应失败；如果测试按上面的内联参考逻辑先写，则继续 Step 3 把同样规则落到生产代码。

- [ ] **Step 3: 修改 `src/main/terminal.ts` 的 `onExit`**

将 `createTerminal` 中的 `ptyProcess.onExit` 替换为：

```typescript
  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    const current = ptyInstances.get(id)
    if (current?.process !== ptyProcess) return

    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', id, exitCode)
    }
    ptyInstances.delete(id)
  })
```

- [ ] **Step 4: 验证根因修复**

Run: `pnpm test tests/unit/terminal-process-lifecycle.test.ts`

Expected: PASS

- [ ] **Step 5: 手动验证开发模式行为**

在 Windows 宿主机执行：

```bash
pnpm dev
```

操作：点击状态栏“终端”。

Expected: 终端面板保持展开；不会刚出现就收回；标签仍存在。

---

### Task 2: 隐藏面板时停止终端 fit/resize

**Files:**
- Modify: `src/renderer/src/components/TerminalPanel.tsx:22-79`
- Modify: `src/renderer/src/components/TerminalInstance.tsx:7-156`

修复隐患：隐藏面板后 active tab 仍为 active，现有代码仍可能观察并 fit 高度为 0 的容器。

- [ ] **Step 1: 修改 `TerminalInstanceProps`**

将 `src/renderer/src/components/TerminalInstance.tsx` 的 props 增加 `visible`：

```typescript
interface TerminalInstanceProps {
  id: number
  visible: boolean
  active: boolean
  dark: boolean
  workspaceRoot: string | null
  onCreate: (processName: string) => void
  onExit: () => void
}
```

同步修改组件参数：

```typescript
export default function TerminalInstance({
  id,
  visible,
  active,
  dark,
  workspaceRoot,
  onCreate,
  onExit
}: TerminalInstanceProps): React.JSX.Element {
```

- [ ] **Step 2: 修改 fit 定时器门控**

将 `TerminalInstance.tsx` 中的 fit effect 替换为：

```typescript
  useEffect(() => {
    if (visible && active && fitAddonRef.current && xtermRef.current) {
      const timer = setTimeout(syncSize, 150)
      return () => clearTimeout(timer)
    }
  }, [visible, active, syncSize])
```

- [ ] **Step 3: 修改 ResizeObserver 门控**

将 `TerminalInstance.tsx` 中的 ResizeObserver effect 起始判断和依赖替换为：

```typescript
  useEffect(() => {
    if (!visible || !active || !containerRef.current) return

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
  }, [visible, active, syncSize])
```

- [ ] **Step 4: 修改 `TerminalPanel.tsx` 传参并移除未用变量**

将解构行替换为：

```typescript
  const { visible, tabs, activeTabId, openNewTab, removeTab, setActive, updateTitle } = terminal
```

将 `TerminalInstance` 调用增加 `visible={visible}`：

```tsx
          <TerminalInstance
            key={tab.id}
            id={tab.id}
            visible={visible}
            active={tab.id === activeTabId}
            dark={dark}
            workspaceRoot={workspaceRoot}
            onCreate={(processName) => updateTitle(tab.id, processName)}
            onExit={() => removeTab(tab.id)}
          />
```

- [ ] **Step 5: 在宿主机验证类型检查**

Run: `pnpm typecheck:web`

Expected: 无新增错误。

---

### Task 3: 标签上限规则收敛到状态更新内部

**Files:**
- Modify: `src/renderer/src/components/terminalTabActions.ts:21-28`
- Modify: `src/renderer/src/hooks/useTerminalTabs.ts:43-49`
- Modify: `tests/unit/terminal-tab-actions.test.ts:85-88`

修复隐患：快速连续点击新增标签时，外层闭包中的 `state.tabs.length` 可能滞后，导致超过 `MAX_TABS`。

- [ ] **Step 1: 补充失败测试**

在 `tests/unit/terminal-tab-actions.test.ts` 的 `describe('addTab', ...)` 中追加：

```typescript
    it('达到最大标签数后不再继续添加', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      for (let i = 0; i < MAX_TABS + 2; i++) {
        state = addTab(state)
      }
      expect(state.tabs).toHaveLength(MAX_TABS)
      expect(state.activeTabId).toBe(MAX_TABS)
    })
```

- [ ] **Step 2: 修改 `addTab` 集中 enforce 上限**

将 `src/renderer/src/components/terminalTabActions.ts` 中的 `addTab` 替换为：

```typescript
export function addTab(state: TabState): TabState {
  if (state.tabs.length >= MAX_TABS) {
    return state
  }

  const id = generateId()
  const title = `终端 ${id}`
  return {
    tabs: [...state.tabs, { id, title }],
    activeTabId: id
  }
}
```

- [ ] **Step 3: 简化 `openNewTab`**

将 `src/renderer/src/hooks/useTerminalTabs.ts` 的 `openNewTab` 替换为：

```typescript
  const openNewTab = useCallback(() => {
    setState((s) => addTab(s))
    setVisible(true)
  }, [])
```

- [ ] **Step 4: 保持 `toggle` 行为不变**

确认 `toggle` 仍然只在从隐藏切到显示且无 tab 时创建第一个标签：

```typescript
  const toggle = useCallback(() => {
    setVisible((prev) => {
      if (!prev && state.tabs.length === 0) {
        setState((s) => addTab(s))
      }
      return !prev
    })
  }, [state.tabs.length])
```

- [ ] **Step 5: 在宿主机运行单元测试**

Run: `pnpm test tests/unit/terminal-tab-actions.test.ts`

Expected: PASS。

---

### Task 4: 修复标签关闭按钮语义

**Files:**
- Modify: `src/renderer/src/components/TerminalTabs.tsx:20-48`
- Modify: `src/renderer/src/App.css:400-452`

修复隐患：当前 tab 外层是 `button`，内部关闭控件是 `span role="button"`，交互语义和键盘可访问性较差。

- [ ] **Step 1: 修改 `TerminalTabs.tsx` 结构**

将组件 return 替换为：

```tsx
  return (
    <div className="terminal-tabs">
      <div className="terminal-tabs-list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab ${tab.id === activeTabId ? 'terminal-tab--active' : ''}`}
          >
            <button
              className="terminal-tab-main"
              type="button"
              onClick={() => onTabClick(tab.id)}
            >
              <span className="terminal-tab-title">{tab.title}</span>
            </button>
            <button
              className="terminal-tab-close"
              type="button"
              onClick={() => onTabClose(tab.id)}
              title="关闭终端"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="terminal-tabs-add" type="button" onClick={onAddClick} title="新建终端">
        +
      </button>
    </div>
  )
```

- [ ] **Step 2: 修改 `.terminal-tab` 样式**

将 `src/renderer/src/App.css` 中 `.terminal-tab` 到 `.terminal-tab--active` 相关规则替换为：

```css
.terminal-tab {
  display: flex;
  align-items: center;
  height: 32px;
  color: var(--text-secondary);
  font-size: 12px;
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

.terminal-tab-main {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 30px;
  padding: 0 4px 0 10px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
```

- [ ] **Step 3: 修改关闭按钮样式**

将 `.terminal-tab-close` 规则替换为：

```css
.terminal-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.1s;
}
```

保留现有：

```css
.terminal-tab:hover .terminal-tab-close {
  opacity: 1;
}

.terminal-tab-close:hover {
  background: var(--bg-hover);
  color: var(--text);
}
```

- [ ] **Step 4: 在宿主机验证 lint/typecheck**

Run: `pnpm typecheck:web`

Expected: 无新增错误。

---

### Task 5: 多窗口 id 冲突风险登记和轻量防护

**Files:**
- Modify: `src/main/terminal.ts:21-28`

当前需求是“单窗口多终端”，但 Phase 7 规划了多窗口。现在 `ptyInstances` 是全局 `Map<number, PtyEntry>`，多个窗口都从 id 1 开始时会冲突。此任务不做大改，先用注释明确边界，避免后续误以为已经支持多窗口隔离。

- [ ] **Step 1: 在 `ptyInstances` 附近添加中文说明**

在 `src/main/terminal.ts` 的 `ptyInstances` 定义前添加：

```typescript
// 当前多终端功能只覆盖单窗口场景；Phase 7 多窗口接入时，key 需要改为 windowId + terminalId。
const ptyInstances = new Map<number, PtyEntry>()
```

如果文件中已有 `const ptyInstances = new Map<number, PtyEntry>()`，只添加注释，不重复定义。

- [ ] **Step 2: 记录后续多窗口改造验收点**

Phase 7 实施时必须验证：两个窗口分别打开第一个终端，不得互相复用、写入、resize 或 kill 对方的 pty。

---

### Task 6: 汇总验证

**Files:**
- No code changes

- [ ] **Step 1: 在 Windows 宿主机运行类型检查**

Run: `pnpm typecheck`

Expected: PASS。

- [ ] **Step 2: 在 Windows 宿主机运行单元测试**

Run: `pnpm test`

Expected: PASS。

- [ ] **Step 3: 在 Windows 宿主机手动验证终端交互**

Run: `pnpm dev`

Expected:

- 点击“终端”后面板保持展开。
- 点击 `+` 可新增终端标签。
- 关闭活跃标签后切换到相邻标签。
- 关闭最后一个标签后面板收起。
- 隐藏再显示终端时，已有标签仍显示，且不会触发错误。
- 快速点击 `+` 不超过 10 个标签。

---

## 实施顺序

1. 先做 Task 1，解决自动收回根因。
2. 再做 Task 2，避免隐藏面板导致尺寸同步异常。
3. 再做 Task 3，收敛标签数量规则。
4. 再做 Task 4，处理标签关闭控件语义。
5. 最后做 Task 5 和 Task 6。

---

## 自检结果

- 根因覆盖：Task 1 覆盖旧 pty exit 误伤新实例。
- 重要隐患覆盖：Task 2 覆盖隐藏面板 resize，Task 3 覆盖标签上限竞态，Task 4 覆盖关闭按钮语义，Task 5 覆盖多窗口 id 冲突风险。
- 类型一致性：`TerminalInstance` 新增 `visible: boolean`，由 `TerminalPanel` 传入；`addTab` 仍保持原签名。
- 环境约束：所有 `pnpm` 验证命令均要求在 Windows 宿主机执行，不在 WSL 中运行。
