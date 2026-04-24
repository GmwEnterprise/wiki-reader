# Phase 2: 工作区与文件浏览

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现打开本地文件夹、扫描 Markdown 文件、在侧栏展示文件树、点击文件在右侧显示内容的完整工作流。

**Architecture:** 主进程新增 `workspace` 模块负责文件系统操作（打开对话框、扫描目录、读取文件），通过 IPC 暴露给渲染进程。渲染进程通过 `useWorkspace` hook 管理工作区状态，`FileList` 组件展示文件树。preload 脚本充当 IPC 桥梁。

**Tech Stack:** chokidar（文件监听），Electron dialog/IPC

**前置条件:** Phase 1 完成，项目能启动并显示基础布局。

---

## 文件结构

本阶段新增/修改的文件：

```
src/
├── main/
│   ├── index.ts          # 修改：注册 IPC handlers
│   ├── window.ts         # 修改：无
│   ├── workspace.ts      # 新增：文件系统操作
│   └── ipc-handlers.ts   # 新增：IPC 注册
├── preload/
│   └── index.ts          # 修改：暴露 workspace API
└── renderer/
    └── src/
        ├── App.tsx        # 修改：接入 workspace 状态
        ├── App.css        # 修改：添加文件列表样式
        ├── env.d.ts       # 修改：更新 window.api 类型
        ├── hooks/
        │   └── useWorkspace.ts  # 新增
        └── components/
            └── FileList.tsx     # 新增
```

---

### Task 1: 创建主进程 workspace 模块

**Files:**
- Create: `src/main/workspace.ts`

- [ ] **Step 1: 创建 src/main/workspace.ts**

```ts
import { dialog } from 'electron'
import { readdir, stat, readFile } from 'fs/promises'
import { join, extname, basename, relative } from 'path'
import type { WikiFile } from '../renderer/src/types'

const IGNORED_DIRS = new Set(['node_modules', '.git', '.DS_Store', 'Thumbs.db'])
const MD_EXTENSIONS = new Set(['.md', '.markdown'])

export async function openFolderDialog(): Promise<{ rootPath: string; name: string } | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const rootPath = result.filePaths[0]
  return { rootPath, name: basename(rootPath) }
}

export async function scanMarkdownFiles(rootPath: string): Promise<WikiFile[]> {
  const files: WikiFile[] = []
  await walkDir(rootPath, rootPath, files)
  return files
}

async function walkDir(rootPath: string, currentPath: string, files: WikiFile[]): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true })
  const dirs: string[] = []
  const mdFiles: WikiFile[] = []

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue

    const fullPath = join(currentPath, entry.name)

    if (entry.isDirectory()) {
      dirs.push(fullPath)
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase()
      if (MD_EXTENSIONS.has(ext)) {
        const s = await stat(fullPath)
        mdFiles.push({
          relativePath: relative(rootPath, fullPath),
          name: entry.name,
          mtimeMs: s.mtimeMs,
          size: s.size
        })
      }
    }
  }

  mdFiles.sort((a, b) => a.name.localeCompare(b.name))
  files.push(...mdFiles)

  dirs.sort((a, b) => basename(a).localeCompare(basename(b)))
  for (const dir of dirs) {
    await walkDir(rootPath, dir, files)
  }
}

export async function readMarkdownFile(rootPath: string, relativePath: string): Promise<string> {
  const fullPath = join(rootPath, relativePath)
  const resolved = await validatePath(rootPath, fullPath)
  if (!resolved) throw new Error(`路径不合法: ${relativePath}`)
  return readFile(fullPath, 'utf-8')
}

export async function validatePath(rootPath: string, targetPath: string): Promise<boolean> {
  const { normalize } = await import('path')
  const normalizedTarget = normalize(targetPath)
  const normalizedRoot = normalize(rootPath)
  return normalizedTarget.startsWith(normalizedRoot + '/') || normalizedTarget === normalizedRoot
}
```

- [ ] **Step 2: 写路径校验的单元测试**

创建 `tests/unit/path-validation.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { validatePath } from '../../src/main/workspace'

describe('validatePath', () => {
  it('允许 workspace 内的文件路径', async () => {
    const result = await validatePath('/home/user/wiki', '/home/user/wiki/notes/test.md')
    expect(result).toBe(true)
  })

  it('拒绝 workspace 外的文件路径', async () => {
    const result = await validatePath('/home/user/wiki', '/etc/passwd')
    expect(result).toBe(false)
  })

  it('拒绝包含 .. 的路径逃逸', async () => {
    const result = await validatePath('/home/user/wiki', '/home/user/wiki/../../../etc/passwd')
    expect(result).toBe(false)
  })

  it('根路径本身是合法的', async () => {
    const result = await validatePath('/home/user/wiki', '/home/user/wiki')
    expect(result).toBe(true)
  })
})
```

- [ ] **Step 3: 运行测试**

```bash
npx vitest run tests/unit/path-validation.test.ts
```

Expected: 4 个测试全部通过

- [ ] **Step 4: Commit**

```bash
mkdir -p tests/unit
git add src/main/workspace.ts tests/unit/path-validation.test.ts
git commit -m "feat(main): add workspace module with folder scanning and path validation"
```

---

### Task 2: 创建 IPC handlers 并注册

**Files:**
- Create: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 创建 src/main/ipc-handlers.ts**

```ts
import { ipcMain, BrowserWindow } from 'electron'
import { openFolderDialog, scanMarkdownFiles, readMarkdownFile } from './workspace'

export function registerIpcHandlers(): void {
  ipcMain.handle('workspace:openFolder', async () => {
    return openFolderDialog()
  })

  ipcMain.handle('workspace:scanFiles', async (_event, rootPath: string) => {
    return scanMarkdownFiles(rootPath)
  })

  ipcMain.handle('workspace:readFile', async (_event, rootPath: string, relativePath: string) => {
    try {
      const content = await readMarkdownFile(rootPath, relativePath)
      return { success: true, content }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
```

- [ ] **Step 2: 修改 src/main/index.ts，注册 IPC handlers**

在 `app.whenReady().then(...)` 回调中，`createMainWindow()` 之前添加 `registerIpcHandlers()`：

```ts
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { registerIpcHandlers } from './ipc-handlers'

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat(main): add IPC handlers for workspace operations"
```

---

### Task 3: 更新 preload 脚本暴露 workspace API

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`

- [ ] **Step 1: 修改 src/preload/index.ts**

```ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
  scanFiles: (rootPath: string) => ipcRenderer.invoke('workspace:scanFiles', rootPath),
  readFile: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('workspace:readFile', rootPath, relativePath)
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 2: 修改 src/renderer/src/env.d.ts**

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
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/renderer/src/env.d.ts
git commit -m "feat(preload): expose workspace API to renderer"
```

---

### Task 4: 创建 useWorkspace hook

**Files:**
- Create: `src/renderer/src/hooks/useWorkspace.ts`

- [ ] **Step 1: 创建 hooks 目录和 useWorkspace.ts**

```ts
import { useState, useCallback } from 'react'
import type { Workspace, WikiFile, DocumentState } from '../types'

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [files, setFiles] = useState<WikiFile[]>([])
  const [doc, setDoc] = useState<DocumentState>({
    file: null,
    content: '',
    mode: 'preview',
    dirty: false
  })

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
    setDoc({ file: null, content: '', mode: 'preview', dirty: false })
  }, [])

  const openFile = useCallback(
    async (file: WikiFile) => {
      if (!workspace) return
      if (doc.dirty && doc.file) {
        const confirmed = window.confirm('当前文件有未保存的修改，是否放弃？')
        if (!confirmed) return
      }

      const result = await window.api.readFile(workspace.rootPath, file.relativePath)
      if (result.success && result.content !== undefined) {
        setDoc({ file, content: result.content, mode: 'preview', dirty: false })
      } else {
        setDoc({ file, content: `读取失败: ${result.error}`, mode: 'preview', dirty: false })
      }
    },
    [workspace, doc]
  )

  return { workspace, files, doc, setDoc, openFolder, openFile }
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/renderer/src/hooks
git add src/renderer/src/hooks/useWorkspace.ts
git commit -m "feat(renderer): add useWorkspace hook for workspace state management"
```

---

### Task 5: 创建 FileList 组件

**Files:**
- Create: `src/renderer/src/components/FileList.tsx`

- [ ] **Step 1: 创建 components 目录和 FileList.tsx**

```tsx
import type { WikiFile } from '../types'

type FileTreeNode = {
  name: string
  relativePath?: string
  file?: WikiFile
  children: FileTreeNode[]
}

function buildFileTree(files: WikiFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = []

  for (const file of files) {
    const parts = file.relativePath.split(/[/\\]/)
    let current = root

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]
      let existing = current.find((n) => n.name === dirName)
      if (!existing) {
        existing = { name: dirName, children: [] }
        current.push(existing)
      }
      current = existing.children
    }

    current.push({
      name: file.name,
      relativePath: file.relativePath,
      file,
      children: []
    })
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

type FileListProps = {
  files: WikiFile[]
  selectedPath: string | null
  onSelect: (file: WikiFile) => void
}

export default function FileList({ files, selectedPath, onSelect }: FileListProps) {
  const tree = buildFileTree(files)

  return (
    <div className="file-list">
      {tree.map((node) => (
        <FileTreeNodeComponent
          key={node.name}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function FileTreeNodeComponent({
  node,
  depth,
  selectedPath,
  onSelect
}: {
  node: FileTreeNode
  depth: number
  selectedPath: string | null
  onSelect: (file: WikiFile) => void
}) {
  const isDir = node.children.length > 0
  const isSelected = node.relativePath === selectedPath

  return (
    <>
      <div
        className={`file-node ${isSelected ? 'file-node--selected' : ''}`}
        style={{ paddingLeft: depth * 16 + 12 }}
        onClick={() => {
          if (node.file) onSelect(node.file)
        }}
      >
        <span className="file-node-icon">{isDir ? '📂' : '📄'}</span>
        <span className="file-node-name">{node.name}</span>
      </div>
      {isDir &&
        node.children.map((child) => (
          <FileTreeNodeComponent
            key={child.name}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
mkdir -p src/renderer/src/components
git add src/renderer/src/components/FileList.tsx
git commit -m "feat(renderer): add FileList component with tree rendering"
```

---

### Task 6: 接入 App 组件

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

- [ ] **Step 1: 修改 src/renderer/src/App.tsx**

```tsx
import { useWorkspace } from './hooks/useWorkspace'
import FileList from './components/FileList'

export default function App() {
  const { workspace, files, doc, openFolder, openFile } = useWorkspace()

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
            <FileList
              files={files}
              selectedPath={doc.file?.relativePath ?? null}
              onSelect={openFile}
            />
          ) : (
            <div className="sidebar-empty">未打开文件夹</div>
          )}
        </aside>
        <main className="content">
          {doc.file ? (
            <div className="content-text">
              <pre>{doc.content}</pre>
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

- [ ] **Step 2: 在 App.css 末尾追加文件列表样式**

```css
.toolbar-btn {
  padding: 4px 12px;
  font-size: 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.toolbar-btn:hover {
  opacity: 0.9;
}

.file-list {
  padding: 8px 0;
}

.file-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
  user-select: none;
}

.file-node:hover {
  background: rgba(0, 0, 0, 0.04);
}

.file-node--selected {
  background: rgba(74, 144, 217, 0.1);
}

.file-node-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.file-node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-text {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 24px;
}

.content-text pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'SF Mono', 'Consolas', 'Liberation Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
}
```

- [ ] **Step 3: 启动验证**

```bash
npm run dev
```

验证步骤：
1. 点击"打开文件夹"按钮
2. 选择一个包含 `.md` 文件的目录
3. 侧栏显示文件树
4. 点击 `.md` 文件，右侧显示文件原始内容（纯文本）
5. 点击不同文件可切换显示

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css
git commit -m "feat(renderer): integrate workspace hook and file list into App layout"
```

---

### Task 7: 添加文件监听（chokidar）

**Files:**
- Modify: `src/main/workspace.ts`
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Modify: `src/renderer/src/hooks/useWorkspace.ts`

- [ ] **Step 1: 安装 chokidar**

```bash
npm install chokidar
```

- [ ] **Step 2: 在 src/main/workspace.ts 末尾添加 watchWorkspace 函数**

```ts
import type { FSWatcher } from 'chokidar'

const watchers = new Map<string, FSWatcher>()

export function watchWorkspace(
  rootPath: string,
  onChange: () => void
): void {
  const chokidar = require('chokidar')
  const watcher = chokidar.watch('**/*.md', {
    cwd: rootPath,
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.*'
    ],
    ignoreInitial: true
  })

  watcher.on('add', onChange)
  watcher.on('unlink', onChange)
  watcher.on('change', onChange)

  watchers.set(rootPath, watcher)
}

export function unwatchWorkspace(rootPath: string): void {
  const watcher = watchers.get(rootPath)
  if (watcher) {
    watcher.close()
    watchers.delete(rootPath)
  }
}
```

同时在 `workspace.ts` 顶部导入中补充 `FSWatcher` 类型：不需要额外导入，`chokidar` 的 `FSWatcher` 通过 require 引入。

- [ ] **Step 3: 修改 src/main/ipc-handlers.ts，添加 watch 相关 handler**

在 `registerIpcHandlers` 函数末尾添加：

```ts
  ipcMain.handle('workspace:watch', (event, rootPath: string) => {
    watchWorkspace(rootPath, () => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        win.webContents.send('workspace:filesChanged')
      }
    })
  })

  ipcMain.handle('workspace:unwatch', (_event, rootPath: string) => {
    unwatchWorkspace(rootPath)
  })
```

需要在文件顶部导入中添加 `BrowserWindow`：

```ts
import { ipcMain, BrowserWindow } from 'electron'
```

- [ ] **Step 4: 修改 src/preload/index.ts，添加 watch API**

```ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
  scanFiles: (rootPath: string) => ipcRenderer.invoke('workspace:scanFiles', rootPath),
  readFile: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('workspace:readFile', rootPath, relativePath),
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

- [ ] **Step 5: 修改 src/renderer/src/env.d.ts，更新类型**

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
      watchWorkspace: (rootPath: string) => Promise<void>
      unwatchWorkspace: (rootPath: string) => Promise<void>
      onFilesChanged: (callback: () => void) => () => void
    }
  }
}
```

- [ ] **Step 6: 修改 src/renderer/src/hooks/useWorkspace.ts，添加文件监听**

```ts
import { useState, useCallback, useEffect } from 'react'
import type { Workspace, WikiFile, DocumentState } from '../types'

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [files, setFiles] = useState<WikiFile[]>([])
  const [doc, setDoc] = useState<DocumentState>({
    file: null,
    content: '',
    mode: 'preview',
    dirty: false
  })

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
    setDoc({ file: null, content: '', mode: 'preview', dirty: false })

    window.api.watchWorkspace(result.rootPath)
  }, [])

  const openFile = useCallback(
    async (file: WikiFile) => {
      if (!workspace) return
      if (doc.dirty && doc.file) {
        const confirmed = window.confirm('当前文件有未保存的修改，是否放弃？')
        if (!confirmed) return
      }

      const result = await window.api.readFile(workspace.rootPath, file.relativePath)
      if (result.success && result.content !== undefined) {
        setDoc({ file, content: result.content, mode: 'preview', dirty: false })
      } else {
        setDoc({ file, content: `读取失败: ${result.error}`, mode: 'preview', dirty: false })
      }
    },
    [workspace, doc]
  )

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

  return { workspace, files, doc, setDoc, openFolder, openFile }
}
```

- [ ] **Step 7: 启动验证**

```bash
npm run dev
```

验证步骤：
1. 打开一个包含 `.md` 文件的目录
2. 在外部编辑器中在该目录下新建一个 `.md` 文件
3. 侧栏文件列表自动刷新显示新文件

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add chokidar file watching for workspace auto-refresh"
```

---

## 自检清单

- [ ] 点击"打开文件夹"能弹出系统文件夹选择对话框
- [ ] 选择文件夹后侧栏展示 `.md` 文件树（按目录分组、排序）
- [ ] 点击 `.md` 文件右侧显示文件内容（纯文本）
- [ ] 外部新增/删除 `.md` 文件后侧栏自动刷新
- [ ] 路径校验单元测试通过
- [ ] 路径逃逸（`../`）被正确拒绝
