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
  rootPath: string | null
  onRefreshFiles: () => void
  onCurrentFileRenamed?: (newRelativePath: string) => void
  showFileTab?: boolean
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
  documentLoading,
  rootPath,
  onRefreshFiles,
  onCurrentFileRenamed,
  showFileTab = true
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>(showFileTab ? 'files' : 'headings')

  const effectiveTab = showFileTab ? tab : 'headings'

  return (
    <>
      <div className="sidebar-tabs">
        {showFileTab && (
          <button
            className={`sidebar-tab ${effectiveTab === 'files' ? 'sidebar-tab--active' : ''}`}
            onClick={() => setTab('files')}
          >
            文件
          </button>
        )}
        <button
          className={`sidebar-tab ${effectiveTab === 'headings' ? 'sidebar-tab--active' : ''}`}
          onClick={() => setTab('headings')}
          disabled={!hasDocument}
        >
          标题
        </button>
      </div>
      <div className="sidebar-content">
        {effectiveTab === 'files' ? (
          <FileList files={files} selectedPath={selectedPath} onSelect={onSelectFile} rootPath={rootPath} onRefreshFiles={onRefreshFiles} onCurrentFileRenamed={onCurrentFileRenamed} />
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
