import { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import type { WikiFile } from '../types'

export type FileTreeNode = {
  name: string
  relativePath: string
  file?: WikiFile
  children: FileTreeNode[]
}

const childrenMapCache = new WeakMap<FileTreeNode, Map<string, FileTreeNode>>()

function getOrCreateChildrenMap(node: FileTreeNode): Map<string, FileTreeNode> {
  let map = childrenMapCache.get(node)
  if (map) return map
  map = new Map()
  for (const child of node.children) {
    map.set(child.name, child)
  }
  childrenMapCache.set(node, map)
  return map
}

export function buildFileTree(files: WikiFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = []
  const rootMap = new Map<string, FileTreeNode>()

  for (const file of files) {
    const parts = file.relativePath.split(/[/\\]/)
    let currentList = root
    let currentMap = rootMap
    let prefix = ''

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]
      prefix = prefix ? prefix + '/' + dirName : dirName
      let existing = currentMap.get(dirName)
      if (!existing) {
        existing = { name: dirName, relativePath: prefix, children: [] }
        currentMap.set(dirName, existing)
        currentList.push(existing)
        const childMap = new Map<string, FileTreeNode>()
        childrenMapCache.set(existing, childMap)
        currentMap = childMap
      } else {
        currentMap = getOrCreateChildrenMap(existing)
      }
      currentList = existing.children
    }

    const leafNode: FileTreeNode = {
      name: file.name,
      relativePath: file.relativePath,
      file,
      children: []
    }
    currentList.push(leafNode)
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

export function flattenVisibleNodes(
  nodes: FileTreeNode[],
  collapsed: Set<string>
): { node: FileTreeNode; depth: number }[] {
  const result: { node: FileTreeNode; depth: number }[] = []
  const stack: { node: FileTreeNode; depth: number }[] = []
  for (let i = nodes.length - 1; i >= 0; i--) {
    stack.push({ node: nodes[i], depth: 0 })
  }
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!
    result.push({ node, depth })
    if (node.children.length > 0 && !collapsed.has(node.relativePath)) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i], depth: depth + 1 })
      }
    }
  }
  return result
}

export function mergeCollapsedWithNewDirectories(
  collapsed: Set<string>,
  previousTree: FileTreeNode[],
  nextTree: FileTreeNode[]
): Set<string> {
  const previousDirs = new Set(collectDirectoryPaths(previousTree))
  const addedDirs = collectDirectoryPaths(nextTree).filter((d) => !previousDirs.has(d))
  if (addedDirs.length === 0) return collapsed

  const next = new Set(collapsed)
  for (const d of addedDirs) next.add(d)
  return next
}

const ROW_HEIGHT = 28
const BUFFER_ROWS = 5

type ContextMenuState = {
  x: number
  y: number
  node: FileTreeNode
}

type RenameState = {
  node: FileTreeNode
  initialName: string
  ext: string
}

type DeleteState = {
  node: FileTreeNode
}

type FileListProps = {
  files: WikiFile[]
  selectedPath: string | null
  onSelect: (file: WikiFile) => void
  rootPath: string | null
  onRefreshFiles: () => void
  onCurrentFileRenamed?: (newRelativePath: string) => void
}

export default function FileList({ files, selectedPath, onSelect, rootPath, onRefreshFiles, onCurrentFileRenamed }: FileListProps) {
  const tree = useMemo(() => buildFileTree(files), [files])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const allDirs = collectDirectoryPaths(tree)
    return new Set(allDirs)
  })
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renameState, setRenameState] = useState<RenameState | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [renameError, setRenameError] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const prevTreeRef = useRef(tree)
  useLayoutEffect(() => {
    if (prevTreeRef.current !== tree) {
      setCollapsed((prev) => mergeCollapsedWithNewDirectories(prev, prevTreeRef.current, tree))
      prevTreeRef.current = tree
    }
  }, [tree])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    setContainerHeight(el.clientHeight)
    const observer = new ResizeObserver(() => {
      setContainerHeight(el.clientHeight)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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

  const visibleNodes = useMemo(
    () => flattenVisibleNodes(tree, collapsed),
    [tree, collapsed]
  )

  const totalHeight = visibleNodes.length * ROW_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS)
  const endIndex = Math.min(
    visibleNodes.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + BUFFER_ROWS
  )

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      setScrollTop(scrollContainerRef.current.scrollTop)
      setContainerHeight(scrollContainerRef.current.clientHeight)
    }
  }, [])

  useEffect(() => {
    if (!selectedPath) return
    const idx = visibleNodes.findIndex((n) => n.node.relativePath === selectedPath)
    if (idx === -1) return
    const top = idx * ROW_HEIGHT
    const currentScroll = scrollContainerRef.current?.scrollTop ?? 0
    const height = scrollContainerRef.current?.clientHeight ?? 0
    if (top < currentScroll || top + ROW_HEIGHT > currentScroll + height) {
      scrollContainerRef.current?.scrollTo({ top: top - height / 3, behavior: 'smooth' })
    }
  }, [selectedPath, visibleNodes])

  useEffect(() => {
    if (!contextMenu) return
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.file-context-menu')) return
      setContextMenu(null)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  useEffect(() => {
    if (renameState) {
      const input = renameInputRef.current
      if (input) {
        input.focus()
        input.select()
      }
    }
  }, [renameState])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FileTreeNode) => {
      if (!rootPath) return
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, node })
    },
    [rootPath]
  )

  const handleRenameClick = useCallback(() => {
    if (!contextMenu) return
    const node = contextMenu.node
    const isDir = node.children.length > 0
    const lastDot = node.name.lastIndexOf('.')
    const ext = !isDir && lastDot > 0 ? node.name.slice(lastDot) : ''
    const baseName = !isDir && lastDot > 0 ? node.name.slice(0, lastDot) : node.name
    setRenameState({ node, initialName: node.name, ext })
    setRenameInput(baseName)
    setRenameError('')
    setContextMenu(null)
  }, [contextMenu])

  const handleDeleteClick = useCallback(() => {
    if (!contextMenu) return
    setDeleteState({ node: contextMenu.node })
    setContextMenu(null)
  }, [contextMenu])

  const handleRenameConfirm = useCallback(async () => {
    if (!renameState || !rootPath || renameBusy) return
    const newName =
      renameState.ext && !renameInput.endsWith(renameState.ext)
        ? renameInput + renameState.ext
        : renameInput
    if (!newName.trim()) {
      setRenameError('文件名不能为空')
      return
    }
    if (newName === renameState.initialName) {
      setRenameState(null)
      return
    }
    setRenameBusy(true)
    setRenameError('')
    const result = await window.api.renameItem(
      rootPath,
      renameState.node.relativePath,
      newName
    )
    setRenameBusy(false)
    if (result.success) {
      setRenameState(null)
      if (onCurrentFileRenamed && result.newRelativePath) {
        const nodePath = renameState.node.relativePath
        if (selectedPath === nodePath) {
          onCurrentFileRenamed(result.newRelativePath)
        } else if (selectedPath && selectedPath.startsWith(nodePath + '/')) {
          const suffix = selectedPath.slice(nodePath.length)
          onCurrentFileRenamed(result.newRelativePath + suffix)
        }
      }
      onRefreshFiles()
    } else {
      setRenameError(result.error ?? '重命名失败')
    }
  }, [renameState, rootPath, renameInput, renameBusy, onRefreshFiles, onCurrentFileRenamed, selectedPath])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleRenameConfirm()
      } else if (e.key === 'Escape') {
        setRenameState(null)
      }
    },
    [handleRenameConfirm]
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteState || !rootPath || deleteBusy) return
    setDeleteBusy(true)
    const result = await window.api.deleteItem(rootPath, deleteState.node.relativePath)
    setDeleteBusy(false)
    if (result.success) {
      setDeleteState(null)
      onRefreshFiles()
    }
  }, [deleteState, rootPath, deleteBusy, onRefreshFiles])

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
      <div
        ref={scrollContainerRef}
        className="file-list-scroll"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleNodes.slice(startIndex, endIndex).map((item, i) => {
            const { node, depth } = item
            const isDir = node.children.length > 0
            const isSelected = node.relativePath === selectedPath
            const isCollapsed = collapsed.has(node.relativePath)
            return (
              <div
                key={node.relativePath}
                className={`file-node ${isSelected ? 'file-node--selected' : ''}`}
                style={{
                  position: 'absolute',
                  top: (startIndex + i) * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  '--node-depth': depth
                } as React.CSSProperties}
                onClick={() => {
                  if (isDir) {
                    toggleDir(node.relativePath)
                  } else if (node.file) {
                    onSelect(node.file)
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, node)}
              >
                <span className={`file-node-toggle${isDir ? (isCollapsed ? '' : ' file-node-toggle--open') : ' file-node-toggle--empty'}`} />
                <span className="file-node-icon">{isDir ? '📁' : '📄'}</span>
                <span className="file-node-name">{node.name}</span>
              </div>
            )
          })}
        </div>
      </div>
      {contextMenu && (
        <div
          className="file-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="file-context-menu-item" type="button" onClick={handleRenameClick}>
            重命名
          </button>
          <button className="file-context-menu-item" type="button" onClick={handleDeleteClick}>
            删除
          </button>
        </div>
      )}
      {renameState && (
        <div className="dialog-overlay" onClick={() => { if (!renameBusy) setRenameState(null) }}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">重命名</div>
            <input
              ref={renameInputRef}
              className="dialog-input"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              disabled={renameBusy}
              spellCheck={false}
            />
            {renameState.ext && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                保留扩展名: {renameState.ext}
              </div>
            )}
            <div className="dialog-error">{renameError}</div>
            <div className="dialog-actions">
              <button
                className="dialog-btn"
                type="button"
                onClick={() => setRenameState(null)}
                disabled={renameBusy}
              >
                取消
              </button>
              <button
                className="dialog-btn dialog-btn--primary"
                type="button"
                onClick={handleRenameConfirm}
                disabled={renameBusy || !renameInput.trim()}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteState && (
        <div className="dialog-overlay" onClick={() => { if (!deleteBusy) setDeleteState(null) }}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">确认删除</div>
            <div className="dialog-body">
              确定要删除「{deleteState.node.name}」吗？此操作不可撤销。
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn"
                type="button"
                onClick={() => setDeleteState(null)}
                disabled={deleteBusy}
              >
                取消
              </button>
              <button
                className="dialog-btn dialog-btn--danger"
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteBusy}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
