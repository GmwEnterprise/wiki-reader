import { useState } from 'react'
import FileList from './FileList'
import HeadingList from './HeadingList'
import type { WikiFile, Heading } from '../types'

type SidebarTab = 'files' | 'headings'

type SidebarProps = {
  files: WikiFile[]
  selectedPath: string | null
  headings: Heading[]
  activeHeadingId: string | null
  onSelectFile: (file: WikiFile) => void
  onJumpHeading: (id: string) => void
  hasDocument: boolean
  documentPath: string | null
  documentLoading: boolean
}

export default function Sidebar({
  files,
  selectedPath,
  headings,
  activeHeadingId,
  onSelectFile,
  onJumpHeading,
  hasDocument,
  documentPath,
  documentLoading
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('files')

  return (
    <>
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${tab === 'files' ? 'sidebar-tab--active' : ''}`}
          onClick={() => setTab('files')}
        >
          文件
        </button>
        <button
          className={`sidebar-tab ${tab === 'headings' ? 'sidebar-tab--active' : ''}`}
          onClick={() => setTab('headings')}
          disabled={!hasDocument}
        >
          标题
        </button>
      </div>
      <div className="sidebar-content">
        {tab === 'files' ? (
          <FileList files={files} selectedPath={selectedPath} onSelect={onSelectFile} />
        ) : (
          <HeadingList
            key={documentPath ?? 'empty'}
            headings={headings}
            activeId={activeHeadingId}
            onJump={onJumpHeading}
            loading={documentLoading}
          />
        )}
      </div>
    </>
  )
}
