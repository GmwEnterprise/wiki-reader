# 任务栏增强 + 最近文件夹 + 应用名称 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Wiki Reader 添加 Windows 任务栏多窗口预览区分、右键任务栏/Dock 最近文件夹快速访问，并统一应用名称元数据。

**Architecture:** 新建 `recent-folders.ts` 主进程模块管理最近文件夹列表（JSON 文件持久化 + `app.addRecentDocument` 系统同步）。通过 IPC 暴露给渲染进程，在 WelcomePage 展示最近列表。添加单实例锁以支持 Jump List 点击后在已有实例中打开文件夹。`workspace:openFolder` 完成后同步更新窗口标题和最近列表。

**Tech Stack:** Electron `app.setJumpList()` / `app.addRecentDocument()` / `app.requestSingleInstanceLock()`, Node.js `fs/promises`, React hooks

**Spec:** `docs/superpowers/specs/2026-04-25-taskbar-recent-folders-design.md`

---

### Task 1: 新建最近文件夹管理模块

**Files:**
- Create: `src/main/recent-folders.ts`

- [ ] **Step 1: 创建 `src/main/recent-folders.ts`**

```typescript
import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { basename } from 'path'

export type RecentFolder = {
  path: string
  name: string
  lastAccessed: number
}

const MAX_RECENT = 15
const STORAGE_FILE = join(app.getPath('userData'), 'recent-folders.json')

function readFromDisk(): RecentFolder[] {
  if (!existsSync(STORAGE_FILE)) return []
  try {
    const data = require('fs').readFileSync(STORAGE_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function writeToDisk(folders: RecentFolder[]): void {
  try {
    require('fs').writeFileSync(STORAGE_FILE, JSON.stringify(folders, null, 2), 'utf-8')
  } catch {
    // 写入失败不阻塞主流程
  }
}

export function addRecentFolder(folderPath: string, folderName: string): void {
  let folders = readFromDisk()
  folders = folders.filter((f) => f.path !== folderPath)
  folders.unshift({
    path: folderPath,
    name: folderName,
    lastAccessed: Date.now()
  })
  if (folders.length > MAX_RECENT) {
    folders = folders.slice(0, MAX_RECENT)
  }
  writeToDisk(folders)
  app.addRecentDocument(folderPath)
  refreshJumpList()
}

export function getRecentFolders(): RecentFolder[] {
  return readFromDisk()
}

export function removeRecentFolder(folderPath: string): void {
  let folders = readFromDisk()
  folders = folders.filter((f) => f.path !== folderPath)
  writeToDisk(folders)
  refreshJumpList()
}

export function clearRecentFolders(): void {
  writeToDisk([])
  app.clearRecentDocuments()
  refreshJumpList()
}

export function refreshJumpList(): void {
  if (process.platform !== 'win32') return

  const folders = getRecentFolders().slice(0, 10)

  app.setJumpList([
    {
      name: '最近打开',
      items: folders.map((f) => ({
        type: 'task' as const,
        program: process.execPath,
        args: `--open "${f.path}"`,
        title: f.name,
        description: f.path
      }))
    }
  ])
}
```

- [ ] **Step 2: 提交**

```bash
git add src/main/recent-folders.ts
git commit -m "feat: add recent-folders module with Jump List support"
```

---

### Task 2: 添加单实例锁 + second-instance 处理

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: 修改 `src/main/index.ts`，添加单实例锁和 second-instance 处理**

将整个文件替换为：

```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { registerIpcHandlers } from './ipc-handlers'
import { killAllTerminals } from './terminal'
import { refreshJumpList } from './recent-folders'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const openPath = parseOpenArg(argv)
    const win = getLastWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      if (openPath) {
        win.webContents.send('workspace:open-path', openPath)
      }
    } else {
      const newWin = createMainWindow(openPath)
      if (openPath) {
        newWin.setTitle(basename(openPath) + ' - Wiki Reader')
      }
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.wiki-reader.app')

    app.on('browser-window-created', (_, window) => {
      window.on('maximize', () => {
        window.webContents.send('window:maximized-changed', true)
      })
      window.on('unmaximize', () => {
        window.webContents.send('window:maximized-changed', false)
      })
    })

    registerIpcHandlers()
    refreshJumpList()
    createMainWindow()
  })
}

function parseOpenArg(argv: string[]): string | null {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--open') {
      let path = argv[i + 1]
      // Jump List args 可能带引号
      if (path.startsWith('"') && path.endsWith('"')) {
        path = path.slice(1, -1)
      }
      return path
    }
  }
  return null
}

function getLastWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[windows.length - 1] : null
}

ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return

  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
})

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.on('window:confirm-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.destroy()
})

ipcMain.on('window:new-window', () => {
  createMainWindow()
})

app.on('window-all-closed', () => {
  killAllTerminals()
  app.quit()
})
```

注意：需要在文件顶部导入 `basename` from `path`。上面已经使用了 `import { basename } from 'path'` 没有列出，实际应加上：

文件顶部 import 补充：
```typescript
import { basename } from 'path'
```

- [ ] **Step 2: 提交**

```bash
git add src/main/index.ts
git commit -m "feat: add single-instance lock and second-instance handler"
```

---

### Task 3: 修改 createMainWindow 支持初始路径

**Files:**
- Modify: `src/main/window.ts`

- [ ] **Step 1: 修改 `createMainWindow` 函数签名和标题逻辑**

在 `src/main/window.ts` 中：

1. 修改函数签名：
```typescript
export function createMainWindow(initialPath?: string): BrowserWindow {
```

2. 修改 `title` 设置（替换原来的 `title: 'Wiki Reader'`）：
```typescript
    title: initialPath ? `${basename(initialPath)} - Wiki Reader` : 'Wiki Reader',
```

3. 添加 `basename` 导入（在文件顶部）：
```typescript
import { join, basename } from 'path'
```

- [ ] **Step 2: 提交**

```bash
git add src/main/window.ts
git commit -m "feat: support initialPath param in createMainWindow"
```

---

### Task 4: 修改 IPC handlers — 更新标题、添加最近文件夹 IPC

**Files:**
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: 修改 `src/main/ipc-handlers.ts`**

完整替换文件为：

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { basename } from 'path'
import {
  openFolderDialog,
  scanMarkdownFiles,
  readMarkdownFile,
  readWorkspaceAsset,
  readAbsoluteImageFile,
  saveMarkdownFile,
  watchWorkspace,
  unwatchWorkspace
} from './workspace'
import { createTerminal, terminalWrite, terminalResize, terminalKill } from './terminal'
import {
  addRecentFolder,
  getRecentFolders,
  removeRecentFolder,
  clearRecentFolders
} from './recent-folders'

export function registerIpcHandlers(): void {
  ipcMain.handle('workspace:openFolder', async (event) => {
    const result = await openFolderDialog()
    if (result) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        win.setTitle(result.name + ' - Wiki Reader')
      }
      addRecentFolder(result.rootPath, result.name)
    }
    return result
  })

  ipcMain.handle('workspace:openPath', async (event, folderPath: string) => {
    if (typeof folderPath !== 'string' || !folderPath) return null
    const name = basename(folderPath)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.setTitle(name + ' - Wiki Reader')
    }
    addRecentFolder(folderPath, name)
    return { rootPath: folderPath, name }
  })

  ipcMain.handle('recent:getList', async () => {
    return getRecentFolders()
  })

  ipcMain.handle('recent:remove', async (_event, folderPath: string) => {
    if (typeof folderPath !== 'string') return
    removeRecentFolder(folderPath)
  })

  ipcMain.handle('recent:clear', async () => {
    clearRecentFolders()
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

  ipcMain.handle('workspace:saveFile', async (_event, rootPath: string, relativePath: string, content: string) => {
    try {
      await saveMarkdownFile(rootPath, relativePath, content)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('workspace:readAsset', async (_event, rootPath: string, relativePath: string) => {
    try {
      const dataUrl = await readWorkspaceAsset(rootPath, relativePath)
      return { success: true, dataUrl }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('workspace:readAbsoluteAsset', async (_event, absolutePath: string) => {
    try {
      const dataUrl = await readAbsoluteImageFile(absolutePath)
      return { success: true, dataUrl }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

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

  ipcMain.handle('terminal:create', (event, id: number, cwd: string | null) => {
    if (typeof id !== 'number' || (cwd !== null && typeof cwd !== 'string')) return null
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { error: '窗口不存在' }
    return createTerminal(win, cwd, id)
  })

  ipcMain.handle('terminal:write', (_event, id: number, data: string) => {
    if (typeof id !== 'number' || typeof data !== 'string') return false
    return terminalWrite(id, data)
  })

  ipcMain.on('terminal:resize', (_event, id: number, cols: number, rows: number) => {
    if (typeof id !== 'number' || typeof cols !== 'number' || typeof rows !== 'number') return
    if (cols <= 0 || rows <= 0) return
    terminalResize(id, cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, id: number) => {
    if (typeof id !== 'number') return
    terminalKill(id)
  })
}
```

- [ ] **Step 2: 提交**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: add recent folders IPC and window title update on open"
```

---

### Task 5: 更新 preload 脚本

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 在 `src/preload/index.ts` 的 `api` 对象中添加最近文件夹相关 API**

在 `newWindow` 属性之后、`terminalCreate` 属性之前，插入：

```typescript
  openPath: (folderPath: string) => ipcRenderer.invoke('workspace:openPath', folderPath),
  getRecentFolders: () => ipcRenderer.invoke('recent:getList'),
  removeRecentFolder: (folderPath: string) => ipcRenderer.invoke('recent:remove', folderPath),
  clearRecentFolders: () => ipcRenderer.invoke('recent:clear'),
  onOpenPath: (callback: (path: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string): void => {
      callback(path)
    }
    ipcRenderer.on('workspace:open-path', handler)
    return () => ipcRenderer.removeListener('workspace:open-path', handler)
  },
```

- [ ] **Step 2: 提交**

```bash
git add src/preload/index.ts
git commit -m "feat: expose recent folders and open-path APIs in preload"
```

---

### Task 6: 更新 useWorkspace hook 支持直接打开路径

**Files:**
- Modify: `src/renderer/src/hooks/useWorkspace.ts`

- [ ] **Step 1: 在 `src/renderer/src/hooks/useWorkspace.ts` 中添加 `openRecentFolder` 方法**

完整替换文件：

```typescript
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

  const openRecentFolder = useCallback(async (folderPath: string) => {
    const result = await window.api.openPath(folderPath)
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

  return { workspace, files, openFolder, openRecentFolder }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/hooks/useWorkspace.ts
git commit -m "feat: add openRecentFolder to useWorkspace hook"
```

---

### Task 7: 更新 WelcomePage 展示最近文件夹

**Files:**
- Modify: `src/renderer/src/components/WelcomePage.tsx`
- Modify: `src/renderer/src/App.css`（welcome 区域样式扩展）

- [ ] **Step 1: 替换 `src/renderer/src/components/WelcomePage.tsx`**

```typescript
import { useState, useEffect } from 'react'

type RecentFolder = {
  path: string
  name: string
  lastAccessed: number
}

type WelcomePageProps = {
  onOpenFolder: () => void
  onOpenRecent: (path: string) => void
}

export default function WelcomePage({ onOpenFolder, onOpenRecent }: WelcomePageProps) {
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([])

  useEffect(() => {
    window.api.getRecentFolders().then(setRecentFolders)
  }, [])

  const handleRemove = async (path: string): Promise<void> => {
    await window.api.removeRecentFolder(path)
    setRecentFolders((prev) => prev.filter((f) => f.path !== path))
  }

  const handleClear = async (): Promise<void> => {
    await window.api.clearRecentFolders()
    setRecentFolders([])
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1 className="welcome-title">Wiki Reader</h1>
        <p className="welcome-desc">本地 Markdown 阅读器</p>
        <button className="welcome-btn" onClick={onOpenFolder}>
          打开文件夹
        </button>
        <p className="welcome-hint">选择一个包含 Markdown 文件的本地文件夹</p>
        {recentFolders.length > 0 && (
          <div className="welcome-recent">
            <div className="welcome-recent-header">
              <span className="welcome-recent-title">最近打开</span>
              <button className="welcome-recent-clear" onClick={handleClear}>
                清除
              </button>
            </div>
            <ul className="welcome-recent-list">
              {recentFolders.map((folder) => (
                <li key={folder.path} className="welcome-recent-item">
                  <button
                    className="welcome-recent-item-btn"
                    onClick={() => onOpenRecent(folder.path)}
                  >
                    <span className="welcome-recent-item-name">{folder.name}</span>
                    <span className="welcome-recent-item-path">{folder.path}</span>
                  </button>
                  <button
                    className="welcome-recent-item-remove"
                    title="移除"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemove(folder.path)
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 在 `src/renderer/src/App.css` 的 `.welcome-hint` 规则后追加最近文件夹样式**

在 `.welcome-hint { ... }` 块之后（约第 663 行后），追加：

```css
.welcome-recent {
  margin-top: 28px;
  text-align: left;
}

.welcome-recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.welcome-recent-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.welcome-recent-clear {
  font-size: 12px;
  color: var(--text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.welcome-recent-clear:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.welcome-recent-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.welcome-recent-item {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0;
}

.welcome-recent-item-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  text-align: left;
  min-width: 0;
}

.welcome-recent-item-btn:hover {
  background: var(--bg-hover);
}

.welcome-recent-item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.welcome-recent-item-path {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.welcome-recent-item-remove {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.welcome-recent-item:hover .welcome-recent-item-remove {
  opacity: 1;
}

.welcome-recent-item-remove:hover {
  color: var(--text);
  background: var(--bg-hover);
}
```

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/components/WelcomePage.tsx src/renderer/src/App.css
git commit -m "feat: show recent folders list on WelcomePage"
```

---

### Task 8: 更新 App.tsx 集成最近文件夹和 open-path 事件

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: 修改 `src/renderer/src/App.tsx`**

需要做以下变更：

1. 从 `useWorkspace` 解构新增的 `openRecentFolder`：

```typescript
const { workspace, files, openFolder, openRecentFolder } = useWorkspace()
```

2. 添加 `openRecentFolder` 的包装回调（含保存和重置）：

在 `handleOpenFolder` 回调之后添加：

```typescript
const handleOpenRecent = useCallback(async (path: string) => {
  await flushSave()
  reset()
  await openRecentFolder(path)
}, [openRecentFolder, reset, flushSave])
```

3. 添加 `workspace:open-path` 事件监听（处理 second-instance 发来的 Jump List 打开请求）：

在 `onMenuOpenFolder` 的 useEffect 之后添加：

```typescript
useEffect(() => {
  const unsub = window.api.onOpenPath((path: string) => {
    handleOpenRecent(path)
  })
  return unsub
}, [handleOpenRecent])
```

4. 修改 `WelcomePage` 调用，传入 `onOpenRecent`：

```tsx
<WelcomePage onOpenFolder={handleOpenFolder} onOpenRecent={handleOpenRecent} />
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: integrate recent folders and open-path event in App"
```

---

### Task 9: 更新 package.json 元数据

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 修改 `package.json` 中的 `description`、`author`，移除 `homepage`**

将：
```json
"description": "An Electron application with React and TypeScript",
"main": "./out/main/index.js",
"author": "example.com",
"homepage": "https://electron-vite.org",
```

改为：
```json
"description": "本地 Markdown Wiki 阅读器",
"main": "./out/main/index.js",
"author": "wiki-reader",
```

（删除 `homepage` 行）

- [ ] **Step 2: 提交**

```bash
git add package.json
git commit -m "chore: update package.json metadata for Wiki Reader"
```

---

### Task 10: 类型声明更新

**Files:**
- Modify: `src/preload/index.ts`（已含在 Task 5 中）
- Check: `src/renderer/src/env.d.ts`

- [ ] **Step 1: 检查并更新 `src/renderer/src/env.d.ts`**

需要确保 `window.api` 的类型声明包含新增的方法。在类型声明文件中为 `api` 对象添加：

```typescript
openPath: (folderPath: string) => Promise<{ rootPath: string; name: string } | null>
getRecentFolders: () => Promise<Array<{ path: string; name: string; lastAccessed: number }>>
removeRecentFolder: (folderPath: string) => Promise<void>
clearRecentFolders: () => Promise<void>
onOpenPath: (callback: (path: string) => void) => () => void
```

- [ ] **Step 2: 提交**

```bash
git add src/renderer/src/env.d.ts
git commit -m "feat: add type declarations for recent folders APIs"
```

---

## 自检结果

**Spec 覆盖**：
- 窗口标题动态更新 → Task 3 + Task 4
- 最近文件夹管理模块 → Task 1
- 单实例锁 + second-instance → Task 2
- Jump List → Task 1 (refreshJumpList) + Task 2 (启动时调用)
- IPC 通道扩展 → Task 4
- Preload API → Task 5
- WelcomePage 最近列表 → Task 7
- App.tsx 集成 → Task 8
- 应用名称 → Task 9
- 类型声明 → Task 10

**占位符扫描**：无 TBD/TODO。

**类型一致性**：
- `RecentFolder` 类型在 `recent-folders.ts` 定义，`WelcomePage.tsx` 和 `env.d.ts` 中重复定义（因为渲染进程不直接导入主进程类型，通过 IPC 传递 JSON）
- `workspace:openPath` IPC 返回 `{ rootPath, name }` 与 `openFolderDialog` 返回格式一致
- `workspace:open-path` 事件名在 `index.ts`（发送）和 `preload`（接收）中一致
