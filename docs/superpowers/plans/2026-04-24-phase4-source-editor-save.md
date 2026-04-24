# Phase 4: 源码编辑与保存

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 CodeMirror 6 源码编辑模式，支持预览/源码切换、dirty 状态追踪、`Ctrl+S` 保存、以及未保存修改的确认对话框。

**Architecture:** 使用 CodeMirror 6 的 `@codemirror/view`、`@codemirror/state`、`@codemirror/lang-markdown` 等模块构建编辑器。App 组件管理 `mode` 状态切换预览和源码视图。保存功能通过 IPC 写回文件，dirty 状态通过比较编辑内容与原始内容判断。主进程新增 `workspace:saveFile` IPC handler。

**Tech Stack:** @codemirror/view, @codemirror/state, @codemirror/lang-markdown, @codemirror/theme-one-dark

**前置条件:** Phase 3 完成，Markdown 渲染正常。

---

## 文件结构

```
src/
├── main/
│   ├── workspace.ts          # 修改：添加 saveFile
│   └── ipc-handlers.ts       # 修改：添加 save handler
├── preload/
│   └── index.ts              # 修改：暴露 saveFile API
└── renderer/
    └── src/
        ├── components/
        │   └── SourceEditor.tsx  # 新增
        ├── hooks/
        │   └── useDocument.ts   # 新增
        ├── App.tsx              # 修改
        ├── App.css              # 修改
        └── env.d.ts             # 修改
```

---

### Task 1: 安装 CodeMirror 依赖

- [ ] **Step 1: 安装 CodeMirror 包**

```bash
npm install @codemirror/view @codemirror/state @codemirror/lang-markdown @codemirror/language-data @codemirror/theme-one-dark
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add CodeMirror 6 dependencies"
```

---

### Task 2: 主进程添加保存功能

**Files:**
- Modify: `src/main/workspace.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`

- [ ] **Step 1: 在 src/main/workspace.ts 末尾添加 saveMarkdownFile 函数**

```ts
import { writeFile } from 'fs/promises'

export async function saveMarkdownFile(
  rootPath: string,
  relativePath: string,
  content: string
): Promise<void> {
  const fullPath = join(rootPath, relativePath)
  const valid = await validatePath(rootPath, fullPath)
  if (!valid) throw new Error(`路径不合法: ${relativePath}`)
  const ext = extname(relativePath).toLowerCase()
  if (!MD_EXTENSIONS.has(ext)) throw new Error(`不是 Markdown 文件: ${relativePath}`)
  await writeFile(fullPath, content, 'utf-8')
}
```

注意：`join`、`extname`、`MD_EXTENSIONS`、`validatePath` 已在文件中定义。

- [ ] **Step 2: 在 src/main/ipc-handlers.ts 的 registerIpcHandlers 末尾添加**

```ts
  ipcMain.handle('workspace:saveFile', async (_event, rootPath: string, relativePath: string, content: string) => {
    try {
      await saveMarkdownFile(rootPath, relativePath, content)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
```

在文件顶部导入中添加 `saveMarkdownFile`：

```ts
import { openFolderDialog, scanMarkdownFiles, readMarkdownFile, saveMarkdownFile } from './workspace'
```

- [ ] **Step 3: 修改 src/preload/index.ts，添加 saveFile**

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
  }
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 4: 修改 src/renderer/src/env.d.ts，添加 saveFile 类型**

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
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/main/workspace.ts src/main/ipc-handlers.ts src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat(main): add file save IPC handler and preload API"
```

---

### Task 3: 创建 useDocument hook

**Files:**
- Create: `src/renderer/src/hooks/useDocument.ts`

- [ ] **Step 1: 创建 src/renderer/src/hooks/useDocument.ts**

```ts
import { useState, useCallback, useEffect } from 'react'
import type { WikiFile, DocumentState } from '../types'

export function useDocument(workspaceRootPath: string | null) {
  const [doc, setDoc] = useState<DocumentState>({
    file: null,
    content: '',
    originalContent: '',
    mode: 'preview',
    dirty: false
  })

  const loadContent = useCallback(
    async (file: WikiFile) => {
      if (!workspaceRootPath) return
      const result = await window.api.readFile(workspaceRootPath, file.relativePath)
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
    [workspaceRootPath]
  )

  const updateContent = useCallback((newContent: string) => {
    setDoc((prev) => ({
      ...prev,
      content: newContent,
      dirty: newContent !== prev.originalContent
    }))
  }, [])

  const save = useCallback(async () => {
    if (!doc.file || !workspaceRootPath || !doc.dirty) return
    const result = await window.api.saveFile(workspaceRootPath, doc.file.relativePath, doc.content)
    if (result.success) {
      setDoc((prev) => ({ ...prev, originalContent: prev.content, dirty: false }))
    } else {
      throw new Error(result.error)
    }
  }, [doc.file, doc.content, doc.dirty, workspaceRootPath])

  const setMode = useCallback((mode: 'preview' | 'source') => {
    setDoc((prev) => ({ ...prev, mode }))
  }, [])

  const reset = useCallback(() => {
    setDoc({ file: null, content: '', originalContent: '', mode: 'preview', dirty: false })
  }, [])

  const confirmDiscard = useCallback((): boolean => {
    if (!doc.dirty) return true
    return window.confirm('当前文件有未保存的修改，是否放弃修改？')
  }, [doc.dirty])

  return { doc, loadContent, updateContent, save, setMode, reset, confirmDiscard }
}
```

注意：`DocumentState` 类型需要扩展 `originalContent` 字段。修改 `src/renderer/src/types.ts`：

```ts
export type DocumentState = {
  file: WikiFile | null
  content: string
  originalContent: string
  mode: 'preview' | 'source'
  dirty: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/hooks/useDocument.ts src/renderer/src/types.ts
git commit -m "feat(renderer): add useDocument hook with dirty tracking and save"
```

---

### Task 4: 创建 SourceEditor 组件

**Files:**
- Create: `src/renderer/src/components/SourceEditor.tsx`

- [ ] **Step 1: 创建 src/renderer/src/components/SourceEditor.tsx**

```tsx
import { useRef, useEffect } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'

type SourceEditorProps = {
  content: string
  onChange: (value: string) => void
  onSave: () => void
}

export default function SourceEditor({ content, onChange, onSave }: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: 'Mod-s',
            run: () => {
              onSave()
              return true
            }
          }
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': {
            fontFamily: "'SF Mono', 'Consolas', 'Liberation Mono', monospace",
            fontSize: '14px',
            lineHeight: '1.6',
            maxWidth: '860px',
            margin: '0 auto',
            padding: '32px 24px'
          }
        })
      ]
    })

    const view = new EditorView({
      state,
      parent: containerRef.current
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewRef.current && viewRef.current.state.doc.toString() !== content) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: content
        }
      })
    }
  }, [content])

  return <div ref={containerRef} className="source-editor" />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/SourceEditor.tsx
git commit -m "feat(renderer): add CodeMirror SourceEditor component"
```

---

### Task 5: 接入 App 组件

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

- [ ] **Step 1: 修改 src/renderer/src/App.tsx**

```tsx
import { useRef, useCallback } from 'react'
import { useWorkspace } from './hooks/useWorkspace'
import { useDocument } from './hooks/useDocument'
import { useHeadings } from './hooks/useHeadings'
import Sidebar from './components/Sidebar'
import MarkdownView from './components/MarkdownView'
import SourceEditor from './components/SourceEditor'

export default function App() {
  const { workspace, files, openFolder } = useWorkspace()
  const { doc, loadContent, updateContent, save, setMode, confirmDiscard } = useDocument(
    workspace?.rootPath ?? null
  )
  const contentRef = useRef<HTMLDivElement>(null)
  const { headings, activeId, setupObserver, jumpToHeading } = useHeadings(doc.content)

  const handleOpenFile = useCallback(
    async (file: import('./types').WikiFile) => {
      if (!confirmDiscard()) return
      await loadContent(file)
    },
    [confirmDiscard, loadContent]
  )

  const handleSave = useCallback(async () => {
    try {
      await save()
    } catch (err: any) {
      alert(`保存失败: ${err.message}`)
    }
  }, [save])

  const handleToggleMode = useCallback(() => {
    setMode(doc.mode === 'preview' ? 'source' : 'preview')
  }, [doc.mode, setMode])

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
          {doc.file && (
            <>
              <button className="toolbar-btn toolbar-btn--ghost" onClick={handleToggleMode}>
                {doc.mode === 'preview' ? '源码' : '预览'}
              </button>
              <span className="toolbar-status">
                {doc.dirty ? '未保存' : '已保存'}
              </span>
            </>
          )}
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
              onSelectFile={handleOpenFile}
              onJumpHeading={jumpToHeading}
              hasDocument={!!doc.file}
            />
          ) : (
            <div className="sidebar-empty">未打开文件夹</div>
          )}
        </aside>
        <main className="content">
          {doc.file ? (
            doc.mode === 'preview' ? (
              <div ref={contentRefCallback} className="content-inner">
                <MarkdownView source={doc.content} />
              </div>
            ) : (
              <SourceEditor
                content={doc.content}
                onChange={updateContent}
                onSave={handleSave}
              />
            )
          ) : (
            <div className="content-empty">请选择一个 Markdown 文件</div>
          )}
        </main>
      </div>
    </div>
  )
}
```

注意：`useWorkspace` hook 不再管理 `doc` 状态。需要修改 `src/renderer/src/hooks/useWorkspace.ts`，移除 `doc` 相关逻辑，只保留 `workspace` 和 `files`：

```ts
import { useState, useCallback, useEffect } from 'react'
import type { Workspace, WikiFile } from '../types'

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [files, setFiles] = useState<WikiFile[]>([])

  const refreshFiles = useCallback(async (rootPath: string) => {
    const scannedFiles = await window.api.scanFiles(rootPath)
    setFiles(scannedFiles)
  }, [])

  const openFolder = useCallback(async () => {
    const result = await window.api.openFolder()
    if (!result) return

    const ws: Workspace = {
      id: result.rootPath,
      rootPath: result.rootPath,
      name: result.name
    }
    setWorkspace(ws)

    const scannedFiles = await window.api.scanFiles(result.rootPath)
    setFiles(scannedFiles)

    window.api.watchWorkspace(result.rootPath)
  }, [])

  useEffect(() => {
    if (!workspace) return
    const unsubscribe = window.api.onFilesChanged(() => {
      refreshFiles(workspace.rootPath)
    })
    return () => {
      unsubscribe()
      window.api.unwatchWorkspace(workspace.rootPath)
    }
  }, [workspace, refreshFiles])

  return { workspace, files, openFolder }
}
```

- [ ] **Step 2: 在 App.css 末尾追加编辑器样式**

```css
.toolbar-btn--ghost {
  background: none;
  color: var(--text);
  border: 1px solid var(--border);
}

.toolbar-btn--ghost:hover {
  background: rgba(0, 0, 0, 0.04);
}

.source-editor {
  height: 100%;
}

.source-editor .cm-editor {
  height: 100%;
  outline: none;
}
```

- [ ] **Step 3: 启动验证**

```bash
npm run dev
```

验证步骤：
1. 打开文件夹，点击 `.md` 文件显示渲染视图
2. 点击工具栏"源码"按钮切换到源码模式
3. 编辑内容，工具栏显示"未保存"
4. 按 `Ctrl+S`（macOS: `Cmd+S`）保存，状态变为"已保存"
5. 切换到其他文件时，如有未保存修改弹出确认框
6. 点击"预览"按钮切换回渲染视图，内容已更新

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css src/renderer/src/hooks/useWorkspace.ts
git commit -m "feat(renderer): integrate source editor with preview/source mode toggle and save"
```

---

### Task 6: 添加全局 Ctrl+S 快捷键（预览模式）

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: 在 App 组件中添加键盘事件监听**

在 `App` 函数体中，`return` 之前添加：

```tsx
import { useEffect } from 'react'

// 在 App 组件内部添加
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (doc.dirty) {
        handleSave()
      }
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [doc.dirty, handleSave])
```

- [ ] **Step 2: 验证预览模式下 Ctrl+S 也能触发保存**

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat(renderer): add global Ctrl+S save shortcut for preview mode"
```

---

## 自检清单

- [ ] 点击"源码"按钮可切换到 CodeMirror 编辑器
- [ ] 编辑后工具栏显示"未保存"状态
- [ ] `Ctrl+S` 保存成功后状态变为"已保存"
- [ ] 保存失败时保留 dirty 状态并提示错误
- [ ] 切换文件时有未保存修改弹出确认
- [ ] 预览和源码模式可自由切换
- [ ] 编辑器中文本与渲染视图内容同步
