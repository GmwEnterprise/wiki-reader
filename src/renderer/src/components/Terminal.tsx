import { useRef, useEffect, useCallback, useState, type CSSProperties } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { calculateTerminalPanelHeight, createTerminalTheme, fitAndResizeTerminal } from './terminalLayout'

type TerminalProps = {
  visible: boolean
  dark: boolean
  workspaceRoot: string | null
  onClose?: () => void
}

const TERMINAL_ID = 1

export { TERMINAL_ID }

export default function TerminalPanel({
  visible,
  dark,
  workspaceRoot,
  onClose
}: TerminalProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const [panelHeight, setPanelHeight] = useState(250)
  const [resizing, setResizing] = useState(false)

  const createdRef = useRef(false)
  const darkRef = useRef(dark)
  const terminalCwdRef = useRef<string | null>(null)
  const unsubscribeRef = useRef<(() => void)[]>([])
  const onCloseRef = useRef(onClose)
  darkRef.current = dark
  onCloseRef.current = onClose

  const cleanupTerminalListeners = useCallback(() => {
    unsubscribeRef.current.forEach((unsubscribe) => unsubscribe())
    unsubscribeRef.current = []
  }, [])

  const destroyTerminal = useCallback(() => {
    if (!createdRef.current) return
    cleanupTerminalListeners()
    xtermRef.current?.dispose()
    xtermRef.current = null
    fitAddonRef.current = null
    terminalCwdRef.current = null
    setError(null)
    createdRef.current = false
    setCreated(false)
  }, [cleanupTerminalListeners])

  const syncTerminalSize = useCallback(() => {
    fitAndResizeTerminal(fitAddonRef.current, xtermRef.current, (cols, rows) => {
      window.api.terminalResize(TERMINAL_ID, cols, rows)
    })
  }, [])

  useEffect(() => {
    if (!createdRef.current || terminalCwdRef.current === workspaceRoot) return
    window.api.terminalKill(TERMINAL_ID)
    destroyTerminal()
  }, [workspaceRoot, destroyTerminal])

  useEffect(() => {
    if (!visible || createdRef.current) return

    createdRef.current = true
    setCreated(true)
    terminalCwdRef.current = workspaceRoot

    const xterm = new XTerm({
      theme: createTerminalTheme(darkRef.current),
      fontSize: 15,
      fontFamily: "'Maple Mono NF CN', 'SF Mono', 'Consolas', 'Liberation Mono', monospace",
      cursorBlink: true
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)

    const container = containerRef.current
    if (container) {
      xterm.open(container)
    }

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    xterm.onData((data) => {
      window.api.terminalWrite(TERMINAL_ID, data)
    })

    const unsubData = window.api.onTerminalData(TERMINAL_ID, (data) => {
      xterm.write(data)
    })

    const unsubExit = window.api.onTerminalExit(TERMINAL_ID, () => {
      destroyTerminal()
      onCloseRef.current?.()
    })

    const unsubError = window.api.onTerminalError(TERMINAL_ID, (err) => {
      setError(err)
    })
    unsubscribeRef.current = [unsubData, unsubExit, unsubError]

    window.api.terminalCreate(TERMINAL_ID, workspaceRoot).then((result) => {
      if (result?.error) {
        destroyTerminal()
        setError(result.error)
      }
    })
  }, [visible, workspaceRoot, destroyTerminal])

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = createTerminalTheme(dark)
    }
  }, [dark])

  useEffect(() => {
    if (visible && fitAddonRef.current && xtermRef.current) {
      const timer = setTimeout(() => {
        syncTerminalSize()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [visible, syncTerminalSize])

  useEffect(() => {
    if (!visible || !containerRef.current) return

    let frameId: number | null = null
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      frameId = requestAnimationFrame(() => {
        syncTerminalSize()
        frameId = null
      })
    })

    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
    }
  }, [visible, syncTerminalSize])

  useEffect(() => {
    return () => {
      if (createdRef.current) {
        window.api.terminalKill(TERMINAL_ID)
        destroyTerminal()
      }
      cleanupTerminalListeners()
    }
  }, [destroyTerminal, cleanupTerminalListeners])

  const handleClose = useCallback(() => {
    window.api.terminalKill(TERMINAL_ID)
    destroyTerminal()
    onCloseRef.current?.()
  }, [destroyTerminal])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const panel = panelRef.current
    if (!panel) return
    setResizing(true)
    const startHeight = panel.getBoundingClientRect().height

    const onMouseMove = (moveEvent: MouseEvent): void => {
      setPanelHeight(calculateTerminalPanelHeight(startHeight, startY, moveEvent.clientY))
    }

    const onMouseUp = (): void => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      setResizing(false)
      requestAnimationFrame(syncTerminalSize)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [syncTerminalSize])

  const panelStyle = visible
    ? ({ '--terminal-panel-height': `${panelHeight}px` } as CSSProperties)
    : undefined
  const panelClassName = `terminal-panel ${visible ? 'terminal-panel--visible' : ''} ${resizing ? 'terminal-panel--resizing' : ''}`

  return (
    <>
      {visible && created && (
        <div className="terminal-resize-handle" onMouseDown={handleResizeMouseDown} />
      )}
      <div
        ref={panelRef}
        className={panelClassName}
        style={panelStyle}
      >
        <div className="terminal-header">
          <span className="terminal-title">终端</span>
          <button className="terminal-close" type="button" onClick={handleClose}>
            ✕
          </button>
        </div>
        <div className="terminal-body" ref={containerRef}>
          {error && <div className="terminal-error">{error}</div>}
        </div>
      </div>
    </>
  )
}
