import { useState, useEffect } from 'react'

type RecentItem = {
  path: string
  name: string
  type: 'file' | 'folder'
  lastAccessed: number
}

type WelcomePageProps = {
  onOpenFolder: () => void
  onOpenFile: () => void
  onOpenRecent: (path: string) => void
}

export default function WelcomePage({ onOpenFolder, onOpenFile, onOpenRecent }: WelcomePageProps) {
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])

  useEffect(() => {
    window.api.getRecentFolders().then(setRecentItems)
  }, [])

  const handleRemove = async (path: string): Promise<void> => {
    await window.api.removeRecentFolder(path)
    setRecentItems((prev) => prev.filter((f) => f.path !== path))
  }

  const handleClear = async (): Promise<void> => {
    await window.api.clearRecentFolders()
    setRecentItems([])
  }

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1 className="welcome-title">Wiki Reader</h1>
        <p className="welcome-desc">本地 Markdown 阅读器</p>
        <div className="welcome-actions">
          <button className="welcome-btn" onClick={onOpenFile}>
            打开文件
          </button>
          <button className="welcome-btn" onClick={onOpenFolder}>
            打开文件夹
          </button>
        </div>
        {recentItems.length > 0 && (
          <div className="welcome-recent">
            <div className="welcome-recent-header">
              <span className="welcome-recent-title">最近打开</span>
              <button className="welcome-recent-clear" onClick={handleClear}>
                清除
              </button>
            </div>
            <ul className="welcome-recent-list">
              {recentItems.map((item) => (
                <li key={item.path} className="welcome-recent-item">
                  <button
                    className="welcome-recent-item-btn"
                    onClick={() => onOpenRecent(item.path)}
                  >
                    <span className="welcome-recent-item-icon">
                      {item.type === 'folder' ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3l1.5 1.5h6.5a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M4 1.5h5.5L13 5v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                          <path d="M9 1.5V5.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="welcome-recent-item-text">
                      <span className="welcome-recent-item-name">{item.name}</span>
                      <span className="welcome-recent-item-path">{item.path}</span>
                    </span>
                  </button>
                  <button
                    className="welcome-recent-item-remove"
                    title="移除"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemove(item.path)
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
