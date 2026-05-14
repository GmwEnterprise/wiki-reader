import { useState, useCallback, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import type { WikiFile } from '../types'

export type FileTreeNode = {
  name: string
  relativePath: string
  isDirectory: boolean
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

    if (file.isDirectory) {
      for (const dirName of parts) {
        prefix = prefix ? prefix + '/' + dirName : dirName
        let existing = currentMap.get(dirName)
        if (!existing) {
          existing = { name: dirName, relativePath: prefix, isDirectory: true, children: [] }
          currentMap.set(dirName, existing)
          currentList.push(existing)
          childrenMapCache.set(existing, new Map())
        }
        currentList = existing.children
        currentMap = getOrCreateChildrenMap(existing)
      }
      continue
    }

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i]
      prefix = prefix ? prefix + '/' + dirName : dirName
      let existing = currentMap.get(dirName)
      if (!existing) {
        existing = { name: dirName, relativePath: prefix, isDirectory: true, children: [] }
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
      isDirectory: false,
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
    const aIsDir = a.isDirectory
    const bIsDir = b.isDirectory
    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function collectDirectoryPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.isDirectory) {
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
  node: FileTreeNode | null
}

type RenameState = {
  node: FileTreeNode
  initialName: string
  ext: string
}

type DeleteState = {
  node: FileTreeNode
}

type CreateState = {
  parentRelativePath: string
  type: 'file' | 'folder'
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
  const [createState, setCreateState] = useState<CreateState | null>(null)
  const [createInput, setCreateInput] = useState('')
  const [createError, setCreateError] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
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
    if (renameState || createState) {
      const input = renameInputRef.current
      if (input) {
        input.focus()
        input.select()
      }
    }
  }, [renameState, createState])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FileTreeNode) => {
      if (!rootPath) return
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY, node })
    },
    [rootPath]
  )

  const handleBlankContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!rootPath) return
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, node: null })
    },
    [rootPath]
  )

  const handleCreateClick = useCallback((type: 'file' | 'folder') => {
    if (!contextMenu) return
    const parentRelativePath = contextMenu.node?.isDirectory ? contextMenu.node.relativePath : ''
    setCreateState({ parentRelativePath, type })
    setCreateInput('')
    setCreateError('')
    setContextMenu(null)
  }, [contextMenu])

  const handleRenameClick = useCallback(() => {
    if (!contextMenu || !contextMenu.node) return
    const node = contextMenu.node
    const isDir = node.isDirectory
    const lastDot = node.name.lastIndexOf('.')
    const ext = !isDir && lastDot > 0 ? node.name.slice(lastDot) : ''
    const baseName = !isDir && lastDot > 0 ? node.name.slice(0, lastDot) : node.name
    setRenameState({ node, initialName: node.name, ext })
    setRenameInput(baseName)
    setRenameError('')
    setContextMenu(null)
  }, [contextMenu])

  const handleDeleteClick = useCallback(() => {
    if (!contextMenu || !contextMenu.node) return
    setDeleteState({ node: contextMenu.node })
    setContextMenu(null)
  }, [contextMenu])

  const handleCopyPathClick = useCallback(async (pathType: 'absolute' | 'relative') => {
    if (!contextMenu || !rootPath) return
    await window.api.copyItemPath(rootPath, contextMenu.node?.relativePath ?? '', pathType)
    setContextMenu(null)
  }, [contextMenu, rootPath])

  const handleRevealClick = useCallback(async () => {
    if (!contextMenu || !rootPath) return
    await window.api.revealItem(rootPath, contextMenu.node?.relativePath ?? '')
    setContextMenu(null)
  }, [contextMenu, rootPath])

  const handleCreateConfirm = useCallback(async () => {
    if (!createState || !rootPath || createBusy) return
    if (!createInput.trim()) {
      setCreateError('名称不能为空')
      return
    }
    setCreateBusy(true)
    setCreateError('')
    const result = await window.api.createItem(
      rootPath,
      createState.parentRelativePath,
      createInput,
      createState.type
    )
    setCreateBusy(false)
    if (result.success) {
      setCreateState(null)
      if (createState.parentRelativePath) {
        setCollapsed((prev) => {
          if (!prev.has(createState.parentRelativePath)) return prev
          const next = new Set(prev)
          next.delete(createState.parentRelativePath)
          return next
        })
      }
      onRefreshFiles()
    } else {
      setCreateError(result.error ?? '创建失败')
    }
  }, [createState, rootPath, createBusy, createInput, onRefreshFiles])

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleCreateConfirm()
      } else if (e.key === 'Escape') {
        setCreateState(null)
      }
    },
    [handleCreateConfirm]
  )

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
        onContextMenu={handleBlankContextMenu}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleNodes.slice(startIndex, endIndex).map((item, i) => {
            const { node, depth } = item
            const isDir = node.isDirectory
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
          {(!contextMenu.node || contextMenu.node.isDirectory) && (
            <>
              <button className="file-context-menu-item" type="button" onClick={() => handleCreateClick('file')}>
                新建文档
              </button>
              <button className="file-context-menu-item" type="button" onClick={() => handleCreateClick('folder')}>
                新建文件夹
              </button>
            </>
          )}
          {contextMenu.node && (
            <>
              <button className="file-context-menu-item" type="button" onClick={handleRenameClick}>
                重命名
              </button>
              <button className="file-context-menu-item" type="button" onClick={handleDeleteClick}>
                删除
              </button>
            </>
          )}
          <button className="file-context-menu-item" type="button" onClick={() => handleCopyPathClick('absolute')}>
            复制文件路径
          </button>
          <button className="file-context-menu-item" type="button" onClick={() => handleCopyPathClick('relative')}>
            复制文件相对路径
          </button>
          <button className="file-context-menu-item" type="button" onClick={handleRevealClick}>
            在资源管理器中查看
          </button>
        </div>
      )}
      {createState && (
        <div className="dialog-overlay" onClick={() => { if (!createBusy) setCreateState(null) }}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{createState.type === 'file' ? '新建文档' : '新建文件夹'}</div>
            <input
              ref={renameInputRef}
              className="dialog-input"
              value={createInput}
              onChange={(e) => setCreateInput(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              disabled={createBusy}
              spellCheck={false}
            />
            {createState.type === 'file' && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                未输入扩展名时自动使用 .md
              </div>
            )}
            <div className="dialog-error">{createError}</div>
            <div className="dialog-actions">
              <button
                className="dialog-btn"
                type="button"
                onClick={() => setCreateState(null)}
                disabled={createBusy}
              >
                取消
              </button>
              <button
                className="dialog-btn dialog-btn--primary"
                type="button"
                onClick={handleCreateConfirm}
                disabled={createBusy || !createInput.trim()}
              >
                确认
              </button>
            </div>
          </div>
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
