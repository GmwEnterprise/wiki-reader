# 高风险性能问题修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 5 个高风险性能问题：标题重复解析、O(n²) token 查找、图片 data URL 内存膨胀、文件树无虚拟化、文档多份内容副本。

**Architecture:** 每项修复独立，按依赖关系排序执行。修改范围覆盖主进程（workspace.ts、ipc-handlers.ts）、预加载脚本（preload/index.ts）、渲染进程（hooks、components、utils）和类型声明。

**Tech Stack:** TypeScript / React 18 / Electron 33 / markdown-it / Vitest

**设计文档:** `docs/superpowers/specs/2026-04-28-high-risk-performance-design.md`

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `src/renderer/src/utils/markdown.ts` | heading 插件改索引循环；删除 extractRenderedHeadings |
| 修改 | `src/renderer/src/types.ts` | DocumentState 删除 originalContent |
| 修改 | `src/renderer/src/hooks/useDocument.ts` | originalContent 移入 useRef |
| 重写 | `src/renderer/src/utils/headings.ts` | 轻量行扫描替代完整 MarkdownIt render |
| 修改 | `src/renderer/src/hooks/useHeadings.ts` | 增加 mode 参数，源码模式跳过提取 |
| 修改 | `src/renderer/src/App.tsx` | useHeadings 传 doc.mode |
| 修改 | `src/main/workspace.ts` | readWorkspaceAsset / readAbsoluteImageFile 返回 ArrayBuffer |
| 修改 | `src/main/ipc-handlers.ts` | asset handler 返回格式 |
| 修改 | `src/preload/index.ts` | readAsset / readAbsoluteAsset 类型 |
| 修改 | `src/renderer/src/env.d.ts` | window.api 类型声明 |
| 重写 | `src/renderer/src/components/MarkdownView.tsx` | Blob URL + 批量加载 |
| 重写 | `src/renderer/src/components/FileList.tsx` | Map 构建 + 虚拟滚动 |
| 修改 | `src/renderer/src/sidebar.css` | 虚拟滚动容器样式 |
| 创建 | `tests/unit/markdown-heading-ids.test.ts` | heading ID 生成测试 |
| 创建 | `tests/unit/headings-extract.test.ts` | 行扫描标题提取测试 |
| 修改 | `tests/unit/workspace-asset.test.ts` | 适配 ArrayBuffer 返回 |
| 修改 | `tests/unit/markdown-images.test.ts` | 适配 Blob URL |
| 修改 | `tests/unit/file-list-tree.test.ts` | 新增扁平化和虚拟滚动测试 |

---

### Task 1: heading 插件改索引循环（修复 2）

**Files:**
- 修改: `src/renderer/src/utils/markdown.ts:22-40`（主 md 实例的 heading_ids 规则）
- 修改: `src/renderer/src/utils/markdown.ts:64-83`（extractRenderedHeadings 内的 heading_ids 规则）
- 创建: `tests/unit/markdown-heading-ids.test.ts`

- [ ] **Step 1: 创建 heading ID 生成测试**

```ts
// tests/unit/markdown-heading-ids.test.ts
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../src/renderer/src/utils/markdown'

describe('markdown heading_ids 插件', () => {
  it('为单标题生成正确 ID', () => {
    const html = renderMarkdown('# Hello World')
    expect(html).toContain('id="hello-world"')
  })

  it('为重复标题添加计数后缀', () => {
    const html = renderMarkdown('# Intro\n## Intro\n### Intro')
    expect(html).toContain('id="intro"')
    expect(html).toContain('id="intro-1"')
    expect(html).toContain('id="intro-2"')
  })

  it('为中文标题生成正确 ID', () => {
    const html = renderMarkdown('# 你好世界')
    expect(html).toContain('id="你好世界"')
  })

  it('标题 ID 中的特殊字符被替换为连字符', () => {
    const html = renderMarkdown('# Hello & World!')
    expect(html).toContain('id="hello-world"')
  })

  it('多级标题各自独立编号', () => {
    const html = renderMarkdown('# Title\n## Section\n## Section\n# Title')
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1])
    expect(ids).toEqual(['title', 'section', 'section-1', 'title-1'])
  })
})
```

- [ ] **Step 2: 在宿主机运行测试确认通过**

```bash
pnpm test
```

预期：全部通过（当前 `indexOf` 实现逻辑正确，只是性能差）。

- [ ] **Step 3: 修改主 md 实例的 heading_ids 规则为索引循环**

将 `src/renderer/src/utils/markdown.ts` 第 22-40 行的 `heading_ids` 规则替换为：

```ts
md.core.ruler.push('heading_ids', (state) => {
  headingIds.clear()
  for (let i = 0; i < state.tokens.length; i++) {
    if (state.tokens[i].type === 'heading_open') {
      const inline = state.tokens[i + 1]
      if (inline) {
        const text = inline.content
        const baseId = text
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
          .replace(/^-|-$/g, '')
        const count = headingIds.get(baseId) || 0
        headingIds.set(baseId, count + 1)
        const id = count === 0 ? baseId : `${baseId}-${count}`
        state.tokens[i].attrSet('id', id)
      }
    }
  }
})
```

- [ ] **Step 4: 修改 extractRenderedHeadings 内的 heading_ids 规则为索引循环**

将 `src/renderer/src/utils/markdown.ts` 第 64-83 行的第二个 `heading_ids` 规则替换为：

```ts
tempMd.core.ruler.push('heading_ids', (state) => {
  localHeadingIds.clear()
  for (let i = 0; i < state.tokens.length; i++) {
    if (state.tokens[i].type === 'heading_open') {
      const inline = state.tokens[i + 1]
      if (inline) {
        const text = inline.content
        const baseId = text
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
          .replace(/^-|-$/g, '')
        const count = localHeadingIds.get(baseId) || 0
        localHeadingIds.set(baseId, count + 1)
        const id = count === 0 ? baseId : `${baseId}-${count}`
        state.tokens[i].attrSet('id', id)
        headings.push({ id, level: parseInt(state.tokens[i].tag.slice(1)), text })
      }
    }
  }
})
```

- [ ] **Step 5: 在宿主机运行测试确认通过**

```bash
pnpm test
```

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/utils/markdown.ts tests/unit/markdown-heading-ids.test.ts
git commit -m "perf: heading_ids plugin use indexed loop instead of indexOf (O(n²) → O(n))"
```

---

### Task 2: originalContent 移入 useRef（修复 5）

**Files:**
- 修改: `src/renderer/src/types.ts:14-21`
- 修改: `src/renderer/src/hooks/useDocument.ts`

- [ ] **Step 1: 从 DocumentState 类型删除 originalContent**

将 `src/renderer/src/types.ts` 中的 `DocumentState` 改为：

```ts
export type DocumentState = {
  file: WikiFile | null
  content: string
  mode: 'preview' | 'source'
  dirty: boolean
  loading: boolean
}
```

- [ ] **Step 2: 更新 useDocument hook**

将 `src/renderer/src/hooks/useDocument.ts` 整体替换为：

```ts
import { useState, useCallback, useRef } from 'react'
import type { WikiFile, DocumentState } from '../types'

export function useDocument(workspaceRootPath: string | null) {
  const [doc, setDoc] = useState<DocumentState>({
    file: null,
    content: '',
    mode: 'preview',
    dirty: false,
    loading: false
  })
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const loadSeqRef = useRef(0)
  const editVersionRef = useRef(0)
  const originalContentRef = useRef('')

  const saveCurrentDoc = useCallback(async (contentOverride?: string) => {
    const current = docRef.current
    if (!current.file || !workspaceRootPath) return
    const savedRelativePath = current.file.relativePath
    const savedEditVersion = editVersionRef.current
    const savedContent = contentOverride ?? current.content
    if (!current.dirty && savedContent === originalContentRef.current) return
    const result = await window.api.saveFile(
      workspaceRootPath,
      savedRelativePath,
      savedContent
    )
    if (result.success) {
      if (
        docRef.current.file?.relativePath === savedRelativePath &&
        editVersionRef.current === savedEditVersion
      ) {
        originalContentRef.current = savedContent
        docRef.current = {
          ...docRef.current,
          content: savedContent,
          dirty: false
        }
      }
      setDoc((prev) => {
        if (
          prev.file?.relativePath !== savedRelativePath ||
          editVersionRef.current !== savedEditVersion
        ) return prev
        return {
          ...prev,
          content: savedContent,
          dirty: false
        }
      })
    }
  }, [workspaceRootPath])

  const cancelAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
  }, [])

  const loadContent = useCallback(
    async (file: WikiFile) => {
      if (!workspaceRootPath) return
      const seq = ++loadSeqRef.current
      cancelAutoSave()
      setDoc((prev) => ({ ...prev, loading: true }))
      const result = await window.api.readFile(workspaceRootPath, file.relativePath)
      if (seq !== loadSeqRef.current) return
      editVersionRef.current += 1
      if (result.success && result.content !== undefined) {
        originalContentRef.current = result.content
        const next = {
          file,
          content: result.content,
          mode: 'preview' as const,
          dirty: false,
          loading: false
        }
        docRef.current = next
        setDoc(next)
      } else {
        const next = {
          file,
          content: `读取失败: ${result.error}`,
          mode: 'preview' as const,
          dirty: false,
          loading: false
        }
        originalContentRef.current = ''
        docRef.current = next
        setDoc(next)
      }
    },
    [workspaceRootPath, cancelAutoSave]
  )

  const markDirty = useCallback(
    () => {
      editVersionRef.current += 1
      setDoc((prev) => {
        if (prev.dirty) return prev
        const next = {
          ...prev,
          dirty: true
        }
        docRef.current = next
        return next
      })
      cancelAutoSave()
    },
    [cancelAutoSave]
  )

  const syncContent = useCallback((content: string) => {
    setDoc((prev) => {
      const next = {
        ...prev,
        content,
        dirty: content !== originalContentRef.current
      }
      docRef.current = next
      return next
    })
  }, [])

  const flushSave = useCallback(async (contentOverride?: string) => {
    cancelAutoSave()
    await saveCurrentDoc(contentOverride)
  }, [saveCurrentDoc, cancelAutoSave])

  const setMode = useCallback((mode: 'preview' | 'source') => {
    setDoc((prev) => ({ ...prev, mode }))
  }, [])

  const reset = useCallback(() => {
    cancelAutoSave()
    editVersionRef.current += 1
    originalContentRef.current = ''
    const next = {
      file: null,
      content: '',
      mode: 'preview' as const,
      dirty: false,
      loading: false
    }
    docRef.current = next
    setDoc(next)
  }, [cancelAutoSave])

  return { doc, loadContent, markDirty, syncContent, flushSave, setMode, reset }
}
```

关键变化：
- 新增 `originalContentRef = useRef('')`
- 删除所有 state 中的 `originalContent` 字段
- `saveCurrentDoc` 用 `originalContentRef.current` 替代 `current.originalContent`
- `loadContent` 用 `originalContentRef.current = result.content` 替代 state 写入
- `syncContent` 比较 `originalContentRef.current`
- `reset` 清空 `originalContentRef.current`

- [ ] **Step 3: 在宿主机运行类型检查确认通过**

```bash
pnpm build
```

预期：无类型错误。`originalContent` 已从 `DocumentState` 删除，所有引用已替换为 ref。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/types.ts src/renderer/src/hooks/useDocument.ts
git commit -m "perf: move originalContent from React state to useRef to reduce memory copies"
```

---

### Task 3: 标题提取改为轻量行扫描（修复 1）

**Files:**
- 重写: `src/renderer/src/utils/headings.ts`
- 修改: `src/renderer/src/utils/markdown.ts`（删除 extractRenderedHeadings）
- 修改: `src/renderer/src/hooks/useHeadings.ts`
- 修改: `src/renderer/src/App.tsx:20`
- 创建: `tests/unit/headings-extract.test.ts`

- [ ] **Step 1: 创建行扫描标题提取测试**

```ts
// tests/unit/headings-extract.test.ts
import { describe, expect, it } from 'vitest'
import { extractHeadingsFromSource } from '../../src/renderer/src/utils/headings'

describe('extractHeadingsFromSource', () => {
  it('提取各层级标题', () => {
    const headings = extractHeadingsFromSource('# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6')
    expect(headings).toEqual([
      { id: 'h1', level: 1, text: 'H1' },
      { id: 'h2', level: 2, text: 'H2' },
      { id: 'h3', level: 3, text: 'H3' },
      { id: 'h4', level: 4, text: 'H4' },
      { id: 'h5', level: 5, text: 'H5' },
      { id: 'h6', level: 6, text: 'H6' }
    ])
  })

  it('忽略非标题行', () => {
    const headings = extractHeadingsFromSource('普通文本\n# 标题\n更多文本')
    expect(headings).toEqual([{ id: '标题', level: 1, text: '标题' }])
  })

  it('重复标题添加计数后缀', () => {
    const headings = extractHeadingsFromSource('# Intro\n## Intro\n### Intro')
    expect(headings.map(h => h.id)).toEqual(['intro', 'intro-1', 'intro-2'])
  })

  it('中文标题生成正确 ID', () => {
    const headings = extractHeadingsFromSource('# 你好世界')
    expect(headings[0].id).toBe('你好世界')
  })

  it('特殊字符替换为连字符', () => {
    const headings = extractHeadingsFromSource('# Hello & World!')
    expect(headings[0].id).toBe('hello-world')
  })

  it('去除尾部闭合 # 标记', () => {
    const headings = extractHeadingsFromSource('# Title #')
    expect(headings[0].text).toBe('Title')
  })

  it('空内容返回空数组', () => {
    expect(extractHeadingsFromSource('')).toEqual([])
    expect(extractHeadingsFromSource('没有标题的文本\n更多文本')).toEqual([])
  })

  it('多于 6 个 # 不识别为标题', () => {
    const headings = extractHeadingsFromSource('####### 七级不是标题')
    expect(headings).toEqual([])
  })

  it('# 后必须跟空格', () => {
    const headings = extractHeadingsFromSource('#标题无空格')
    expect(headings).toEqual([])
  })
})
```

- [ ] **Step 2: 重写 headings.ts 为行扫描实现**

将 `src/renderer/src/utils/headings.ts` 整体替换为：

```ts
import type { Heading } from '../types'

export function extractHeadingsFromSource(source: string): Heading[] {
  const headings: Heading[] = []
  const idCounts = new Map<string, number>()
  const lines = source.split('\n')

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!match) continue

    const level = match[1].length
    const text = match[2].replace(/\s+#+\s*$/, '').trim()
    const baseId = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '')

    const count = idCounts.get(baseId) || 0
    idCounts.set(baseId, count + 1)
    const id = count === 0 ? baseId : `${baseId}-${count}`

    headings.push({ id, level, text })
  }

  return headings
}

export function extractHeadings(markdownSource: string): Heading[] {
  return extractHeadingsFromSource(markdownSource)
}
```

注意：`extractHeadings` 保留为 wrapper 函数，避免修改外部导入。`extractHeadingsFromSource` 作为新增的导出函数供测试直接调用。

- [ ] **Step 3: 在宿主机运行测试确认通过**

```bash
pnpm test
```

- [ ] **Step 4: 删除 markdown.ts 中的 extractRenderedHeadings**

从 `src/renderer/src/utils/markdown.ts` 中删除第 46-87 行的整个 `extractRenderedHeadings` 函数。删除后文件末尾为：

```ts
export function renderMarkdown(source: string): string {
  return md.render(source)
}
```

文件中不再有 `extractRenderedHeadings` 导出。`headings.ts` 已不再导入它。

- [ ] **Step 5: 更新 useHeadings hook 增加 mode 参数**

将 `src/renderer/src/hooks/useHeadings.ts` 替换为：

```ts
import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { extractHeadings } from '../utils/headings'

export function useHeadings(content: string, mode: 'preview' | 'source') {
  const headings = useMemo(
    () => (mode === 'source' ? [] : extractHeadings(content)),
    [content, mode]
  )
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

关键变化：
- 签名从 `useHeadings(content: string)` 改为 `useHeadings(content: string, mode: 'preview' | 'source')`
- `useMemo` 依赖增加 `mode`
- `mode === 'source'` 时返回空数组

- [ ] **Step 6: 更新 App.tsx 传 doc.mode**

将 `src/renderer/src/App.tsx` 第 20 行：

```ts
const { headings, activeId, setupObserver, jumpToHeading } = useHeadings(doc.content)
```

改为：

```ts
const { headings, activeId, setupObserver, jumpToHeading } = useHeadings(doc.content, doc.mode)
```

- [ ] **Step 7: 在宿主机运行类型检查和测试**

```bash
pnpm build
pnpm test
```

- [ ] **Step 8: 提交**

```bash
git add src/renderer/src/utils/headings.ts src/renderer/src/utils/markdown.ts src/renderer/src/hooks/useHeadings.ts src/renderer/src/App.tsx tests/unit/headings-extract.test.ts
git commit -m "perf: replace MarkdownIt render with lightweight line scan for heading extraction"
```

---

### Task 4: 图片 Blob URL + 批量加载（修复 3）

**Files:**
- 修改: `src/main/workspace.ts:102-122`
- 修改: `src/main/ipc-handlers.ts:114-130`
- 修改: `src/preload/index.ts:24-27`
- 修改: `src/renderer/src/env.d.ts:25-31`
- 重写: `src/renderer/src/components/MarkdownView.tsx:64-211`
- 修改: `tests/unit/workspace-asset.test.ts`
- 修改: `tests/unit/markdown-images.test.ts`

- [ ] **Step 1: 修改 workspace.ts 返回 ArrayBuffer**

将 `src/main/workspace.ts` 的 `readWorkspaceAsset`（第 102-112 行）替换为：

```ts
export async function readWorkspaceAsset(
  rootPath: string,
  relativePath: string
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const fullPath = join(rootPath, relativePath)
  const resolved = await validatePath(rootPath, fullPath)
  if (!resolved) throw new Error(`路径不合法: ${relativePath}`)

  const mimeType = IMAGE_MIME_TYPES.get(extname(relativePath).toLowerCase())
  if (!mimeType) throw new Error(`不支持的图片类型: ${relativePath}`)

  const buf = await readFile(fullPath)
  const buffer = new ArrayBuffer(buf.byteLength)
  new Uint8Array(buffer).set(buf)
  return { buffer, mimeType }
}
```

将 `readAbsoluteImageFile`（第 114-122 行）替换为：

```ts
export async function readAbsoluteImageFile(
  absolutePath: string
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const normalizedPath = normalize(absolutePath)
  const ext = extname(normalizedPath).toLowerCase()
  const mimeType = IMAGE_MIME_TYPES.get(ext)
  if (!mimeType) throw new Error(`不支持的图片类型: ${ext}`)

  const buf = await readFile(normalizedPath)
  const buffer = new ArrayBuffer(buf.byteLength)
  new Uint8Array(buffer).set(buf)
  return { buffer, mimeType }
}
```

- [ ] **Step 2: 修改 ipc-handlers.ts 返回格式**

将 `src/main/ipc-handlers.ts` 中 `workspace:readAsset` handler（第 114-121 行）替换为：

```ts
ipcMain.handle('workspace:readAsset', async (_event, rootPath: string, relativePath: string) => {
  try {
    const result = await readWorkspaceAsset(rootPath, relativePath)
    return { success: true, buffer: result.buffer, mimeType: result.mimeType }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})
```

将 `workspace:readAbsoluteAsset` handler（第 123-130 行）替换为：

```ts
ipcMain.handle('workspace:readAbsoluteAsset', async (_event, absolutePath: string) => {
  try {
    const result = await readAbsoluteImageFile(absolutePath)
    return { success: true, buffer: result.buffer, mimeType: result.mimeType }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})
```

- [ ] **Step 3: 修改 preload/index.ts 类型签名**

将 `src/preload/index.ts` 第 24-27 行替换为：

```ts
  readAsset: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('workspace:readAsset', rootPath, relativePath) as Promise<{
      success: boolean
      buffer?: ArrayBuffer
      mimeType?: string
      error?: string
    }>,
  readAbsoluteAsset: (absolutePath: string) =>
    ipcRenderer.invoke('workspace:readAbsoluteAsset', absolutePath) as Promise<{
      success: boolean
      buffer?: ArrayBuffer
      mimeType?: string
      error?: string
    }>,
```

- [ ] **Step 4: 修改 env.d.ts 类型声明**

将 `src/renderer/src/env.d.ts` 第 25-31 行的 `readAsset` 和 `readAbsoluteAsset` 类型替换为：

```ts
      readAsset: (
        rootPath: string,
        relativePath: string
      ) => Promise<{ success: boolean; buffer?: ArrayBuffer; mimeType?: string; error?: string }>
      readAbsoluteAsset: (
        absolutePath: string
      ) => Promise<{ success: boolean; buffer?: ArrayBuffer; mimeType?: string; error?: string }>
```

- [ ] **Step 5: 重写 MarkdownView 图片加载逻辑**

将 `src/renderer/src/components/MarkdownView.tsx` 整体替换为：

```tsx
import { useMemo, useRef, useCallback, useEffect, useState } from 'react'
import { renderMarkdown } from '../utils/markdown'
import type { WikiFile } from '../types'

type MarkdownViewProps = {
  source: string
  currentFilePath: string | null
  workspaceRootPath: string | null
  files: WikiFile[]
  onOpenFile: (file: WikiFile) => void
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function resolveRelativePath(currentPath: string, linkPath: string): string {
  const normalized = normalizePath(currentPath)
  const dir = normalized.includes('/') ? normalized.substring(0, normalized.lastIndexOf('/')) : ''
  const pathPart = decodeURIComponent(linkPath.split('#')[0])
  const combined = dir ? dir + '/' + pathPart : pathPart
  const parts = combined.split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '..') resolved.pop()
    else if (part !== '.' && part !== '') resolved.push(part)
  }
  return resolved.join('/')
}

const PLACEHOLDER =
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')

const LOCAL_SRC_RE = /(<img\s[^>]*?)src="((?!(?:https?:|data:|file:|\/\/))[^"]+)"([^>]*?>)/g

const ABSOLUTE_PATH_RE = /^(?:[A-Za-z]:[\\/]|\/)/

export function collectLocalImageSrcs(html: string): string[] {
  const srcs = new Set<string>()
  for (const match of html.matchAll(LOCAL_SRC_RE)) {
    srcs.add(match[2])
  }
  return Array.from(srcs)
}

export function replaceLocalImageSrc(html: string, loadedImages: Record<string, string>): string {
  return html.replace(LOCAL_SRC_RE, (_match, before: string, src: string, after: string) => {
    const loadedSrc = loadedImages[src]
    if (loadedSrc) return `${before}src="${loadedSrc}"${after}`
    return `${before}src="${PLACEHOLDER}" data-local-src="${src}"${after}`
  })
}

function isLocalLink(href: string): boolean {
  return (
    !href.startsWith('#') &&
    !href.startsWith('http://') &&
    !href.startsWith('https://') &&
    !href.startsWith('mailto:') &&
    !href.startsWith('data:')
  )
}

function revokeBlobUrls(urls: Record<string, string>): void {
  for (const url of Object.values(urls)) {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }
}

function toBlobUrl(buffer: ArrayBuffer, mimeType: string): string {
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }))
}

export default function MarkdownView({ source, currentFilePath, workspaceRootPath, files, onOpenFile }: MarkdownViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef<Set<string>>(new Set())
  const prevImageUrlsRef = useRef<Record<string, string>>({})
  const imageContextKey = `${workspaceRootPath ?? ''}\u0000${currentFilePath ?? ''}`
  const [loadedImages, setLoadedImages] = useState<{ key: string; urls: Record<string, string> }>({
    key: imageContextKey,
    urls: {}
  })

  const renderResult = useMemo(() => {
    try {
      return { html: renderMarkdown(source), failed: false }
    } catch {
      return { html: '', failed: true }
    }
  }, [source])
  const renderedHtml = renderResult.html
  const activeImageUrls = loadedImages.key === imageContextKey ? loadedImages.urls : {}

  if (loadedImages.key !== imageContextKey) {
    revokeBlobUrls(prevImageUrlsRef.current)
    prevImageUrlsRef.current = {}
  }
  prevImageUrlsRef.current = activeImageUrls

  const html = useMemo(() => replaceLocalImageSrc(renderedHtml, activeImageUrls), [renderedHtml, activeImageUrls])

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

    e.preventDefault()

    if (isLocalLink(href) && currentFilePath) {
      const resolvedPath = resolveRelativePath(currentFilePath, href)
      const targetFile = files.find((f) => normalizePath(f.relativePath) === resolvedPath)
      if (targetFile) {
        onOpenFile(targetFile)
      }
    }
  }, [currentFilePath, files, onOpenFile])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const externalImages = container.querySelectorAll('img:not([data-local-src])')
    for (const img of externalImages) {
      img.addEventListener('error', function handleError() {
        img.removeEventListener('error', handleError)
        const placeholder = document.createElement('span')
        placeholder.className = 'broken-image-placeholder'
        placeholder.textContent = '🖼 图片无法加载'
        img.replaceWith(placeholder)
      })
    }
  }, [html])

  useEffect(() => {
    if (!workspaceRootPath || !currentFilePath) return

    let cancelled = false

    const currentSrcs = new Set(collectLocalImageSrcs(renderedHtml))
    const staleKeys = Object.keys(activeImageUrls).filter((k) => !currentSrcs.has(k))
    if (staleKeys.length > 0) {
      for (const k of staleKeys) {
        const url = activeImageUrls[k]
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      }
      setLoadedImages((prev) => {
        if (prev.key !== imageContextKey) return prev
        const next = { ...prev.urls }
        for (const k of staleKeys) delete next[k]
        return { key: prev.key, urls: next }
      })
    }

    const localSrcs = collectLocalImageSrcs(renderedHtml).filter(
      (src) => !activeImageUrls[src] && !loadingRef.current.has(src)
    )
    if (localSrcs.length === 0) return

    for (const localSrc of localSrcs) {
      loadingRef.current.add(localSrc)
    }

    const loadSingleImage = async (localSrc: string): Promise<[string, string]> => {
      if (ABSOLUTE_PATH_RE.test(localSrc) || ABSOLUTE_PATH_RE.test(decodeURIComponent(localSrc))) {
        const normalized = normalizePath(decodeURIComponent(localSrc))
        const result = await window.api.readAbsoluteAsset(normalized)
        if (!cancelled && result.success && result.buffer && result.mimeType) {
          return [localSrc, toBlobUrl(result.buffer, result.mimeType)]
        }
        return [localSrc, PLACEHOLDER]
      }

      let resolved: string
      try {
        resolved = resolveRelativePath(currentFilePath, localSrc)
      } catch {
        return [localSrc, PLACEHOLDER]
      }

      const result = await window.api.readAsset(workspaceRootPath, resolved)
      if (!cancelled && result.success && result.buffer && result.mimeType) {
        return [localSrc, toBlobUrl(result.buffer, result.mimeType)]
      }
      return [localSrc, PLACEHOLDER]
    }

    Promise.allSettled(localSrcs.map(loadSingleImage)).then((results) => {
      if (cancelled) return
      const batch: Record<string, string> = {}
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const [src, url] = r.value
          batch[src] = url
          loadingRef.current.delete(src)
        }
      }
      setLoadedImages((current) => ({
        key: imageContextKey,
        urls: {
          ...(current.key === imageContextKey ? current.urls : {}),
          ...batch
        }
      }))
    })

    return () => {
      cancelled = true
      for (const localSrc of localSrcs) {
        loadingRef.current.delete(localSrc)
      }
    }
  }, [activeImageUrls, currentFilePath, imageContextKey, renderedHtml, workspaceRootPath])

  useEffect(() => {
    return () => {
      revokeBlobUrls(prevImageUrlsRef.current)
    }
  }, [])

  if (renderResult.failed) {
    return (
      <div className="content-inner">
        <pre className="markdown-fallback">{source}</pre>
      </div>
    )
  }

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

关键变化：
- `toBlobUrl` 用 `URL.createObjectURL(new Blob([buffer], { type: mimeType }))` 创建 Blob URL
- `revokeBlobUrls` 遍历释放 Blob URL
- `imageContextKey` 切换时立即 revoke 旧 URL（渲染阶段检测）
- `Promise.allSettled` 批量等待所有图片，一次性 `setLoadedImages`
- 组件卸载时 revoke 所有活跃 Blob URL

- [ ] **Step 6: 更新 workspace-asset.test.ts**

将 `tests/unit/workspace-asset.test.ts` 替换为：

```ts
import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { readWorkspaceAsset } from '../../src/main/workspace'

const workspaceRoot = join(process.cwd(), 'docs/wiki-example')

describe('readWorkspaceAsset', () => {
  it('返回 ArrayBuffer 和 mimeType', async () => {
    const result = await readWorkspaceAsset(workspaceRoot, 'img/thumbnail.jpg')

    expect(result.buffer).toBeInstanceOf(ArrayBuffer)
    expect(result.buffer.byteLength).toBeGreaterThan(0)
    expect(result.mimeType).toBe('image/jpeg')
  })

  it('拒绝读取 workspace 外的文件', async () => {
    await expect(readWorkspaceAsset(workspaceRoot, '../README.md')).rejects.toThrow('路径不合法')
  })
})
```

- [ ] **Step 7: 更新 markdown-images.test.ts**

将 `tests/unit/markdown-images.test.ts` 替换为：

```ts
import { describe, expect, it } from 'vitest'
import { collectLocalImageSrcs, replaceLocalImageSrc } from '../../src/renderer/src/components/MarkdownView'

describe('MarkdownView 图片资源处理', () => {
  it('收集并占位本地图片 src，忽略外部和 data 图片', () => {
    const html = [
      '<p><img src="../img/thumbnail.jpg" alt="图片一"></p>',
      '<p><img src="https://example.com/a.jpg" alt="外部图片"></p>',
      '<p><img src="data:image/png;base64,abc" alt="内联图片"></p>'
    ].join('')

    expect(collectLocalImageSrcs(html)).toEqual(['../img/thumbnail.jpg'])
    expect(replaceLocalImageSrc(html, {})).toContain('data-local-src="../img/thumbnail.jpg"')
  })

  it('本地图片读取完成后用 Blob URL 替换占位 src', () => {
    const html = '<p><img src="../img/thumbnail.jpg" alt="图片一"></p>'
    const replaced = replaceLocalImageSrc(html, {
      '../img/thumbnail.jpg': 'blob:http://localhost/test-uuid'
    })

    expect(replaced).toContain('src="blob:http://localhost/test-uuid"')
    expect(replaced).not.toContain('data-local-src')
  })
})
```

- [ ] **Step 8: 在宿主机运行类型检查和测试**

```bash
pnpm build
pnpm test
```

- [ ] **Step 9: 提交**

```bash
git add src/main/workspace.ts src/main/ipc-handlers.ts src/preload/index.ts src/renderer/src/env.d.ts src/renderer/src/components/MarkdownView.tsx tests/unit/workspace-asset.test.ts tests/unit/markdown-images.test.ts
git commit -m "perf: use Blob URL instead of data URL for local images with batch loading"
```

---

### Task 5: 文件树 Map 构建 + 虚拟滚动（修复 4）

**Files:**
- 重写: `src/renderer/src/components/FileList.tsx`
- 修改: `src/renderer/src/sidebar.css`
- 修改: `tests/unit/file-list-tree.test.ts`

- [ ] **Step 1: 新增扁平化和虚拟列表测试**

在 `tests/unit/file-list-tree.test.ts` 中追加以下测试：

```ts
import { flattenVisibleNodes } from '../../src/renderer/src/components/FileList'

describe('flattenVisibleNodes', () => {
  const tree = buildFileTree(files)

  it('折叠状态只返回根节点', () => {
    const collapsed = new Set(['guides', 'guides/deploy'])
    const flat = flattenVisibleNodes(tree, collapsed)
    expect(flat.map(n => n.node.name)).toEqual(['guides', 'readme.md'])
  })

  it('部分展开返回可见子节点', () => {
    const collapsed = new Set(['guides/deploy'])
    const flat = flattenVisibleNodes(tree, collapsed)
    expect(flat.map(n => n.node.name)).toEqual(['guides', 'setup.md', 'readme.md'])
  })

  it('全部展开返回所有节点', () => {
    const flat = flattenVisibleNodes(tree, new Set())
    expect(flat.map(n => n.node.name)).toEqual(['guides', 'deploy', 'checklist.md', 'setup.md', 'readme.md'])
  })

  it('depth 值正确', () => {
    const flat = flattenVisibleNodes(tree, new Set())
    expect(flat.map(n => n.depth)).toEqual([0, 1, 2, 2, 0])
  })
})
```

- [ ] **Step 2: 重写 FileList.tsx**

将 `src/renderer/src/components/FileList.tsx` 整体替换为：

```tsx
import { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import type { WikiFile } from '../types'

export type FileTreeNode = {
  name: string
  relativePath: string
  file?: WikiFile
  children: FileTreeNode[]
}

const childrenMapCache = new WeakMap<FileTreeNode, Map<string, FileTreeNode>>()

function getOrCreateChildrenMap(node: FileTreeNode): Map<string, FileTreeNode> {
  let map = childrenMapCache.get(node)
  if (map) return map
  map = new Map()
  for (const child of node.children) {
    map.set(child.name, child)
  }
  childrenMapCache.set(node, map)
  return map
}

export function buildFileTree(files: WikiFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = []
  const rootMap = new Map<string, FileTreeNode>()

  for (const file of files) {
    const parts = file.relativePath.split(/[/\\]/)
    let currentList = root
    let currentMap = rootMap
    let prefix = ''

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]
      prefix = prefix ? prefix + '/' + dirName : dirName
      let existing = currentMap.get(dirName)
      if (!existing) {
        existing = { name: dirName, relativePath: prefix, children: [] }
        currentMap.set(dirName, existing)
        currentList.push(existing)
        const childMap = new Map<string, FileTreeNode>()
        childrenMapCache.set(existing, childMap)
        currentMap = childMap
      } else {
        currentMap = getOrCreateChildrenMap(existing)
      }
      currentList = existing.children
    }

    const leafNode: FileTreeNode = {
      name: file.name,
      relativePath: file.relativePath,
      file,
      children: []
    }
    currentList.push(leafNode)
  }

  sortTree(root)
  return root
}

function sortTree(nodes: FileTreeNode[]): void {
  for (const node of nodes) {
    sortTree(node.children)
  }
  nodes.sort((a, b) => {
    const aIsDir = a.children.length > 0
    const bIsDir = b.children.length > 0
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function collectDirectoryPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.children.length > 0) {
      paths.push(node.relativePath)
    }
    paths.push(...collectDirectoryPaths(node.children))
  }
  return paths
}

export function flattenVisibleNodes(
  nodes: FileTreeNode[],
  collapsed: Set<string>
): { node: FileTreeNode; depth: number }[] {
  const result: { node: FileTreeNode; depth: number }[] = []
  const stack: { node: FileTreeNode; depth: number }[] = []
  for (let i = nodes.length - 1; i >= 0; i--) {
    stack.push({ node: nodes[i], depth: 0 })
  }
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!
    result.push({ node, depth })
    if (node.children.length > 0 && !collapsed.has(node.relativePath)) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i], depth: depth + 1 })
      }
    }
  }
  return result
}

export function mergeCollapsedWithNewDirectories(
  collapsed: Set<string>,
  previousTree: FileTreeNode[],
  nextTree: FileTreeNode[]
): Set<string> {
  const previousDirs = new Set(collectDirectoryPaths(previousTree))
  const addedDirs = collectDirectoryPaths(nextTree).filter((d) => !previousDirs.has(d))
  if (addedDirs.length === 0) return collapsed

  const next = new Set(collapsed)
  for (const d of addedDirs) next.add(d)
  return next
}

const ROW_HEIGHT = 28
const BUFFER_ROWS = 5

type FileListProps = {
  files: WikiFile[]
  selectedPath: string | null
  onSelect: (file: WikiFile) => void
}

export default function FileList({ files, selectedPath, onSelect }: FileListProps) {
  const tree = useMemo(() => buildFileTree(files), [files])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const allDirs = collectDirectoryPaths(tree)
    return new Set(allDirs)
  })
  const [scrollTop, setScrollTop] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const prevTreeRef = useRef(tree)
  useLayoutEffect(() => {
    if (prevTreeRef.current !== tree) {
      setCollapsed((prev) => mergeCollapsedWithNewDirectories(prev, prevTreeRef.current, tree))
      prevTreeRef.current = tree
    }
  }, [tree])

  useEffect(() => {
    if (!selectedPath) return
    const parts = selectedPath.replace(/\\/g, '/').split('/')
    const dirsToExpand: string[] = []
    let current = ''
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? current + '/' + parts[i] : parts[i]
      dirsToExpand.push(current)
    }
    if (dirsToExpand.length > 0) {
      setCollapsed((prev) => {
        const hasCollapsed = dirsToExpand.some((d) => prev.has(d))
        if (!hasCollapsed) return prev
        const next = new Set(prev)
        for (const d of dirsToExpand) next.delete(d)
        return next
      })
    }
  }, [selectedPath])

  const expandAll = useCallback(() => {
    setCollapsed(new Set())
  }, [])

  const collapseAll = useCallback(() => {
    const allDirs = collectDirectoryPaths(tree)
    setCollapsed(new Set(allDirs))
  }, [tree])

  const toggleDir = useCallback((dirPath: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(dirPath)) {
        next.delete(dirPath)
      } else {
        next.add(dirPath)
      }
      return next
    })
  }, [])

  const visibleNodes = useMemo(
    () => flattenVisibleNodes(tree, collapsed),
    [tree, collapsed]
  )

  const totalHeight = visibleNodes.length * ROW_HEIGHT
  const containerHeight = scrollContainerRef.current?.clientHeight ?? 0
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS)
  const endIndex = Math.min(
    visibleNodes.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS
  )

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setScrollTop(scrollContainerRef.current.scrollTop)
    }
  }, [])

  useEffect(() => {
    if (!selectedPath) return
    const idx = visibleNodes.findIndex((n) => n.node.relativePath === selectedPath)
    if (idx === -1) return
    const top = idx * ROW_HEIGHT
    const currentScroll = scrollContainerRef.current?.scrollTop ?? 0
    const height = scrollContainerRef.current?.clientHeight ?? 0
    if (top < currentScroll || top + ROW_HEIGHT > currentScroll + height) {
      scrollContainerRef.current?.scrollTo({ top: top - height / 3, behavior: 'smooth' })
    }
  }, [selectedPath, visibleNodes])

  return (
    <div className="file-list">
      <div className="file-list-actions">
        <button className="file-list-action-btn" onClick={expandAll} title="全部展开">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>
        <button className="file-list-action-btn" onClick={collapseAll} title="全部折叠">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>
      </div>
      <div
        ref={scrollContainerRef}
        className="file-list-scroll"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleNodes.slice(startIndex, endIndex).map((item) => {
            const { node, depth } = item
            const isDir = node.children.length > 0
            const isSelected = node.relativePath === selectedPath
            const isCollapsed = collapsed.has(node.relativePath)
            return (
              <div
                key={node.relativePath}
                className={`file-node ${isSelected ? 'file-node--selected' : ''}`}
                style={{
                  position: 'absolute',
                  top: (startIndex + visibleNodes.slice(startIndex, endIndex).indexOf(item)) * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  '--node-depth': depth
                } as React.CSSProperties}
                onClick={() => {
                  if (isDir) {
                    toggleDir(node.relativePath)
                  } else if (node.file) {
                    onSelect(node.file)
                  }
                }}
              >
                <span className={`file-node-toggle${isDir ? (isCollapsed ? '' : ' file-node-toggle--open') : ' file-node-toggle--empty'}`} />
                <span className="file-node-icon">{isDir ? '📁' : '📄'}</span>
                <span className="file-node-name">{node.name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

关键变化：
- `buildFileTree` 使用 `Map` 缓存（`childrenMapCache` WeakMap）替代 `Array.find`
- 新增 `flattenVisibleNodes` 将树扁平化为可见一维列表（迭代式 DFS，用栈避免递归溢出）
- 虚拟滚动：`file-list-scroll` 容器 `overflow-y: auto`，内部撑高 div，只渲染 `[startIndex, endIndex]` 范围内的行
- 固定行高 28px，上下各 5 行缓冲
- 选中文件滚动到可见范围
- 删除 `FileTreeNodeComponent` 递归组件

注意 `top` 计算中使用了 `visibleNodes.slice(startIndex, endIndex).indexOf(item)` 来获取在渲染切片内的偏移。更高效的方式是直接用绝对索引：

```tsx
top: (startIndex + i) * ROW_HEIGHT
```

其中 `i` 是 `.map` 的回调索引。修正如下：

将渲染循环改为：

```tsx
{visibleNodes.slice(startIndex, endIndex).map((item, i) => {
  const { node, depth } = item
  const isDir = node.children.length > 0
  const isSelected = node.relativePath === selectedPath
  const isCollapsed = collapsed.has(node.relativePath)
  return (
    <div
      key={node.relativePath}
      className={`file-node ${isSelected ? 'file-node--selected' : ''}`}
      style={{
        position: 'absolute',
        top: (startIndex + i) * ROW_HEIGHT,
        left: 0,
        right: 0,
        height: ROW_HEIGHT,
        '--node-depth': depth
      } as React.CSSProperties}
      onClick={() => {
        if (isDir) {
          toggleDir(node.relativePath)
        } else if (node.file) {
          onSelect(node.file)
        }
      }}
    >
      <span className={`file-node-toggle${isDir ? (isCollapsed ? '' : ' file-node-toggle--open') : ' file-node-toggle--empty'}`} />
      <span className="file-node-icon">{isDir ? '📁' : '📄'}</span>
      <span className="file-node-name">{node.name}</span>
    </div>
  )
})}
```

- [ ] **Step 3: 添加虚拟滚动容器 CSS**

在 `src/renderer/src/sidebar.css` 的 `.file-list` 规则之后追加：

```css
.file-list {
  padding: var(--sidebar-list-padding-y) 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.file-list-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.file-list-scroll::-webkit-scrollbar {
  width: 7px;
}

.file-list-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.file-list-scroll::-webkit-scrollbar-thumb {
  background: var(--sidebar-scrollbar-thumb);
  border-radius: 4px;
}

.file-list-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--sidebar-scrollbar-thumb-hover);
}
```

注意：原 `.file-list` 规则需更新为增加 `display: flex; flex-direction: column; height: 100%;`。

- [ ] **Step 4: 更新 file-list-tree.test.ts 导入**

在 `tests/unit/file-list-tree.test.ts` 的导入语句中追加 `flattenVisibleNodes`：

```ts
import {
  buildFileTree,
  collectDirectoryPaths,
  mergeCollapsedWithNewDirectories,
  flattenVisibleNodes
} from '../../src/renderer/src/components/FileList'
```

- [ ] **Step 5: 在宿主机运行类型检查和测试**

```bash
pnpm build
pnpm test
```

- [ ] **Step 6: 提交**

```bash
git add src/renderer/src/components/FileList.tsx src/renderer/src/sidebar.css tests/unit/file-list-tree.test.ts
git commit -m "perf: Map-based tree building and virtual scrolling for file list"
```

---

## 自检

### 规格覆盖

| 设计文档要求 | 对应 Task |
|-------------|-----------|
| 1.1 新建 extractHeadingsFromSource | Task 3 Step 2 |
| 1.2 删除 extractRenderedHeadings | Task 3 Step 4 |
| 1.3 更新 headings.ts 调用 | Task 3 Step 2 |
| 1.4 源码模式跳过标题提取 | Task 3 Step 5, 6 |
| 2 heading 插件索引循环 | Task 1 Step 3, 4 |
| 3.1 主进程返回 ArrayBuffer | Task 4 Step 1 |
| 3.2 IPC 返回格式变更 | Task 4 Step 2, 3, 4 |
| 3.3 渲染进程 Blob URL | Task 4 Step 5 |
| 3.4 批量收集图片结果 | Task 4 Step 5（Promise.allSettled） |
| 4.1 Map 加速树构建 | Task 5 Step 2（childrenMapCache WeakMap） |
| 4.2 虚拟滚动 | Task 5 Step 2（flattenVisibleNodes + virtual list） |
| 5.1 DocumentState 删除 originalContent | Task 2 Step 1 |
| 5.2 useDocument 用 useRef | Task 2 Step 2 |

无遗漏。

### 占位符扫描

无 TBD、TODO、"implement later"、"add validation"、"similar to" 等占位符。所有步骤包含完整代码。

### 类型一致性

- `extractHeadingsFromSource` 返回 `Heading[]`，与 `extractHeadings` 一致。
- `readWorkspaceAsset` 返回 `{ buffer: ArrayBuffer; mimeType: string }`，IPC handler、preload、env.d.ts 类型声明保持一致。
- `DocumentState` 删除 `originalContent` 后，`useDocument` 内部全部使用 `originalContentRef.current` 替代。
- `useHeadings` 签名 `(content: string, mode: 'preview' | 'source')` 与 `App.tsx` 调用一致。
- `flattenVisibleNodes` 返回 `{ node: FileTreeNode; depth: number }[]`，与虚拟列表渲染逻辑一致。
