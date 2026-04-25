import { useRef, useEffect, useCallback, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { createTerminalTheme, fitAndResizeTerminal } from './terminalLayout'

interface TerminalInstanceProps {
  id: number
  visible: boolean
  active: boolean
  dark: boolean
  workspaceRoot: string | null
  onCreate: (processName: string) => void
  onExit: () => void
}

export default function TerminalInstance({
  id,
  visible,
  active,
  dark,
  workspaceRoot,
  onCreate,
  onExit
}: TerminalInstanceProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [error, setError] = useState<string | null>(null)

  const createdRef = useRef(false)
  const generationRef = useRef(0)
  const darkRef = useRef(dark)
  const terminalCwdRef = useRef<string | null>(null)
  const unsubscribeRef = useRef<(() => void)[]>([])
  const onExitRef = useRef(onExit)
  const onCreateRef = useRef(onCreate)
  darkRef.current = dark
  onExitRef.current = onExit
  onCreateRef.current = onCreate

  const cleanupListeners = useCallback(() => {
    unsubscribeRef.current.forEach((fn) => fn())
    unsubscribeRef.current = []
  }, [])

  const destroyTerminal = useCallback(() => {
    if (!createdRef.current) return
    cleanupListeners()
    xtermRef.current?.dispose()
    xtermRef.current = null
    fitAddonRef.current = null
    terminalCwdRef.current = null
    setError(null)
    createdRef.current = false
  }, [cleanupListeners])

  const syncSize = useCallback(() => {
    fitAndResizeTerminal(fitAddonRef.current, xtermRef.current, (cols, rows) => {
      window.api.terminalResize(id, cols, rows)
    })
  }, [id])

  useEffect(() => {
    if (!createdRef.current || terminalCwdRef.current === workspaceRoot) return
    window.api.terminalKill(id)
    destroyTerminal()
  }, [workspaceRoot, id, destroyTerminal])

  useEffect(() => {
    if (createdRef.current) return

    createdRef.current = true
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
      window.api.terminalWrite(id, data)
    })

    const gen = ++generationRef.current

    const unsubData = window.api.onTerminalData(id, (data) => {
      if (generationRef.current !== gen) return
      xterm.write(data)
    })

    const unsubExit = window.api.onTerminalExit(id, () => {
      if (generationRef.current !== gen) return
      destroyTerminal()
      onExitRef.current()
    })

    const unsubError = window.api.onTerminalError(id, (err) => {
      if (generationRef.current !== gen) return
      setError(err)
    })
    unsubscribeRef.current = [unsubData, unsubExit, unsubError]

    window.api.terminalCreate(id, workspaceRoot).then((result) => {
      if (generationRef.current !== gen) return
      if (result?.error) {
        destroyTerminal()
        setError(result.error)
      } else if (result?.processName) {
        onCreateRef.current(result.processName)
      }
    })
  }, [id, workspaceRoot, destroyTerminal])

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = createTerminalTheme(dark)
    }
  }, [dark])

  useEffect(() => {
    if (!visible || !active || !fitAddonRef.current || !xtermRef.current) {
      return undefined
    }

    const timer = setTimeout(syncSize, 150)
    return () => clearTimeout(timer)
  }, [visible, active, syncSize])

  useEffect(() => {
    if (!visible || !active || !containerRef.current) return

    let frameId: number | null = null
    const observer = new ResizeObserver(() => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        syncSize()
        frameId = null
      })
    })

    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      if (frameId !== null) cancelAnimationFrame(frameId)
    }
  }, [visible, active, syncSize])

  useEffect(() => {
    return () => {
      if (createdRef.current) {
        window.api.terminalKill(id)
        destroyTerminal()
      }
      cleanupListeners()
    }
  }, [id, destroyTerminal, cleanupListeners])

  return (
    <div
      ref={containerRef}
      className="terminal-body"
      style={{ display: active ? undefined : 'none' }}
    >
      {error && <div className="terminal-error">{error}</div>}
    </div>
  )
}
