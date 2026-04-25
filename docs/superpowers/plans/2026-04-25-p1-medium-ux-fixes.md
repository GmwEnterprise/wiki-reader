# P1: 中等优先级用户体验修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 5 个影响用户体验的界面问题，包括右键菜单切换时保存滚动位置、缺少加载状态、模式切换丢失滚动位置、侧栏宽度不持久化、损坏图片占位符暗色不适配。

**Architecture:** 修改集中在渲染进程的 hooks、组件和 CSS 中。各修复相互独立，可并行执行。

**Tech Stack:** React 18、TypeScript、CSS

**前置条件:** P0 关键 Bug 已修复。

---

## 问题清单

| # | 问题 | 文件 | 影响 |
|---|------|------|------|
| 6 | 右键切换模式时不保存滚动位置 | `App.tsx` | 切换后滚动位置丢失 |
| 7 | 没有文件加载中状态 | `useDocument.ts`、`App.tsx` | 用户误以为点击无效 |
| 8 | 模式切换丢失滚动位置 | `App.tsx` | 长文档工作体验差 |
| 9 | 侧栏宽度不持久化 | `App.tsx` | 重启后宽度恢复默认 |
| 10 | 损坏图片占位符硬编码亮色 | `MarkdownView.tsx` | 暗色主题下刺眼 |

---

### Task 6: 右键切换模式时保存滚动位置 + Esc 快捷键

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/SourceEditor.tsx`

**需求说明**: 用户习惯用右键双向切换预览/源码模式，不需要编辑器中的右键粘贴功能。因此保持右键双向切换行为不变，仅在切换前保存滚动位置。同时为源码模式添加 Esc 键切回预览作为额外便利。

- [x] **Step 1: 保持右键双向切换，切换前保存滚动位置**

`handleContextMenu` 保持双向切换逻辑，在切换前保存滚动位置：

```tsx
const handleContextMenu = useCallback(
  (e: React.MouseEvent) => {
    if (!doc.file) return
    e.preventDefault()
    if (contentBodyRef.current) {
      scrollPositionRef.current = contentBodyRef.current.scrollTop
    }
    setMode(doc.mode === 'preview' ? 'source' : 'preview')
  },
  [doc.file, doc.mode, setMode]
)
```

- [x] **Step 2: 为源码模式添加 Esc 键切回预览**

在 `SourceEditor.tsx` 的 props 中新增 `onEscape` 回调，使用 ref 模式避免闭包问题。在 keymap 中添加 Esc 键绑定：

```tsx
{
  key: 'Escape',
  run: () => {
    onEscapeRef.current()
    return true
  }
}
```

在 `App.tsx` 中传入 `onEscape`，切换前同样保存滚动位置。

- [x] **Step 3: 验证**

- 预览模式右键切到源码，源码模式右键切回预览
- 源码模式下按 Esc 切回预览模式
- 切换前后滚动位置保持

---

### Task 7: 添加文件加载中状态

**Files:**
- Modify: `src/renderer/src/hooks/useDocument.ts`
- Modify: `src/renderer/src/types.ts`
- Modify: `src/renderer/src/App.tsx`

- [x] **Step 1: 在 DocumentState 中添加 loading 字段**

```tsx
// types.ts
export type DocumentState = {
  file: WikiFile | null
  content: string
  originalContent: string
  mode: 'preview' | 'source'
  dirty: boolean
  loading: boolean
}
```

初始状态中 `loading: false`。

- [x] **Step 2: 在 loadContent 中设置 loading 状态**

在文件读取前设置 `loading: true`，成功/失败后设置 `loading: false`。

- [x] **Step 3: 在 App.tsx 中显示加载指示**

在内容区域添加 loading 判断，显示"加载中..."。

- [x] **Step 4: 添加加载状态样式**

在 `App.css` 中添加 `.content-loading` 样式。

- [x] **Step 5: 验证**

- 点击文件时短暂显示"加载中..."
- 文件加载完成后正常显示内容
- 快速切换文件时只显示最后选中的文件内容

---

### Task 8: 模式切换保持滚动位置

**Files:**
- Modify: `src/renderer/src/App.tsx`

**问题分析**: 预览→源码→预览切换时，`.content-body` 的子组件被 React 销毁重建，滚动位置重置为 0。需要在切换前保存位置，切换后恢复。

- [x] **Step 1: 添加滚动位置保存 ref**

```tsx
const scrollPositionRef = useRef<number>(0)
const contentBodyRef = useRef<HTMLDivElement>(null)
```

- [x] **Step 2: 为 content-body 添加 ref 并在模式切换时恢复**

```tsx
<div ref={contentBodyRef} className="content-body">

useEffect(() => {
  if (doc.mode === 'preview' && doc.file && contentBodyRef.current) {
    contentBodyRef.current.scrollTop = scrollPositionRef.current
  }
}, [doc.mode, doc.file])
```

滚动位置的保存在 Task 6 的右键切换和 Esc 回调中完成。

- [x] **Step 3: 验证**

- 打开长文档，滚动到中间位置
- 右键切换到源码模式
- 再切回预览模式，确认滚动位置接近原始位置

---

### Task 9: 侧栏宽度持久化

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [x] **Step 1: 使用 localStorage 持久化侧栏宽度**

将初始值从硬编码改为从 localStorage 读取：

```tsx
const [sidebarWidth, setSidebarWidth] = useState(() => {
  const saved = localStorage.getItem('sidebar-width')
  return saved ? Math.min(window.innerWidth / 2, Math.max(200, Number(saved))) : 240
})
```

- [x] **Step 2: 在宽度变化时写入 localStorage**

在 `handleResizeMouseDown` 的 `onMouseUp` 中保存，只在拖拽结束时保存一次。

- [x] **Step 3: 验证**

- 拖拽调整侧栏宽度
- 关闭应用并重新打开
- 侧栏宽度恢复为上次设置的值

---

### Task 10: 损坏图片占位符适配暗色主题

**Files:**
- Modify: `src/renderer/src/components/MarkdownView.tsx`
- Modify: `src/renderer/src/markdown.css`

- [x] **Step 1: 移除 BROKEN_SVG 常量**

移除硬编码亮色的 `BROKEN_SVG`，将所有引用替换为 `PLACEHOLDER`。`PLACEHOLDER` 是一个 1x1 透明 SVG，设置后 img 会触发 error 事件，被 error handler 统一处理。

- [x] **Step 2: 将损坏的 img 替换为 CSS 控制的 span**

在 error handler 中将损坏的 `<img>` 替换为带 `.broken-image-placeholder` 类的 `<span>`：

```tsx
img.addEventListener('error', function handleError() {
  img.removeEventListener('error', handleError)
  const placeholder = document.createElement('span')
  placeholder.className = 'broken-image-placeholder'
  placeholder.textContent = '🖼 图片无法加载'
  img.replaceWith(placeholder)
})
```

- [x] **Step 3: 添加 CSS 样式，支持暗色主题**

```css
.broken-image-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 120px;
  min-height: 80px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.04);
  border: 1px dashed rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

[data-theme='dark'] .broken-image-placeholder {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.12);
}
```

- [x] **Step 4: 验证**

- 引用一个不存在的图片路径，确认显示损坏占位符
- 占位符使用 CSS 变量颜色，跟随主题

---

## 验证清单

完成所有 Task 后：

- [x] 右键可在预览/源码间双向切换，源码模式下 Esc 也可切回预览
- [x] 点击文件时有加载提示
- [x] 预览↔源码切换后滚动位置大致保持
- [x] 重启后侧栏宽度保持上次设置
- [x] 损坏图片显示占位符，暗色主题下不刺眼
