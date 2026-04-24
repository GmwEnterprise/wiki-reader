import { useMemo, useRef, useCallback, useEffect } from 'react'
import { renderMarkdown } from '../utils/markdown'
import type { WikiFile } from '../types'

type MarkdownViewProps = {
  source: string
  currentFilePath: string | null
  workspaceRootPath: string | null
  files: WikiFile[]
  onOpenFile: (file: WikiFile) => void
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function resolveRelativePath(currentPath: string, linkPath: string): string {
  const normalized = normalizePath(currentPath)
  const dir = normalized.includes('/') ? normalized.substring(0, normalized.lastIndexOf('/')) : ''
  const pathPart = decodeURIComponent(linkPath.split('#')[0])
  const combined = dir ? dir + '/' + pathPart : pathPart
  const parts = combined.split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '..') resolved.pop()
    else if (part !== '.' && part !== '') resolved.push(part)
  }
  return resolved.join('/')
}

const PLACEHOLDER =
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')

const LOCAL_SRC_RE = /(<img\s[^>]*?)src="((?!(?:https?:|data:|file:|\/\/))[^"]+)"([^>]*?>)/g

function replaceLocalImageSrc(html: string): string {
  return html.replace(LOCAL_SRC_RE, `$1src="${PLACEHOLDER}" data-local-src="$2"$3`)
}

const BROKEN_SVG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">' +
      '<rect width="120" height="80" rx="6" fill="#f0f0f0" stroke="#d0d0d0" stroke-width="1"/>' +
      '<text x="60" y="36" text-anchor="middle" fill="#aaa" font-size="24">🖼</text>' +
      '<text x="60" y="58" text-anchor="middle" fill="#bbb" font-size="10" font-family="sans-serif">图片无法加载</text>' +
      '</svg>'
  )

function isLocalLink(href: string): boolean {
  return (
    !href.startsWith('#') &&
    !href.startsWith('http://') &&
    !href.startsWith('https://') &&
    !href.startsWith('mailto:') &&
    !href.startsWith('data:')
  )
}

export default function MarkdownView({ source, currentFilePath, workspaceRootPath, files, onOpenFile }: MarkdownViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const html = useMemo(() => replaceLocalImageSrc(renderMarkdown(source)), [source])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const anchor = target.closest('a')
    if (!anchor) return

    const href = anchor.getAttribute('href')
    if (!href) return

    if (href.startsWith('#')) {
      e.preventDefault()
      const id = href.slice(1)
      containerRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    if (href.startsWith('http://') || href.startsWith('https://')) {
      e.preventDefault()
      window.open(href, '_blank')
      return
    }

    e.preventDefault()

    if (isLocalLink(href) && currentFilePath) {
      const resolvedPath = resolveRelativePath(currentFilePath, href)
      const targetFile = files.find((f) => normalizePath(f.relativePath) === resolvedPath)
      if (targetFile) {
        onOpenFile(targetFile)
      }
    }
  }, [currentFilePath, files, onOpenFile])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let canceled = false

    const images = container.querySelectorAll('img[data-local-src]')
    for (const img of images) {
      const localSrc = img.getAttribute('data-local-src')!
      if (!workspaceRootPath || !currentFilePath) continue

      let resolved: string
      try {
        resolved = resolveRelativePath(currentFilePath, localSrc)
      } catch {
        img.removeAttribute('data-local-src')
        img.setAttribute('data-broken', 'true')
        img.alt = img.alt || '图片无法加载'
        img.src = BROKEN_SVG
        continue
      }

      window.api.readAsset(workspaceRootPath, resolved).then((result) => {
        if (canceled) return
        if (result.success && result.dataUrl) {
          img.src = result.dataUrl
        } else {
          img.removeAttribute('data-local-src')
          img.setAttribute('data-broken', 'true')
          img.alt = img.alt || '图片无法加载'
          img.src = BROKEN_SVG
          console.warn('[MarkdownView] 图片加载失败:', localSrc, '→', resolved, result.error)
        }
      }).catch(() => {
        if (canceled) return
        img.removeAttribute('data-local-src')
        img.setAttribute('data-broken', 'true')
        img.alt = img.alt || '图片无法加载'
        img.src = BROKEN_SVG
      })
    }

    const externalImages = container.querySelectorAll('img:not([data-local-src])')
    for (const img of externalImages) {
      img.addEventListener('error', function handleError() {
        img.removeEventListener('error', handleError)
        img.setAttribute('data-broken', 'true')
        img.alt = img.alt || '图片无法加载'
        img.src = BROKEN_SVG
      })
    }

    return () => {
      canceled = true
    }
  }, [html, workspaceRootPath, currentFilePath])

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  )
}
