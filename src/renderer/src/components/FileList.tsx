import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { WikiFile } from '../types'

export type FileTreeNode = {
  name: string
  relativePath: string
  file?: WikiFile
  children: FileTreeNode[]
}

export function buildFileTree(files: WikiFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = []

  for (const file of files) {
    const parts = file.relativePath.split(/[/\\]/)
    let current = root
    let prefix = ''

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]
      prefix = prefix ? prefix + '/' + dirName : dirName
      let existing = current.find((n) => n.name === dirName)
      if (!existing) {
        existing = { name: dirName, relativePath: prefix, children: [] }
        current.push(existing)
      }
      current = existing.children
    }

    current.push({
      name: file.name,
      relativePath: file.relativePath,
      file,
      children: []
    })
  }

  sortTree(root)
  return root
}

function sortTree(nodes: FileTreeNode[]): void {
  for (const node of nodes) {
    sortTree(node.children)
  }
  nodes.sort((a, b) => {
    const aIsDir = a.children.length > 0
    const bIsDir = b.children.length > 0
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function collectDirectoryPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.children.length > 0) {
      paths.push(node.relativePath)
    }
    paths.push(...collectDirectoryPaths(node.children))
  }
  return paths
}

type FileListProps = {
  files: WikiFile[]
  selectedPath: string | null
  onSelect: (file: WikiFile) => void
}

export default function FileList({ files, selectedPath, onSelect }: FileListProps) {
  const tree = useMemo(() => buildFileTree(files), [files])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const allDirs = collectDirectoryPaths(tree)
    return new Set(allDirs)
  })

  const prevTreeRef = useRef(tree)
  useEffect(() => {
    if (prevTreeRef.current !== tree) {
      const prevDirs = new Set(collectDirectoryPaths(prevTreeRef.current))
      const newAllDirs = collectDirectoryPaths(tree)
      const addedDirs = newAllDirs.filter((d) => !prevDirs.has(d))
      if (addedDirs.length > 0) {
        setCollapsed((prev) => {
          const next = new Set(prev)
          for (const d of addedDirs) next.add(d)
          return next
        })
      }
      prevTreeRef.current = tree
    }
  }, [tree])

  useEffect(() => {
    if (!selectedPath) return
    const parts = selectedPath.replace(/\\/g, '/').split('/')
    const dirsToExpand: string[] = []
    let current = ''
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? current + '/' + parts[i] : parts[i]
      dirsToExpand.push(current)
    }
    if (dirsToExpand.length > 0) {
      setCollapsed((prev) => {
        const hasCollapsed = dirsToExpand.some((d) => prev.has(d))
        if (!hasCollapsed) return prev
        const next = new Set(prev)
        for (const d of dirsToExpand) next.delete(d)
        return next
      })
    }
  }, [selectedPath])

  const expandAll = useCallback(() => {
    setCollapsed(new Set())
  }, [])

  const collapseAll = useCallback(() => {
    const allDirs = collectDirectoryPaths(tree)
    setCollapsed(new Set(allDirs))
  }, [tree])

  const toggleDir = useCallback((dirPath: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(dirPath)) {
        next.delete(dirPath)
      } else {
        next.add(dirPath)
      }
      return next
    })
  }, [])

  return (
    <div className="file-list">
      <div className="file-list-actions">
        <button className="file-list-action-btn" onClick={expandAll} title="全部展开">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>
        <button className="file-list-action-btn" onClick={collapseAll} title="全部折叠">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </button>
      </div>
      {tree.map((node) => (
        <FileTreeNodeComponent
          key={node.name}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          collapsed={collapsed}
          toggleDir={toggleDir}
        />
      ))}
    </div>
  )
}

function FileTreeNodeComponent({
  node,
  depth,
  selectedPath,
  onSelect,
  collapsed,
  toggleDir
}: {
  node: FileTreeNode
  depth: number
  selectedPath: string | null
  onSelect: (file: WikiFile) => void
  collapsed: Set<string>
  toggleDir: (dirPath: string) => void
}) {
  const isDir = node.children.length > 0
  const isSelected = node.relativePath === selectedPath
  const isCollapsed = collapsed.has(node.relativePath)
  const nodeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isSelected && nodeRef.current) {
      nodeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isSelected])

  return (
    <>
      <div
        ref={nodeRef}
        className={`file-node ${isSelected ? 'file-node--selected' : ''}`}
        style={{ '--node-depth': depth } as React.CSSProperties}
        onClick={() => {
          if (isDir) {
            toggleDir(node.relativePath)
          } else if (node.file) {
            onSelect(node.file)
          }
        }}
      >
        <span className={`file-node-toggle${isDir ? (isCollapsed ? '' : ' file-node-toggle--open') : ' file-node-toggle--empty'}`} />
        <span className="file-node-icon">{isDir ? '📁' : '📄'}</span>
        <span className="file-node-name">{node.name}</span>
      </div>
      {isDir && !isCollapsed &&
        node.children.map((child) => (
          <FileTreeNodeComponent
            key={child.name}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            collapsed={collapsed}
            toggleDir={toggleDir}
          />
        ))}
    </>
  )
}
