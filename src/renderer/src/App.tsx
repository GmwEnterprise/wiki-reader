import { useState } from 'react'
import type { DocumentState } from './types'

function App(): React.JSX.Element {
  const [doc] = useState<DocumentState>({
    file: null,
    content: '',
    mode: 'preview',
    dirty: false
  })

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-left">
          <span className="toolbar-title">Wiki Reader</span>
        </div>
        <div className="toolbar-right">
          <span className="toolbar-status">
            {doc.file ? (doc.dirty ? '未保存' : '已保存') : ''}
          </span>
        </div>
      </header>
      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-empty">未打开文件夹</div>
        </aside>
        <main className="content">
          <div className="content-empty">请打开一个文件夹开始阅读</div>
        </main>
      </div>
    </div>
  )
}

export default App
