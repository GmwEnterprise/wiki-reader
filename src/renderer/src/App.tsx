import { useState, useCallback, useRef, useEffect } from 'react'
import { useWorkspace } from './hooks/useWorkspace'
import { useDocument } from './hooks/useDocument'
import { useHeadings } from './hooks/useHeadings'
import { useTheme } from './hooks/useTheme'
import { useTerminalTabs } from './hooks/useTerminalTabs'
import Sidebar from './components/Sidebar'
import MarkdownView from './components/MarkdownView'
import SourceEditor from './components/SourceEditor'
import TerminalPanel from './components/TerminalPanel'
import WelcomePage from './components/WelcomePage'

function App(): React.JSX.Element {
  const { workspace, files, openFolder } = useWorkspace()
  const { theme, toggleTheme } = useTheme()
  const { doc, loadContent, updateContent, flushSave, setMode, reset } = useDocument(
    workspace?.rootPath ?? null
  )
  const { headings, activeId, setupObserver, jumpToHeading } = useHeadings(doc.content)
  const terminal = useTerminalTabs()
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar-width')
    return saved ? Math.min(window.innerWidth / 2, Math.max(200, Number(saved))) : 240
  })
  const [isMaximized, setIsMaximized] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isResizing = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollPositionRef = useRef<number>(0)
  const contentBodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return window.api.windowControls.onMaximizedChanged(setIsMaximized)
  }, [])

  const handleOpenFolder = useCallback(async () => {
    setIsMenuOpen(false)
    await flushSave()
    reset()
    await openFolder()
  }, [openFolder, reset, flushSave])

  useEffect(() => {
    const unsub = window.api.onMenuOpenFolder(() => {
      handleOpenFolder()
    })
    return unsub
  }, [handleOpenFolder])

  useEffect(() => {
    const unsub = window.api.onMenuToggleMode(() => {
      if (doc.file && contentBodyRef.current) {
        scrollPositionRef.current = contentBodyRef.current.scrollTop
      }
      if (doc.file) {
        setMode(doc.mode === 'preview' ? 'source' : 'preview')
      }
    })
    return unsub
  }, [doc.file, doc.mode, setMode])

  useEffect(() => {
    if (doc.file && workspace) {
      const exists = files.some((f) => f.relativePath === doc.file?.relativePath)
      if (!exists) {
        setError(`文件已被外部删除: ${doc.file.relativePath}`)
        reset()
      }
    }
  }, [files, doc.file, workspace, reset])

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setIsMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isMenuOpen])

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

  useEffect(() => {
    const unsubscribe = window.api.onBeforeClose(async () => {
      try {
        await Promise.race([
          flushSave(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('save timeout')), 2000)
          )
        ])
      } catch {
        // 超时或出错，跳过保存
      }
      window.api.confirmClose()
    })
    return unsubscribe
  }, [flushSave])

  const handleOpenFile = useCallback(
    async (file: import('./types').WikiFile) => {
      setError(null)
      await loadContent(file)
    },
    [loadContent]
  )

  useEffect(() => {
    if (doc.mode === 'preview' && doc.file && contentRef.current) {
      setupObserver(contentRef.current)
    }
  }, [doc.mode, doc.file, setupObserver])

  useEffect(() => {
    if (doc.mode === 'preview' && doc.file && contentBodyRef.current) {
      contentBodyRef.current.scrollTop = scrollPositionRef.current
    }
  }, [doc.mode, doc.file])

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizing.current = true
      const startX = e.clientX
      const startWidth = sidebarWidth

      const onMouseMove = (e: MouseEvent): void => {
        if (!isResizing.current) return
        const newWidth = Math.min(
          window.innerWidth / 2,
          Math.max(200, startWidth + e.clientX - startX)
        )
        setSidebarWidth(newWidth)
      }

      const onMouseUp = (): void => {
        isResizing.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        setSidebarWidth((w) => {
          localStorage.setItem('sidebar-width', String(w))
          return w
        })
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [sidebarWidth]
  )

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <div className="toolbar-menu" ref={menuRef}>
            <button
              className="toolbar-menu-button"
              type="button"
              aria-label="打开主菜单"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((value) => !value)}
            >
              ☰
            </button>
            {isMenuOpen && (
              <div className="toolbar-menu-panel" role="menu">
                <button className="toolbar-menu-item" type="button" role="menuitem" onClick={handleOpenFolder}>
                  打开文件夹...
                </button>
                <button className="toolbar-menu-item" type="button" role="menuitem" onClick={() => { window.api.newWindow(); setIsMenuOpen(false) }}>
                  新建窗口
                </button>
                <button className="toolbar-menu-item" type="button" role="menuitem" onClick={() => { toggleTheme(); setIsMenuOpen(false) }}>
                  {theme === 'light' ? '切换暗色主题 🌙' : '切换亮色主题 ☀️'}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-title">{workspace?.name ?? '笔记'}</div>
        <div className="window-controls">
          <button
            className="window-control-button"
            type="button"
            aria-label="最小化窗口"
            onClick={() => window.api.windowControls.minimize()}
          >
            <span className="window-control-minimize" />
          </button>
          <button
            className="window-control-button"
            type="button"
            aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
            onClick={() => window.api.windowControls.toggleMaximize()}
          >
            <span className={isMaximized ? 'window-control-restore' : 'window-control-maximize'} />
          </button>
          <button
            className="window-control-button window-control-close"
            type="button"
            aria-label="关闭窗口"
            onClick={() => window.api.windowControls.close()}
          >
            <span className="window-control-close-icon" />
          </button>
        </div>
      </header>
      {workspace ? (
        <>
          <div className="body">
            <aside className="sidebar" style={{ width: sidebarWidth }}>
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
            <div className="resize-handle" onMouseDown={handleResizeMouseDown} />
            <main className="content" onContextMenu={handleContextMenu}>
              <div ref={contentBodyRef} className="content-body">
                {error && (
                  <div className="content-error">
                    <p>{error}</p>
                    <button className="content-error-close" onClick={() => setError(null)}>
                      关闭
                    </button>
                  </div>
                )}
                {!error && doc.file ? (
                  doc.loading ? (
                    <div className="content-loading">加载中...</div>
                  ) : doc.mode === 'preview' ? (
                    <div ref={contentRef} className="content-inner">
                      <MarkdownView
                        source={doc.content}
                        currentFilePath={doc.file?.relativePath ?? null}
                        workspaceRootPath={workspace?.rootPath ?? null}
                        files={files}
                        onOpenFile={handleOpenFile}
                      />
                    </div>
                  ) : (
                    <SourceEditor
                      content={doc.content}
                      onChange={updateContent}
                      onSave={flushSave}
                      onEscape={() => {
                        if (contentBodyRef.current) {
                          scrollPositionRef.current = contentBodyRef.current.scrollTop
                        }
                        setMode('preview')
                      }}
                      darkMode={theme === 'dark'}
                    />
                  )
                ) : !error ? (
                  <div className="content-empty">请选择一个 Markdown 文件</div>
                ) : null}
              </div>
            </main>
          </div>
          <TerminalPanel
            terminal={terminal}
            dark={theme === 'dark'}
            workspaceRoot={workspace?.rootPath ?? null}
          />
          <footer className="statusbar">
            <div className="statusbar-left" />
            <div className="statusbar-right">
              <button
                className={`statusbar-btn ${terminal.visible ? 'statusbar-btn--active' : ''}`}
                type="button"
                onClick={terminal.toggle}
                title={terminal.visible ? '隐藏终端' : '显示终端'}
              >
                ⌨ 终端
              </button>
            </div>
          </footer>
        </>
      ) : (
        <WelcomePage onOpenFolder={handleOpenFolder} />
      )}
    </div>
  )
}

export default App
