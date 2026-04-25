# P0: 关键渲染 Bug 修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 5 个会导致可见渲染异常的关键 Bug，包括 SourceEditor 闭包过期、标题 ID 不一致、文件切换竞态、图片闪烁、Observer 重建性能问题。

**Architecture:** 各修复相互独立，可并行执行。修改集中在渲染进程的 hooks、组件和工具函数中，不涉及主进程或 preload。

**Tech Stack:** React 18、TypeScript、markdown-it、CodeMirror 6

**前置条件:** Phase 1–4 已完成，应用可正常启动和编辑。

---

## Bug 修复清单

| # | Bug | 文件 | 影响 |
|---|-----|------|------|
| 1 | SourceEditor `onSave` 闭包过期 | `SourceEditor.tsx` | Cmd+S 在打开工作区后失效 |
| 2 | 标题 ID 双份实现不一致 | `headings.ts`、`markdown.ts` | Setext 标题不出现在侧栏 |
| 3 | 文件快速切换竞态条件 | `useDocument.ts` | 显示错误文件内容 |
| 4 | 图片切换时全部闪烁 | `MarkdownView.tsx` | 切回预览时图片消失再出现 |
| 5 | IntersectionObserver 不必要重建 | `App.tsx`、`useHeadings.ts` | 频繁更新时卡顿 |

---

### Task 1: 修复 SourceEditor onSave 闭包过期

**Files:**
- Modify: `src/renderer/src/components/SourceEditor.tsx`

- [ ] **Step 1: 将 `onSave` 改为 ref 模式**

在 `SourceEditor.tsx` 中，参照已有的 `onChangeRef` 模式，新增 `onSaveRef`：

```tsx
const onSaveRef = useRef(onSave)
onSaveRef.current = onSave
```

- [ ] **Step 2: 更新 keymap 中的调用**

将 keymap 里的 `onSave()` 替换为 `onSaveRef.current()`：

```tsx
{
  key: 'Mod-s',
  run: () => {
    onSaveRef.current()
    return true
  }
}
```

- [ ] **Step 3: 验证**

确认编辑器中按 Ctrl+S 仍能触发保存；打开文件夹后切换文件再编辑保存仍正常工作。

---

### Task 2: 统一标题 ID 生成逻辑

**Files:**
- Modify: `src/renderer/src/utils/headings.ts`
- Modify: `src/renderer/src/utils/markdown.ts`

**问题分析**: `headings.ts` 用正则 `^(#{1,6})\s+(.+)$` 只能识别 ATX 标题，而 `markdown.ts` 通过 markdown-it 的 `heading_open` token 能处理所有标题风格。此外两处 ID 去重逻辑各自维护独立的 Map，如果输入文本存在微妙差异（如行尾空格），可能生成不同 ID。

- [ ] **Step 1: 在 markdown.ts 中导出标题提取函数**

新增一个函数，在 markdown-it 渲染流程中同时提取标题列表，确保 ID 与 HTML 完全一致：

```tsx
// utils/markdown.ts

export function extractRenderedHeadings(source: string): Heading[] {
  const headings: Heading[] = []
  const tempMd = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(str: string, lang: string): string {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
        } catch { /* fallback */ }
      }
      return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
    }
  })

  const localHeadingIds = new Map<string, number>()

  tempMd.core.ruler.push('heading_ids', (state) => {
    localHeadingIds.clear()
    for (const token of state.tokens) {
      if (token.type === 'heading_open') {
        const inline = state.tokens[state.tokens.indexOf(token) + 1]
        if (inline) {
          const text = inline.content
          const baseId = text
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
            .replace(/^-|-$/g, '')
          const count = localHeadingIds.get(baseId) || 0
          localHeadingIds.set(baseId, count + 1)
          const id = count === 0 ? baseId : `${baseId}-${count}`
          token.attrSet('id', id)
          headings.push({ id, level: parseInt(token.tag.slice(1)), text })
        }
      }
    }
  })

  tempMd.render(source)
  return headings
}
```

> **注意**: 不要复用全局 `md` 实例，因为 `heading_ids` ruler 会往 `headingIds` 全局 Map 里写数据，可能与 `renderMarkdown` 冲突。使用独立的 `tempMd` 实例。

- [ ] **Step 2: 让 headings.ts 转发到新函数**

```tsx
// utils/headings.ts

import type { Heading } from '../types'
import { extractRenderedHeadings } from './markdown'

export function extractHeadings(markdownSource: string): Heading[] {
  return extractRenderedHeadings(markdownSource)
}
```

保留 `headings.ts` 文件作为 facade，避免修改所有 import 路径。

- [ ] **Step 3: 验证**

- 包含 ATX 标题（`# Title`）的文档：侧栏标题列表正常
- 包含 Setext 标题的文档：侧栏标题列表现在能显示这些标题
- 包含重复标题的文档：ID 去重正确，锚点跳转正常

---

### Task 3: 修复文件快速切换竞态条件

**Files:**
- Modify: `src/renderer/src/hooks/useDocument.ts`

- [ ] **Step 1: 添加请求序列号**

在 `useDocument` 中添加递增的请求 ID ref：

```tsx
const loadSeqRef = useRef(0)
```

- [ ] **Step 2: 在 loadContent 中使用序列号保护**

```tsx
const loadContent = useCallback(
  async (file: WikiFile) => {
    if (!workspaceRootPath) return
    const seq = ++loadSeqRef.current
    cancelAutoSave()
    await saveCurrentDoc()

    // 检查是否已被更新的请求取代
    if (seq !== loadSeqRef.current) return

    const result = await window.api.readFile(workspaceRootPath, file.relativePath)

    // 异步完成后再次检查
    if (seq !== loadSeqRef.current) return

    if (result.success && result.content !== undefined) {
      setDoc({
        file,
        content: result.content,
        originalContent: result.content,
        mode: 'preview',
        dirty: false
      })
    } else {
      setDoc({
        file,
        content: `读取失败: ${result.error}`,
        originalContent: '',
        mode: 'preview',
        dirty: false
      })
    }
  },
  [workspaceRootPath, saveCurrentDoc, cancelAutoSave]
)
```

- [ ] **Step 3: 验证**

快速连续点击多个文件，确认最终显示的是最后一次点击的文件内容。

---

### Task 4: 修复图片切换时全部闪烁

**Files:**
- Modify: `src/renderer/src/components/MarkdownView.tsx`

**问题分析**: `imageContextKey` 包含了完整 `source`，导致任何内容变化都会清空已加载的图片。实际上，只要文件路径不变，之前加载的图片大部分仍然有效。

- [ ] **Step 1: 将 imageContextKey 去掉 source**

```tsx
const imageContextKey = `${workspaceRootPath ?? ''}\u0000${currentFilePath ?? ''}`
```

- [ ] **Step 2: 调整图片加载逻辑**

由于 key 不再包含 source，切换同一文件的内容时图片缓存不会丢失。但需要处理图片引用变化的场景（编辑后新增或删除了图片）。

修改图片加载 effect，让它对比 renderedHtml 中的图片列表与已加载的图片：

```tsx
useEffect(() => {
  if (!workspaceRootPath || !currentFilePath) return

  let cancelled = false
  const localSrcs = collectLocalImageSrcs(renderedHtml)

  // 只加载尚未加载的图片
  const unloadedSrcs = localSrcs.filter((src) => !activeImageUrls[src])
  if (unloadedSrcs.length === 0) return

  for (const localSrc of unloadedSrcs) {
    // ... 保持原有加载逻辑不变
  }

  return () => {
    cancelled = true
  }
}, [activeImageUrls, currentFilePath, renderedHtml, workspaceRootPath])
```

- [ ] **Step 3: 清理已不存在的图片缓存**

当 renderedHtml 变化时，某些旧图片可能已不存在于新内容中。在 effect 中清理：

```tsx
useEffect(() => {
  // 清理不在当前 HTML 中的缓存图片
  const currentSrcs = new Set(collectLocalImageSrcs(renderedHtml))
  const currentUrls = loadedImages.key === imageContextKey ? loadedImages.urls : {}
  const staleKeys = Object.keys(currentUrls).filter((k) => !currentSrcs.has(k))

  if (staleKeys.length > 0) {
    setLoadedImages((prev) => {
      if (prev.key !== imageContextKey) return prev
      const next = { ...prev.urls }
      for (const k of staleKeys) delete next[k]
      return { key: prev.key, urls: next }
    })
  }
}, [renderedHtml, imageContextKey, loadedImages])
```

> **注意**: 这个清理 effect 和图片加载 effect 应该合并或仔细排列顺序，避免清理 effect 在加载 effect 之后运行导致新加载的图片被误清。建议将清理逻辑放在图片加载 effect 的开头。

- [ ] **Step 4: 验证**

- 打开包含多张图片的文档，等待图片全部加载
- 切换到源码模式编辑无关文字，再切回预览
- 图片不应闪烁（保持已加载状态）
- 编辑后新增/删除图片引用，图片列表应正确更新

---

### Task 5: 优化 IntersectionObserver 重建

**Files:**
- Modify: `src/renderer/src/hooks/useHeadings.ts`
- Modify: `src/renderer/src/App.tsx`

**问题分析**: 当前 `contentRefCallback` 依赖 `setupObserver`，后者依赖 `headings`。每次内容变化 → headings 变化 → setupObserver 变化 → contentRefCallback 变化 → React 销毁旧 ref 回调调用(null)再调用新回调(el) → Observer 完全重建。

优化方案：让 Observer 不在每次 headings 变化时重建，而是在 DOM 内容实际变化时更新观察目标。

- [ ] **Step 1: 重构 useHeadings，分离 Observer 创建和目标更新**

```tsx
// useHeadings.ts

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { extractHeadings } from '../utils/headings'

export function useHeadings(content: string) {
  const headings = useMemo(() => extractHeadings(content), [content])
  const [activeId, setActiveId] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const observedContainerRef = useRef<HTMLElement | null>(null)
  const observedHeadingsRef = useRef<string>('')

  const setupObserver = useCallback(
    (container: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      observedContainerRef.current = container
      if (!container || headings.length === 0) return

      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveId(entry.target.id)
            }
          }
        },
        { rootMargin: '0px 0px -80% 0px' }
      )

      const headingsKey = headings.map((h) => h.id).join(',')
      observedHeadingsRef.current = headingsKey

      for (const h of headings) {
        const el = container.querySelector(`#${CSS.escape(h.id)}`)
        if (el) observerRef.current.observe(el)
      }
    },
    [headings]
  )

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  const jumpToHeading = useCallback((id: string) => {
    setActiveId(id)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  return { headings, activeId, setupObserver, jumpToHeading }
}
```

- [ ] **Step 2: 将 App.tsx 的 contentRefCallback 改为稳定的 ref**

去掉 `useCallback` 包装，改用 `useEffect` 监听 `setupObserver` 变化后手动调用：

```tsx
// App.tsx

const contentRef = useRef<HTMLDivElement>(null)

// 当 setupObserver 变化时，重新观察
useEffect(() => {
  if (doc.mode === 'preview' && doc.file && contentRef.current) {
    setupObserver(contentRef.current)
  }
}, [doc.mode, doc.file, setupObserver])
```

同时将 JSX 中的 ref 改为普通的 ref 绑定：

```tsx
<div ref={contentRef} className="content-inner">
```

- [ ] **Step 3: 验证**

- 打开长文档，滚动时侧栏标题高亮正常跟踪
- 切换文件后标题列表和跟踪正常
- 编辑文件后（如通过外部编辑器修改）标题跟踪正常更新

---

## 验证清单

完成所有 Task 后，在宿主机执行以下验证：

- [ ] 应用正常启动，无控制台报错
- [ ] 打开文件夹，选择文件，内容正常显示
- [ ] 切换到源码模式编辑，按 Ctrl+S 保存成功
- [ ] 切换到源码模式编辑文字，切回预览，图片不闪烁
- [ ] 快速连续点击多个文件，最终显示最后点击的文件
- [ ] 包含 ATX 和 Setext 混合标题的文档，侧栏标题列表完整
- [ ] 滚动长文档时，侧栏标题高亮平滑跟踪
- [ ] 右键在预览和源码模式间切换正常
