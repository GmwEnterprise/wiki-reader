import type { TerminalTab } from '../hooks/useTerminalTabs'

interface TerminalTabsProps {
  tabs: TerminalTab[]
  activeTabId: number | null
  onTabClick: (id: number) => void
  onTabClose: (id: number) => void
  onAddClick: () => void
}

export default function TerminalTabs({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onAddClick
}: TerminalTabsProps): React.JSX.Element | null {
  if (tabs.length === 0) return null

  return (
    <div className="terminal-tabs">
      <div className="terminal-tabs-list">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab ${tab.id === activeTabId ? 'terminal-tab--active' : ''}`}
          >
            <button
              className="terminal-tab-main"
              type="button"
              onClick={() => onTabClick(tab.id)}
            >
              <span className="terminal-tab-title">{tab.title}</span>
            </button>
            <button
              className="terminal-tab-close"
              type="button"
              onClick={() => onTabClose(tab.id)}
              title="关闭终端"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="terminal-tabs-add" type="button" onClick={onAddClick} title="新建终端">
        +
      </button>
    </div>
  )
}
