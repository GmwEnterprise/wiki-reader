# 多终端标签页设计

## 概述

在现有单终端面板基础上，实现 VS Code 风格的多终端标签页支持。用户可以在底部终端面板内创建、切换、关闭多个终端实例。

## 需求决策

| 决策项 | 选择 |
|--------|------|
| 交互模型 | VS Code 风格标签页 |
| 非活跃终端处理 | 全部保留在内存（display:none 隐藏） |
| 终端拆分 | 不支持 |
| 标签数量限制 | 软限制 10 个，超出时提示 |
| 新建终端 cwd | 固定为 workspaceRoot |
| 关闭面板方式 | 仅通过状态栏按钮切换，不在标签栏放关闭按钮 |
| 标签标题 | 探测进程名（通过 node-pty 的 process 属性） |

## 架构

### 整体结构

```
┌─────────────────────────────────────────────────┐
│                  TerminalPanel                    │
│  ┌─────────────────────────────────────────────┐ │
│  │            TerminalTabs (标签栏)              │ │
│  │  [bash ×] [node ×] [python ×]          [+]  │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │         TerminalInstance (活跃标签)           │ │
│  │           xterm.js + FitAddon               │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │     TerminalInstance (隐藏, display:none)    │ │
│  └─────────────────────────────────────────────┘ │
│  ─ ─ ─ 拖拽手柄 (resize handle) ─ ─ ─ ─ ─ ─ ─  │
└─────────────────────────────────────────────────┘
```

### 组件职责

- **TerminalPanel**（现有 `Terminal.tsx` 重命名）：面板容器，管理面板展开/折叠、拖拽调整高度。内部使用 `useTerminalTabs` hook 管理标签状态，渲染 `TerminalTabs` 和多个 `TerminalInstance`。
- **TerminalTabs**（新增）：标签栏 UI，渲染标签列表和 `+` 新建按钮。
- **TerminalInstance**（新增，从 TerminalPanel 中提取）：单个 XTerm 实例，负责创建/销毁 pty、数据传输、尺寸同步。

### 主进程和 preload 层

主进程 `ptyInstances` Map 和所有 IPC 通道天然支持多实例（已按 id 区分），无需结构性改动。仅需小改 `createTerminal` 返回值以支持进程名探测。

## 状态管理 — useTerminalTabs Hook

替代现有 `useTerminal` hook。

### 数据结构

```typescript
interface TerminalTab {
  id: number        // 唯一 ID，自增生成，同时作为 pty id
  title: string     // 标签标题，创建后更新为进程名
}
```

### Hook 接口

```typescript
interface UseTerminalTabsReturn {
  visible: boolean
  tabs: TerminalTab[]
  activeTabId: number | null
  open: () => void
  close: () => void
  toggle: () => void
  addTab: () => void
  removeTab: (id: number) => void
  setActive: (id: number) => void
  updateTabTitle: (id: number, title: string) => void
}
```

### 关键行为

- 打开面板时如果没有标签，自动创建第一个
- 关闭最后一个标签时面板自动折叠
- 关闭活跃标签时，自动切换到相邻标签（优先右侧，其次左侧）
- 标签数达到 10 个时，`addTab()` 显示提示信息，不强制阻止
- 面板折叠时所有 pty 进程保持运行，仅 DOM 隐藏
- `updateTabTitle` 由 `TerminalInstance` 在创建成功后调用，传入主进程返回的进程名

## 标签栏 UI — TerminalTabs

### 布局

```
┌──────────────────────────────────────────┐
│ [bash ×] [node ×] [python ×]       [+]  │
└──────────────────────────────────────────┘
```

### 交互

- 点击标签 → 切换活跃终端
- 点击标签上的 `×` → 关闭该终端
- 点击 `+` → 新建终端
- 活跃标签高亮，非活跃标签样式弱化
- 标签过多时水平滚动，不换行

### 标签标题

- 创建成功后由主进程返回 `processName`，更新标签标题
- 如果获取不到进程名，回退显示 `终端 N`（N 为自增序号）

## TerminalInstance 组件

### Props

```typescript
interface TerminalInstanceProps {
  id: number
  active: boolean
  dark: boolean
  workspaceRoot: string
  onCreate: (processName: string) => void
  onExit: () => void
}
```

### 关键行为

- 挂载时创建 XTerm 实例 + pty，挂载 FitAddon 和 ResizeObserver
- `active=false` 时容器 `display:none`，XTerm 实例和 pty 保持运行
- `active` 从 false → true 时，触发 `fitAddon.fit()` + resize 同步（隐藏期间尺寸可能变化）
- `workspaceRoot` 变更时销毁旧 pty 并重建
- 卸载时 kill pty + 销毁 XTerm

## 进程名探测

修改 `terminal:create` 的 IPC 返回值：

- 当前：`{ error: string } | null`
- 改为：`{ error?: string; processName?: string } | null`

`node-pty` 的 `IPty` 对象在 spawn 后立即拥有 `process` 属性，`createTerminal` 在成功创建 pty 后将该属性作为 `processName` 一并返回。

涉及改动（每处 1-2 行）：
- `src/main/terminal.ts` — `createTerminal` 返回 `processName`
- `src/main/ipc-handlers.ts` — 透传 `processName`
- `src/preload/index.ts` — `terminalCreate` 返回类型更新
- `src/renderer/src/env.d.ts` — 类型声明更新

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/renderer/src/components/Terminal.tsx` | 重命名 → `TerminalPanel.tsx` | 面板容器，集成 `useTerminalTabs` |
| `src/renderer/src/components/TerminalInstance.tsx` | 新建 | 单个 XTerm 实例 |
| `src/renderer/src/components/TerminalTabs.tsx` | 新建 | 标签栏 UI |
| `src/renderer/src/hooks/useTerminal.ts` | 重写 → `useTerminalTabs.ts` | 多标签状态管理 |
| `src/main/terminal.ts` | 小改 | `createTerminal` 返回 `processName` |
| `src/main/ipc-handlers.ts` | 小改 | 透传 `processName` |
| `src/preload/index.ts` | 小改 | 返回类型更新 |
| `src/renderer/src/env.d.ts` | 小改 | 类型声明更新 |
| `src/renderer/src/App.css` | 改 | 终端区域样式更新（标签栏样式） |
| `src/renderer/src/App.tsx` | 小改 | import 路径更新 |

不动的文件：`terminalLayout.ts`、`ptyInstances` Map 结构、窗口清理逻辑。

## 不做的事

- 不支持终端拆分（水平/垂直并排）
- 不支持继承当前终端 cwd 新建终端
- 不支持拖拽排序标签
- 不持久化终端会话（重启后恢复）
