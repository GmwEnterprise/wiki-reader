# Phase 3: Markdown 渲染与标题导航

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Markdown 内容渲染（含代码高亮）和标题提取/导航功能，侧栏支持文件列表和标题列表切换，点击标题可跳转定位。

**Architecture:** 使用 `markdown-it` 解析 Markdown 为 HTML，通过 `highlight.js` 实现代码块语法高亮。标题通过正则从 Markdown 源码提取，渲染视图中为标题注入锚点 ID 用于跳转。侧栏通过 tab 切换文件列表和标题列表两个视图。

**Tech Stack:** markdown-it, highlight.js, @types/markdown-it

**前置条件:** Phase 2 完成，能打开文件夹并显示文件内容。

---

## 文件结构

```
src/renderer/src/
├── utils/
│   ├── markdown.ts       # 新增：markdown-it 配置和渲染
│   └── headings.ts       # 新增：标题提取
├── components/
│   ├── MarkdownView.tsx  # 新增：渲染视图
│   ├── HeadingList.tsx   # 新增：标题列表
│   └── Sidebar.tsx       # 新增：侧栏（含 tab 切换）
├── App.tsx               # 修改
├── App.css               # 修改
└── hooks/
    └── useHeadings.ts    # 新增
```

---

### Task 1: 安装依赖

- [ ] **Step 1: 安装 markdown-it 和 highlight.js**

```bash
npm install markdown-it highlight.js
npm install -D @types/markdown-it
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add markdown-it and highlight.js dependencies"
```

---

### Task 2: 创建 Markdown 渲染工具

**Files:**
- Create: `src/renderer/src/utils/markdown.ts`

- [ ] **Step 1: 创建 src/renderer/src/utils/markdown.ts**

```ts
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // fallback
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})

const headingIds = new Map<string, number>()

md.core.ruler.push('heading_ids', (state) => {
  headingIds.clear()
  for (const token of state.tokens) {
    if (token.type === 'heading_open') {
      const level = parseInt(token.tag.slice(1))
      const inline = state.tokens[state.tokens.indexOf(token) + 1]
      if (inline) {
        const text = inline.content
        const baseId = text
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
          .replace(/^-|-$/g, '')
        const count = headingIds.get(baseId) || 0
        headingIds.set(baseId, count + 1)
        const id = count === 0 ? baseId : `${baseId}-${count}`
        token.attrSet('id', id)
      }
    }
  }
})

export function renderMarkdown(source: string): string {
  return md.render(source)
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/renderer/src/utils
git add src/renderer/src/utils/markdown.ts
git commit -m "feat(renderer): add markdown-it renderer with heading IDs and code highlighting"
```

---

### Task 3: 创建标题提取工具

**Files:**
- Create: `src/renderer/src/utils/headings.ts`
- Create: `tests/unit/headings.test.ts`

- [ ] **Step 1: 创建 src/renderer/src/utils/headings.ts**

```ts
import type { Heading } from '../types'

export function extractHeadings(markdownSource: string): Heading[] {
  const headings: Heading[] = []
  const lines = markdownSource.split('\n')
  const idCounts = new Map<string, number>()

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].trim()
      const baseId = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-|-$/g, '')
      const count = idCounts.get(baseId) || 0
      idCounts.set(baseId, count + 1)
      const id = count === 0 ? baseId : `${baseId}-${count}`
      headings.push({ id, level, text })
    }
  }

  return headings
}
```

- [ ] **Step 2: 创建 tests/unit/headings.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { extractHeadings } from '../../src/renderer/src/utils/headings'

describe('extractHeadings', () => {
  it('提取标准标题', () => {
    const result = extractHeadings('# 标题一\n## 标题二\n### 标题三')
    expect(result).toEqual([
      { id: '标题一', level: 1, text: '标题一' },
      { id: '标题二', level: 2, text: '标题二' },
      { id: '标题三', level: 3, text: '标题三' }
    ])
  })

  it('忽略非标题行', () => {
    const result = extractHeadings('普通文本\n## 标题\n更多文本')
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('标题')
  })

  it('处理重复标题', () => {
    const result = extractHeadings('## Intro\n## Intro')
    expect(result[0].id).toBe('intro')
    expect(result[1].id).toBe('intro-1')
  })

  it('处理空内容', () => {
    const result = extractHeadings('')
    expect(result).toEqual([])
  })

  it('处理六级标题', () => {
    const result = extractHeadings('###### 小标题')
    expect(result[0].level).toBe(6)
  })

  it('标题文本去除首尾空格', () => {
    const result = extractHeadings('#  Hello  ')
    expect(result[0].text).toBe('Hello')
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run tests/unit/headings.test.ts
```

Expected: 6 个测试全部通过

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/utils/headings.ts tests/unit/headings.test.ts
git commit -m "feat(renderer): add heading extraction with unit tests"
```

---

### Task 4: 创建 MarkdownView 组件

**Files:**
- Create: `src/renderer/src/components/MarkdownView.tsx`

- [ ] **Step 1: 创建 src/renderer/src/components/MarkdownView.tsx**

```tsx
import { useMemo, useRef, useCallback } from 'react'
import { renderMarkdown } from '../utils/markdown'

type MarkdownViewProps = {
  source: string
}

export default function MarkdownView({ source }: MarkdownViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const html = useMemo(() => renderMarkdown(source), [source])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('a')
    if (!anchor) return

    const href = anchor.getAttribute('href')
    if (!href) return

    if (href.startsWith('#')) {
      e.preventDefault()
      const id = href.slice(1)
      containerRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    if (href.startsWith('http://') || href.startsWith('https://')) {
      e.preventDefault()
      window.open(href, '_blank')
      return
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/MarkdownView.tsx
git commit -m "feat(renderer): add MarkdownView component with link handling"
```

---

### Task 5: 创建 HeadingList 组件

**Files:**
- Create: `src/renderer/src/components/HeadingList.tsx`

- [ ] **Step 1: 创建 src/renderer/src/components/HeadingList.tsx**

```tsx
import type { Heading } from '../types'

type HeadingListProps = {
  headings: Heading[]
  activeId: string | null
  onJump: (id: string) => void
}

export default function HeadingList({ headings, activeId, onJump }: HeadingListProps) {
  if (headings.length === 0) {
    return <div className="heading-list-empty">当前文档无标题</div>
  }

  return (
    <div className="heading-list">
      {headings.map((h) => (
        <div
          key={h.id}
          className={`heading-item heading-item--level-${h.level} ${h.id === activeId ? 'heading-item--active' : ''}`}
          style={{ paddingLeft: (h.level - 1) * 16 + 12 }}
          onClick={() => onJump(h.id)}
        >
          {h.text}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/HeadingList.tsx
git commit -m "feat(renderer): add HeadingList component for heading navigation"
```

---

### Task 6: 创建 Sidebar 组件（含 tab 切换）

**Files:**
- Create: `src/renderer/src/components/Sidebar.tsx`

- [ ] **Step 1: 创建 src/renderer/src/components/Sidebar.tsx**

```tsx
import { useState } from 'react'
import FileList from './FileList'
import HeadingList from './HeadingList'
import type { WikiFile, Heading } from '../types'

type SidebarTab = 'files' | 'headings'

type SidebarProps = {
  files: WikiFile[]
  selectedPath: string | null
  headings: Heading[]
  activeHeadingId: string | null
  onSelectFile: (file: WikiFile) => void
  onJumpHeading: (id: string) => void
  hasDocument: boolean
}

export default function Sidebar({
  files,
  selectedPath,
  headings,
  activeHeadingId,
  onSelectFile,
  onJumpHeading,
  hasDocument
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('files')

  return (
    <>
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${tab === 'files' ? 'sidebar-tab--active' : ''}`}
          onClick={() => setTab('files')}
        >
          文件
        </button>
        <button
          className={`sidebar-tab ${tab === 'headings' ? 'sidebar-tab--active' : ''}`}
          onClick={() => setTab('headings')}
          disabled={!hasDocument}
        >
          标题
        </button>
      </div>
      <div className="sidebar-content">
        {tab === 'files' ? (
          <FileList files={files} selectedPath={selectedPath} onSelect={onSelectFile} />
        ) : (
          <HeadingList headings={headings} activeId={activeHeadingId} onJump={onJumpHeading} />
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/Sidebar.tsx
git commit -m "feat(renderer): add Sidebar component with file/heading tab switching"
```

---

### Task 7: 创建 useHeadings hook

**Files:**
- Create: `src/renderer/src/hooks/useHeadings.ts`

- [ ] **Step 1: 创建 src/renderer/src/hooks/useHeadings.ts**

```ts
import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { extractHeadings } from '../utils/headings'
import type { Heading } from '../types'

export function useHeadings(content: string) {
  const headings = useMemo(() => extractHeadings(content), [content])
  const [activeId, setActiveId] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const setupObserver = useCallback(
    (container: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
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

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/hooks/useHeadings.ts
git commit -m "feat(renderer): add useHeadings hook with intersection observer"
```

---

### Task 8: 接入 App 组件

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

- [ ] **Step 1: 修改 src/renderer/src/App.tsx**

```tsx
import { useRef, useCallback } from 'react'
import { useWorkspace } from './hooks/useWorkspace'
import { useHeadings } from './hooks/useHeadings'
import Sidebar from './components/Sidebar'
import MarkdownView from './components/MarkdownView'

export default function App() {
  const { workspace, files, doc, openFolder, openFile } = useWorkspace()
  const contentRef = useRef<HTMLDivElement>(null)
  const { headings, activeId, setupObserver, jumpToHeading } = useHeadings(doc.content)

  const contentRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      contentRef.current = el
      if (doc.mode === 'preview' && doc.file) {
        setupObserver(el)
      }
    },
    [doc.mode, doc.file, setupObserver]
  )

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <button className="toolbar-btn" onClick={openFolder}>
            打开文件夹
          </button>
          {workspace && <span className="toolbar-title">{workspace.name}</span>}
        </div>
        <div className="toolbar-right">
          <span className="toolbar-status">
            {doc.file ? (doc.dirty ? '未保存' : '已保存') : ''}
          </span>
        </div>
      </header>
      <div className="body">
        <aside className="sidebar">
          {workspace ? (
            <Sidebar
              files={files}
              selectedPath={doc.file?.relativePath ?? null}
              headings={headings}
              activeHeadingId={activeId}
              onSelectFile={openFile}
              onJumpHeading={jumpToHeading}
              hasDocument={!!doc.file}
            />
          ) : (
            <div className="sidebar-empty">未打开文件夹</div>
          )}
        </aside>
        <main className="content">
          {doc.file ? (
            <div ref={contentRefCallback} className="content-inner">
              <MarkdownView source={doc.content} />
            </div>
          ) : (
            <div className="content-empty">请选择一个 Markdown 文件</div>
          )}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 在 App.css 末尾追加 Markdown 渲染样式和侧栏样式**

```css
.sidebar {
  display: flex;
  flex-direction: column;
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-tab {
  flex: 1;
  padding: 8px 0;
  font-size: 12px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.sidebar-tab:hover:not(:disabled) {
  color: var(--text);
}

.sidebar-tab--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.sidebar-tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.heading-list-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 13px;
}

.heading-item {
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heading-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.heading-item--active {
  color: var(--accent);
  font-weight: 500;
}

.content-inner {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 24px;
}

.markdown-body {
  font-size: 16px;
  line-height: 1.75;
  color: var(--text);
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  font-weight: 600;
  line-height: 1.3;
}

.markdown-body h1 { font-size: 1.8em; }
.markdown-body h2 { font-size: 1.5em; }
.markdown-body h3 { font-size: 1.25em; }

.markdown-body p {
  margin-bottom: 1em;
}

.markdown-body ul,
.markdown-body ol {
  margin-bottom: 1em;
  padding-left: 2em;
}

.markdown-body blockquote {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 4px solid var(--accent);
  background: rgba(0, 0, 0, 0.03);
  color: var(--text-secondary);
}

.markdown-body pre {
  margin: 1em 0;
  border-radius: 6px;
  overflow-x: auto;
}

.markdown-body code {
  font-family: 'SF Mono', 'Consolas', 'Liberation Mono', monospace;
  font-size: 0.9em;
}

.markdown-body :not(pre) > code {
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 3px;
}

.markdown-body pre.hljs {
  padding: 16px;
  background: #282c34;
  color: #abb2bf;
}

.markdown-body table {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
}

.markdown-body th,
.markdown-body td {
  padding: 8px 12px;
  border: 1px solid var(--border);
  text-align: left;
}

.markdown-body th {
  background: rgba(0, 0, 0, 0.03);
  font-weight: 600;
}

.markdown-body img {
  max-width: 100%;
  height: auto;
}

.markdown-body a {
  color: var(--accent);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body hr {
  margin: 2em 0;
  border: none;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 3: 启动验证**

```bash
npm run dev
```

验证步骤：
1. 打开一个包含 Markdown 文件的文件夹
2. 点击 `.md` 文件，右侧显示渲染后的内容
3. 代码块有语法高亮
4. 切换侧栏到"标题"标签，显示当前文档标题列表
5. 点击标题，右侧滚动到对应位置
6. 标题高亮跟踪当前滚动位置
7. 外部链接点击后在系统浏览器打开

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css
git commit -m "feat(renderer): integrate MarkdownView, HeadingList, and Sidebar into App"
```

---

## 自检清单

- [ ] Markdown 文件渲染显示正确（标题、列表、表格、代码块、引用、链接、图片）
- [ ] 代码块有 highlight.js 语法高亮
- [ ] 标题列表正确提取并显示
- [ ] 侧栏"文件"/"标题"切换正常
- [ ] 点击标题可跳转到对应位置
- [ ] 标题高亮跟踪滚动位置
- [ ] 锚点链接在文档内跳转
- [ ] 外部链接在系统浏览器打开
- [ ] 标题提取单元测试通过
