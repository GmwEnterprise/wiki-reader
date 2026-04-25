# Phase 5: 主题系统

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现明暗主题切换，所有 UI 组件（工具栏、侧栏、内容区、编辑器）跟随主题变化，主题选择持久化到本地存储。

**Architecture:** 使用 CSS 自定义属性（变量）定义两套颜色方案。通过在 `<html>` 根元素上切换 `data-theme` 属性控制主题。`useTheme` hook 管理主题状态并通过 `localStorage` 持久化。CodeMirror 编辑器通过 `@codemirror/theme-one-dark` 在暗色模式下应用对应主题。

**Tech Stack:** CSS 自定义属性, localStorage, @codemirror/theme-one-dark（已在 Phase 4 安装）

**前置条件:** Phase 4 完成。

---

## 文件结构

```
src/renderer/src/
├── hooks/
│   └── useTheme.ts         # 新增
├── App.tsx                 # 修改
└── App.css                 # 修改：重构为双主题变量
```

---

### Task 1: 重构 App.css 为双主题 CSS 变量

**Files:**
- Modify: `src/renderer/src/App.css`

- [ ] **Step 1: 替换 App.css 顶部的 `:root` 变量定义**

将原来的 `:root` 替换为两套主题变量：

```css
:root,
[data-theme='light'] {
  --bg: #fafaf8;
  --bg-sidebar: #f3f3f1;
  --bg-toolbar: #f7f7f5;
  --bg-hover: rgba(0, 0, 0, 0.04);
  --bg-selected: rgba(74, 144, 217, 0.1);
  --text: #2c2c2c;
  --text-secondary: #888888;
  --border: #e5e5e3;
  --accent: #4a90d9;
  --accent-text: #3a7bc8;
  --code-bg: rgba(0, 0, 0, 0.06);
  --blockquote-bg: rgba(0, 0, 0, 0.03);
  --blockquote-border: #4a90d9;
  --table-header-bg: rgba(0, 0, 0, 0.03);
}

[data-theme='dark'] {
  --bg: #1e1e20;
  --bg-sidebar: #262628;
  --bg-toolbar: #222224;
  --bg-hover: rgba(255, 255, 255, 0.06);
  --bg-selected: rgba(74, 144, 217, 0.15);
  --text: #d4d4d4;
  --text-secondary: #808080;
  --border: #3a3a3c;
  --accent: #5ba0e0;
  --accent-text: #6bb0f0;
  --code-bg: rgba(255, 255, 255, 0.08);
  --blockquote-bg: rgba(255, 255, 255, 0.04);
  --blockquote-border: #5ba0e0;
  --table-header-bg: rgba(255, 255, 255, 0.04);
}
```

- [ ] **Step 2: 更新 App.css 中使用硬编码颜色的地方**

全局替换以下硬编码颜色为变量：

| 原始值 | 替换为 |
|--------|--------|
| `rgba(0, 0, 0, 0.04)` (hover) | `var(--bg-hover)` |
| `rgba(74, 144, 217, 0.1)` (selected) | `var(--bg-selected)` |
| `rgba(0, 0, 0, 0.06)` (code bg) | `var(--code-bg)` |
| `rgba(0, 0, 0, 0.03)` (blockquote/table) | `var(--blockquote-bg)` / `var(--table-header-bg)` |

在 Markdown 渲染样式中，将 `blockquote` 的 `border-left` 颜色改为 `var(--blockquote-border)`。

`.hljs` 代码块在暗色模式下保持深色背景，亮色模式下也保持深色（One Dark 风格）。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.css
git commit -m "feat(theme): add light/dark CSS custom properties"
```

---

### Task 2: 创建 useTheme hook

**Files:**
- Create: `src/renderer/src/hooks/useTheme.ts`

- [ ] **Step 1: 创建 src/renderer/src/hooks/useTheme.ts**

```ts
import { useState, useEffect, useCallback } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'wiki-reader-theme'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    return stored === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  return { theme, toggleTheme }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/hooks/useTheme.ts
git commit -m "feat(theme): add useTheme hook with localStorage persistence"
```

---

### Task 3: 接入 App 组件与 SourceEditor 暗色支持

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/SourceEditor.tsx`

- [ ] **Step 1: 在 App.tsx 中接入主题**

在 App 组件中添加：

```tsx
import { useTheme } from './hooks/useTheme'

// 在 App 函数体内部
const { theme, toggleTheme } = useTheme()
```

在主菜单面板中添加主题切换菜单项：

```tsx
<button className="toolbar-menu-item" type="button" role="menuitem" onClick={() => { toggleTheme(); setIsMenuOpen(false) }}>
  {theme === 'light' ? '切换暗色主题 🌙' : '切换亮色主题 ☀️'}
</button>
```

在 `SourceEditor` 调用处传递 `darkMode` prop：

```tsx
<SourceEditor
  content={doc.content}
  onChange={updateContent}
  onSave={flushSave}
  onEscape={...}
  darkMode={theme === 'dark'}
/>
```

- [ ] **Step 2: 修改 SourceEditor 组件支持暗色主题**

修改 `src/renderer/src/components/SourceEditor.tsx`，接受 `darkMode` prop 并在暗色模式下应用 One Dark 主题。

使用 `Compartment` 动态切换 `oneDark`，避免切换主题时重建编辑器导致撤销历史丢失：

```ts
import { Compartment } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'

const darkThemeCompartment = new Compartment()

// 在初始化 extensions 中：
darkThemeCompartment.of(darkMode ? oneDark : [])

// 单独 useEffect 响应 darkMode 变化：
useEffect(() => {
  if (!viewRef.current) return
  viewRef.current.dispatch({
    effects: darkThemeCompartment.reconfigure(darkMode ? oneDark : [])
  })
}, [darkMode])
```

同时通过 `EditorView.theme` 设置编辑器基础背景色：

```ts
EditorView.theme({
  '&': { height: '100%' },
  '&.cm-editor': darkMode ? { color: '#d4d4d4', backgroundColor: '#1e1e20' } : {},
  ...
})
```

- [ ] **Step 3: 启动验证**

```bash
pnpm dev
```

验证步骤：
1. 通过主菜单切换主题
2. 切换到暗色主题：背景变深灰、文字变亮、侧栏变深
3. 切换到亮色主题：恢复温暖白底
4. 关闭应用重新打开，主题选择保持
5. 源码模式下切换主题，CodeMirror 编辑器跟随变化，撤销历史不丢失
6. 代码块高亮在两种主题下保持 One Dark 风格

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/SourceEditor.tsx
git commit -m "feat(theme): integrate theme toggle into App with CodeMirror dark mode support"
```

---

## 自检清单

- [ ] 亮色主题使用温暖白底
- [ ] 暗色主题使用低对比深灰（非纯黑）
- [ ] 所有 UI 区域（工具栏、侧栏、内容区）同步切换
- [ ] CodeMirror 编辑器在暗色模式下应用 One Dark 主题
- [ ] 代码块高亮不受主题影响
- [ ] 主题选择持久化，重启应用后保持
