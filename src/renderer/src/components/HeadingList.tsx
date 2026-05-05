import { useState, useCallback, useMemo } from 'react'
import type { Heading } from '../types'

type HeadingListProps = {
  headings: Heading[]
  activeId: string | null
  onJump: (id: string) => void
  loading?: boolean
}

type HeadingTreeNode = {
  heading: Heading
  children: HeadingTreeNode[]
}

function buildHeadingTree(headings: Heading[]): HeadingTreeNode[] {
  const roots: HeadingTreeNode[] = []
  const stack: HeadingTreeNode[] = []

  for (const h of headings) {
    const node: HeadingTreeNode = { heading: h, children: [] }

    while (stack.length > 0 && stack[stack.length - 1].heading.level >= h.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }

    stack.push(node)
  }

  return roots
}

function collectParentIds(nodes: HeadingTreeNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.children.length > 0) {
      ids.push(node.heading.id)
      ids.push(...collectParentIds(node.children))
    }
  }
  return ids
}

export default function HeadingList({ headings, activeId, onJump, loading = false }: HeadingListProps) {
  const tree = useMemo(() => buildHeadingTree(headings), [headings])
  const allParentIds = useMemo(() => new Set(collectParentIds(tree)), [tree])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setCollapsed(new Set())
  }, [])

  const collapseAll = useCallback(() => {
    setCollapsed(new Set(allParentIds))
  }, [allParentIds])

  if (loading) {
    return <div className="heading-list-empty">标题加载中...</div>
  }

  if (headings.length === 0) {
    return <div className="heading-list-empty">当前文档无标题</div>
  }

  return (
    <div className="heading-list">
      <div className="heading-list-actions">
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
        <HeadingNode
          key={node.heading.id}
          node={node}
          depth={0}
          activeId={activeId}
          onJump={onJump}
          collapsed={collapsed}
          toggle={toggle}
        />
      ))}
    </div>
  )
}

function HeadingNode({
  node,
  depth,
  activeId,
  onJump,
  collapsed,
  toggle
}: {
  node: HeadingTreeNode
  depth: number
  activeId: string | null
  onJump: (id: string) => void
  collapsed: Set<string>
  toggle: (id: string) => void
}) {
  const { heading, children } = node
  const hasChildren = children.length > 0
  const isCollapsed = collapsed.has(heading.id)
  const isActive = heading.id === activeId

  return (
    <>
      <div
        className={
          'heading-item heading-item--level-' + heading.level
          + (isActive ? ' heading-item--active' : '')
        }
        style={{ '--node-depth': depth } as React.CSSProperties}
        onClick={() => {
          if (hasChildren) {
            toggle(heading.id)
          }
          onJump(heading.id)
        }}
      >
        <span
          className={
            'file-node-toggle'
            + (hasChildren ? (isCollapsed ? '' : ' file-node-toggle--open') : ' file-node-toggle--empty')
          }
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation()
              toggle(heading.id)
            }
          }}
        />
        <span className="heading-item-text">{heading.text}</span>
      </div>
      {hasChildren && !isCollapsed &&
        children.map((child) => (
          <HeadingNode
            key={child.heading.id}
            node={child}
            depth={depth + 1}
            activeId={activeId}
            onJump={onJump}
            collapsed={collapsed}
            toggle={toggle}
          />
        ))}
    </>
  )
}
