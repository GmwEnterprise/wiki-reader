import { useState, useCallback, useRef, useEffect } from 'react'
import { useWorkspace } from './hooks/useWorkspace'
import { useHeadings } from './hooks/useHeadings'
import Sidebar from './components/Sidebar'
import MarkdownView from './components/MarkdownView'

function App(): React.JSX.Element {
  const { workspace, files, doc, openFolder, openFile } = useWorkspace()
  const { headings, activeId, setupObserver, jumpToHeading } = useHeadings(doc.content)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [isMaximized, setIsMaximized] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isResizing = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return window.api.windowControls.onMaximizedChanged(setIsMaximized)
  }, [])

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      setIsMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isMenuOpen])

  const handleOpenFolder = useCallback(async () => {
    setIsMenuOpen(false)
    await openFolder()
  }, [openFolder])

  const contentRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      contentRef.current = el
      if (doc.file) {
        setupObserver(el)
      }
    },
    [doc.file, setupObserver]
  )

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizing.current = true
      const startX = e.clientX
      const startWidth = sidebarWidth

      const onMouseMove = (e: MouseEvent): void => {
        if (!isResizing.current) return
        const newWidth = Math.min(window.innerWidth / 2, Math.max(200, startWidth + e.clientX - startX))
        setSidebarWidth(newWidth)
      }

      const onMouseUp = (): void => {
        isResizing.current = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
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
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-title">{workspace?.name ?? '笔记'}</div>
        <div className="toolbar-right">
          <span className="toolbar-status">
            {doc.file ? (doc.dirty ? '未保存' : '已保存') : ''}
          </span>
        </div>
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
      <div className="body">
        <aside className="sidebar" style={{ width: sidebarWidth }}>
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
        <div className="resize-handle" onMouseDown={handleResizeMouseDown} />
        <main className="content">
          {doc.file ? (
            <div ref={contentRefCallback} className="content-inner">
              <MarkdownView
                source={doc.content}
                currentFilePath={doc.file?.relativePath ?? null}
                workspaceRootPath={workspace?.rootPath ?? null}
                files={files}
                onOpenFile={openFile}
              />
            </div>
          ) : (
            <div className="content-empty">请选择一个 Markdown 文件</div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
