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
