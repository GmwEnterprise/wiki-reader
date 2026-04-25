import { useRef, useState, useCallback, type CSSProperties } from 'react'
import { calculateTerminalPanelHeight } from './terminalLayout'
import TerminalTabs from './TerminalTabs'
import TerminalInstance from './TerminalInstance'
import type { UseTerminalTabsReturn } from '../hooks/useTerminalTabs'

interface TerminalPanelProps {
  terminal: UseTerminalTabsReturn
  dark: boolean
  workspaceRoot: string | null
}

export default function TerminalPanel({
  terminal,
  dark,
  workspaceRoot
}: TerminalPanelProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = useState(250)
  const [resizing, setResizing] = useState(false)

  const { visible, tabs, activeTabId, openNewTab, removeTab, setActive, updateTitle } = terminal

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
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
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    []
  )

  const panelStyle = visible
    ? ({ '--terminal-panel-height': `${panelHeight}px` } as CSSProperties)
    : undefined
  const panelClassName = `terminal-panel ${visible ? 'terminal-panel--visible' : ''} ${resizing ? 'terminal-panel--resizing' : ''}`

  return (
    <>
      {visible && tabs.length > 0 && (
        <div className="terminal-resize-handle" onMouseDown={handleResizeMouseDown} />
      )}
      <div ref={panelRef} className={panelClassName} style={panelStyle}>
        <div className="terminal-header">
          <TerminalTabs
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={setActive}
            onTabClose={removeTab}
            onAddClick={openNewTab}
          />
        </div>
        {tabs.map((tab) => (
          <TerminalInstance
            key={tab.id}
            id={tab.id}
            visible={visible}
            active={tab.id === activeTabId}
            dark={dark}
            workspaceRoot={workspaceRoot}
            onCreate={(processName) => updateTitle(tab.id, processName)}
            onExit={() => removeTab(tab.id)}
          />
        ))}
      </div>
    </>
  )
}
