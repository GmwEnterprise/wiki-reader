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
