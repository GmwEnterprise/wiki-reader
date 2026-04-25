import { useMemo, useRef, useCallback, useEffect, useState } from 'react'
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

export function collectLocalImageSrcs(html: string): string[] {
  const srcs = new Set<string>()
  for (const match of html.matchAll(LOCAL_SRC_RE)) {
    srcs.add(match[2])
  }
  return Array.from(srcs)
}

export function replaceLocalImageSrc(html: string, loadedImages: Record<string, string>): string {
  return html.replace(LOCAL_SRC_RE, (_match, before: string, src: string, after: string) => {
    const loadedSrc = loadedImages[src]
    if (loadedSrc) return `${before}src="${loadedSrc}"${after}`
    return `${before}src="${PLACEHOLDER}" data-local-src="${src}"${after}`
  })
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
  const imageContextKey = `${workspaceRootPath ?? ''}\u0000${currentFilePath ?? ''}\u0000${source}`
  const [loadedImages, setLoadedImages] = useState<{ key: string; urls: Record<string, string> }>({
    key: imageContextKey,
    urls: {}
  })

  const renderedHtml = useMemo(() => renderMarkdown(source), [source])
  const activeImageUrls = loadedImages.key === imageContextKey ? loadedImages.urls : {}
  const html = useMemo(() => replaceLocalImageSrc(renderedHtml, activeImageUrls), [renderedHtml, activeImageUrls])

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

    const externalImages = container.querySelectorAll('img:not([data-local-src])')
    for (const img of externalImages) {
      img.addEventListener('error', function handleError() {
        img.removeEventListener('error', handleError)
        img.setAttribute('data-broken', 'true')
        img.alt = img.alt || '图片无法加载'
        img.src = BROKEN_SVG
      })
    }
  }, [html])

  useEffect(() => {
    if (!workspaceRootPath || !currentFilePath) return

    let cancelled = false
    const localSrcs = collectLocalImageSrcs(renderedHtml).filter((src) => !activeImageUrls[src])
    if (localSrcs.length === 0) return

    for (const localSrc of localSrcs) {
      const setImageSrc = (src: string): void => {
        if (cancelled) return
        setLoadedImages((current) => ({
          key: imageContextKey,
          urls: {
            ...(current.key === imageContextKey ? current.urls : {}),
            [localSrc]: src
          }
        }))
      }

      let resolved: string
      try {
        resolved = resolveRelativePath(currentFilePath, localSrc)
      } catch {
        setImageSrc(BROKEN_SVG)
        continue
      }

      window.api.readAsset(workspaceRootPath, resolved).then((result) => {
        if (result.success && result.dataUrl) {
          setImageSrc(result.dataUrl)
        } else {
          setImageSrc(BROKEN_SVG)
          console.warn('[MarkdownView] 图片加载失败:', localSrc, '→', resolved, result.error)
        }
      }).catch(() => {
        setImageSrc(BROKEN_SVG)
      })
    }

    return () => {
      cancelled = true
    }
  }, [activeImageUrls, currentFilePath, imageContextKey, renderedHtml, workspaceRootPath])

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  )
}
