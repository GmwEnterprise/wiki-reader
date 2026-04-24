# Phase 7: 多窗口、欢迎页与错误处理

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现多窗口支持（每个窗口打开独立文件夹）、未打开文件夹时的欢迎页、以及完整的错误处理覆盖。

**Architecture:** 主进程支持创建多个 BrowserWindow，每个窗口维护独立的 workspace 和终端状态。欢迎页在没有打开文件夹时显示，提供醒目的"打开文件夹"入口。错误处理覆盖文件读取/保存失败、文件被删除、pty 启动失败等场景。

**Tech Stack:** Electron BrowserWindow 多窗口 API, dialog

**前置条件:** Phase 6 完成。

---

## 文件结构

```
src/
├── main/
│   ├── index.ts              # 修改：多窗口菜单
│   ├── window.ts             # 修改：支持多窗口创建
│   └── ipc-handlers.ts       # 修改：错误处理增强
└── renderer/
    └── src/
        ├── components/
        │   └── WelcomePage.tsx  # 新增
        ├── App.tsx              # 修改：欢迎页、错误提示
        └── App.css              # 修改
```

---

### Task 1: 创建欢迎页组件

**Files:**
- Create: `src/renderer/src/components/WelcomePage.tsx`

- [ ] **Step 1: 创建 src/renderer/src/components/WelcomePage.tsx**

```tsx
type WelcomePageProps = {
  onOpenFolder: () => void
}

export default function WelcomePage({ onOpenFolder }: WelcomePageProps) {
  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1 className="welcome-title">Wiki Reader</h1>
        <p className="welcome-desc">本地 Markdown 阅读器</p>
        <button className="welcome-btn" onClick={onOpenFolder}>
          打开文件夹
        </button>
        <p className="welcome-hint">选择一个包含 Markdown 文件的本地文件夹</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 在 App.css 中添加欢迎页样式**

```css
.welcome {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px;
}

.welcome-inner {
  text-align: center;
  max-width: 360px;
}

.welcome-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
}

.welcome-desc {
  font-size: 15px;
  color: var(--text-secondary);
  margin-bottom: 32px;
}

.welcome-btn {
  display: inline-block;
  padding: 12px 32px;
  font-size: 15px;
  font-weight: 500;
  color: #fff;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.welcome-btn:hover {
  opacity: 0.9;
}

.welcome-hint {
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/WelcomePage.tsx src/renderer/src/App.css
git commit -m "feat(renderer): add WelcomePage component"
```

---

### Task 2: 主进程添加应用菜单

**Files:**
- Modify: `src/main/window.ts`

- [ ] **Step 1: 修改 src/main/window.ts，添加应用菜单**

```ts
import { BrowserWindow, shell, Menu, app } from 'electron'
import { join } from 'path'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Wiki Reader',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  return win
}

export function setupApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ] as Electron.MenuItemConstructorOptions[]
          }
        ]
      : []),
    {
      label: '文件',
      submenu: [
        {
          label: '打开文件夹',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const focusedWin = BrowserWindow.getFocusedWindow()
            if (focusedWin) {
              focusedWin.webContents.send('menu:openFolder')
            }
          }
        },
        { type: 'separator' },
        {
          label: '新建窗口',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            createMainWindow()
          }
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        {
          label: '切换源码/预览',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            const focusedWin = BrowserWindow.getFocusedWindow()
            if (focusedWin) {
              focusedWin.webContents.send('menu:toggleMode')
            }
          }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
```

- [ ] **Step 2: 修改 src/main/index.ts，调用菜单设置**

```ts
import { app, BrowserWindow } from 'electron'
import { createMainWindow, setupApplicationMenu } from './window'
import { registerIpcHandlers } from './ipc-handlers'
import { killAllTerminals } from './terminal'

app.whenReady().then(() => {
  setupApplicationMenu()
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  killAllTerminals()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add src/main/window.ts src/main/index.ts
git commit -m "feat(main): add application menu with multi-window and shortcuts"
```

---

### Task 3: 更新 preload 和渲染进程处理菜单事件

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/env.d.ts`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: 在 preload/index.ts 中添加菜单事件监听**

在 `api` 对象中添加：

```ts
  onMenuOpenFolder: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:openFolder', handler)
    return () => ipcRenderer.removeListener('menu:openFolder', handler)
  },
  onMenuToggleMode: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:toggleMode', handler)
    return () => ipcRenderer.removeListener('menu:toggleMode', handler)
  }
```

- [ ] **Step 2: 在 env.d.ts 中添加类型**

在 `Window.api` 接口中添加：

```ts
      onMenuOpenFolder: (callback: () => void) => () => void
      onMenuToggleMode: (callback: () => void) => () => void
```

- [ ] **Step 3: 在 App.tsx 中监听菜单事件**

在 App 组件中添加两个 `useEffect`：

```tsx
import { useEffect } from 'react'

// 在 App 组件内部
useEffect(() => {
  const unsub = window.api.onMenuOpenFolder(() => {
    openFolder()
  })
  return unsub
}, [openFolder])

useEffect(() => {
  const unsub = window.api.onMenuToggleMode(() => {
    if (doc.file) {
      handleToggleMode()
    }
  })
  return unsub
}, [doc.file, handleToggleMode])
```

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/renderer/src/env.d.ts src/renderer/src/App.tsx
git commit -m "feat: handle menu events for open folder and mode toggle"
```

---

### Task 4: 集成欢迎页和错误处理到 App

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/App.css`

- [ ] **Step 1: 在 App.tsx 中添加欢迎页和错误提示**

添加导入：

```tsx
import WelcomePage from './components/WelcomePage'
```

修改 App 组件的渲染逻辑。当没有 workspace 时显示欢迎页；有 workspace 但无文件选中时显示空状态。添加错误状态：

在 App 组件内添加：

```tsx
const [error, setError] = useState<string | null>(null)
```

修改 `handleOpenFile` 添加错误处理：

```tsx
const handleOpenFile = useCallback(
  async (file: import('./types').WikiFile) => {
    if (!confirmDiscard()) return
    setError(null)
    try {
      await loadContent(file)
    } catch (err: any) {
      setError(`打开文件失败: ${err.message}`)
    }
  },
  [confirmDiscard, loadContent]
)
```

修改主内容区的渲染：

```tsx
<main className="content">
  {error && (
    <div className="content-error">
      <p>{error}</p>
      <button className="toolbar-btn" onClick={() => setError(null)}>
        关闭
      </button>
    </div>
  )}
  {!error && doc.file ? (
    doc.mode === 'preview' ? (
      <div ref={contentRefCallback} className="content-inner">
        <MarkdownView source={doc.content} />
      </div>
    ) : (
      <SourceEditor
        content={doc.content}
        onChange={updateContent}
        onSave={handleSave}
        darkMode={theme === 'dark'}
      />
    )
  ) : !error && !doc.file ? (
    <div className="content-empty">请选择一个 Markdown 文件</div>
  ) : null}
</main>
```

修改整体布局，无 workspace 时显示欢迎页：

```tsx
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
        {workspace && (
          <button
            className="toolbar-btn toolbar-btn--ghost"
            onClick={toggleTerminal}
            title={terminalVisible ? '隐藏终端' : '显示终端'}
          >
            终端
          </button>
        )}
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>
    </header>
    {workspace ? (
      <>
        <div className="body">
          <aside className="sidebar">
            <Sidebar
              files={files}
              selectedPath={doc.file?.relativePath ?? null}
              headings={headings}
              activeHeadingId={activeId}
              onSelectFile={handleOpenFile}
              onJumpHeading={jumpToHeading}
              hasDocument={!!doc.file}
            />
          </aside>
          <main className="content">
            {error && (
              <div className="content-error">
                <p>{error}</p>
                <button className="toolbar-btn" onClick={() => setError(null)}>关闭</button>
              </div>
            )}
            {!error && doc.file ? (
              doc.mode === 'preview' ? (
                <div ref={contentRefCallback} className="content-inner">
                  <MarkdownView source={doc.content} />
                </div>
              ) : (
                <SourceEditor
                  content={doc.content}
                  onChange={updateContent}
                  onSave={handleSave}
                  darkMode={theme === 'dark'}
                />
              )
            ) : !error ? (
              <div className="content-empty">请选择一个 Markdown 文件</div>
            ) : null}
          </main>
        </div>
        <TerminalPanel visible={terminalVisible} workspaceRoot={workspace?.rootPath ?? null} />
      </>
    ) : (
      <WelcomePage onOpenFolder={openFolder} />
    )}
  </div>
)
```

- [ ] **Step 2: 添加错误提示样式**

```css
.content-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  color: #f87171;
  font-size: 14px;
}
```

- [ ] **Step 3: 处理当前文件被外部删除的情况**

在 `useWorkspace` hook 的文件监听回调中，检查当前打开的文件是否还在文件列表中：

修改 `src/renderer/src/hooks/useWorkspace.ts` 的 `refreshFiles`，添加回调参数：

```ts
const refreshFiles = useCallback(async (rootPath: string, onFileRemoved?: (path: string) => void) => {
  const scannedFiles = await window.api.scanFiles(rootPath)
  setFiles(scannedFiles)
  if (onFileRemoved) {
    // 检查是否有文件被移除
  }
}, [])
```

实际上更好的方式是在 App 层面处理。在 App 中添加 `useEffect`，检查当前 doc.file 是否还在 files 列表中：

```tsx
useEffect(() => {
  if (doc.file && workspace) {
    const exists = files.some((f) => f.relativePath === doc.file?.relativePath)
    if (!exists) {
      setError(`文件已被外部删除: ${doc.file.relativePath}`)
      reset()
    }
  }
}, [files, doc.file, workspace, reset])
```

- [ ] **Step 4: 处理 Markdown 渲染失败降级**

修改 `MarkdownView.tsx`，添加错误边界：

```tsx
import { useMemo, useRef, useCallback, useState } from 'react'
import { renderMarkdown } from '../utils/markdown'

type MarkdownViewProps = {
  source: string
}

export default function MarkdownView({ source }: MarkdownViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderError, setRenderError] = useState(false)

  const html = useMemo(() => {
    try {
      const result = renderMarkdown(source)
      setRenderError(false)
      return result
    } catch {
      setRenderError(true)
      return ''
    }
  }, [source])

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

  if (renderError) {
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

添加降级样式：

```css
.markdown-fallback {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'SF Mono', 'Consolas', 'Liberation Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}
```

- [ ] **Step 5: 启动完整验证**

```bash
npm run dev
```

验证清单：
1. 启动时显示欢迎页，有醒目的"打开文件夹"按钮
2. 点击按钮或 `Ctrl+O` 打开文件夹
3. 文件菜单中"新建窗口"可打开第二个窗口
4. 两个窗口分别打开不同文件夹，状态互不影响
5. 读取不存在的文件时显示错误提示
6. 外部删除当前打开的文件后，显示"文件已被外部删除"
7. Markdown 渲染出错时降级显示源码
8. 关闭窗口时各自终端被正确销毁

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/App.css src/renderer/src/components/WelcomePage.tsx src/renderer/src/components/MarkdownView.tsx src/renderer/src/hooks/useWorkspace.ts
git commit -m "feat: add welcome page, error handling, and file deletion detection"
```

---

## 自检清单

- [ ] 未打开文件夹时显示欢迎页
- [ ] 欢迎页"打开文件夹"按钮可正常触发
- [ ] `Ctrl+O` 菜单快捷键可打开文件夹
- [ ] `Ctrl+Shift+N` 可新建窗口
- [ ] 多窗口可分别打开不同文件夹
- [ ] 多窗口状态互不影响
- [ ] 文件读取失败显示错误提示
- [ ] 当前文件被外部删除时提示
- [ ] Markdown 渲染失败降级显示源码
- [ ] 保存失败保留 dirty 状态
- [ ] 关闭窗口时终端 pty 被销毁
