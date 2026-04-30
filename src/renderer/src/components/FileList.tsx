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
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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
              >
                <span className={`file-node-toggle${isDir ? (isCollapsed ? '' : ' file-node-toggle--open') : ' file-node-toggle--empty'}`} />
                <span className="file-node-icon">{isDir ? '📁' : '📄'}</span>
                <span className="file-node-name">{node.name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
