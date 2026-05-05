import { useMemo, useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { renderMarkdown } from '../utils/markdown'
import type { WikiFile } from '../types'

type MarkdownViewProps = {
  source: string
  currentFilePath: string | null
  workspaceRootPath: string | null
  files: WikiFile[]
  onOpenFile: (file: WikiFile) => void
  onRendered?: (container: HTMLElement) => void
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

const ABSOLUTE_PATH_RE = /^(?:[A-Za-z]:[\\/]|\/)/

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

function isLocalLink(href: string): boolean {
  return (
    !href.startsWith('#') &&
    !href.startsWith('http://') &&
    !href.startsWith('https://') &&
    !href.startsWith('mailto:') &&
    !href.startsWith('data:')
  )
}

function revokeBlobUrls(urls: Record<string, string>): void {
  for (const url of Object.values(urls)) {
    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  }
}

function toBlobUrl(buffer: ArrayBuffer, mimeType: string): string {
  return URL.createObjectURL(new Blob([buffer], { type: mimeType }))
}

export default function MarkdownView({
  source,
  currentFilePath,
  workspaceRootPath,
  files,
  onOpenFile,
  onRendered
}: MarkdownViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef<Set<string>>(new Set())
  const prevImageUrlsRef = useRef<Record<string, string>>({})
  const imageContextKey = `${workspaceRootPath ?? ''}\u0000${currentFilePath ?? ''}`
  const [loadedImages, setLoadedImages] = useState<{ key: string; urls: Record<string, string> }>({
    key: imageContextKey,
    urls: {}
  })

  const renderResult = useMemo(() => {
    try {
      return { html: renderMarkdown(source), failed: false }
    } catch {
      return { html: '', failed: true }
    }
  }, [source])
  const renderedHtml = renderResult.html
  const activeImageUrls = loadedImages.key === imageContextKey ? loadedImages.urls : {}

  if (loadedImages.key !== imageContextKey) {
    revokeBlobUrls(prevImageUrlsRef.current)
    prevImageUrlsRef.current = {}
  }
  prevImageUrlsRef.current = activeImageUrls

  const html = useMemo(() => replaceLocalImageSrc(renderedHtml, activeImageUrls), [renderedHtml, activeImageUrls])

  useLayoutEffect(() => {
    if (containerRef.current) {
      onRendered?.(containerRef.current)
    }
  }, [html, onRendered])

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
        const placeholder = document.createElement('span')
        placeholder.className = 'broken-image-placeholder'
        placeholder.textContent = '🖼 图片无法加载'
        img.replaceWith(placeholder)
      })
    }
  }, [html])

  useEffect(() => {
    if (!workspaceRootPath || !currentFilePath) return

    let cancelled = false

    const allLocalSrcs = collectLocalImageSrcs(renderedHtml)
    const currentSrcs = new Set(allLocalSrcs)
    const staleKeys = Object.keys(activeImageUrls).filter((k) => !currentSrcs.has(k))
    if (staleKeys.length > 0) {
      for (const k of staleKeys) {
        const url = activeImageUrls[k]
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      }
      setLoadedImages((prev) => {
        if (prev.key !== imageContextKey) return prev
        const next = { ...prev.urls }
        for (const k of staleKeys) delete next[k]
        return { key: prev.key, urls: next }
      })
    }

    const localSrcs = allLocalSrcs.filter(
      (src) => !activeImageUrls[src] && !loadingRef.current.has(src)
    )
    if (localSrcs.length === 0) return

    for (const localSrc of localSrcs) {
      loadingRef.current.add(localSrc)
    }

    const loadSingleImage = async (localSrc: string): Promise<[string, string]> => {
      if (ABSOLUTE_PATH_RE.test(localSrc) || ABSOLUTE_PATH_RE.test(decodeURIComponent(localSrc))) {
        const normalized = normalizePath(decodeURIComponent(localSrc))
        const result = await window.api.readAbsoluteAsset(normalized)
        if (!cancelled && result.success && result.buffer && result.mimeType) {
          return [localSrc, toBlobUrl(result.buffer, result.mimeType)]
        }
        return [localSrc, PLACEHOLDER]
      }

      let resolved: string
      try {
        resolved = resolveRelativePath(currentFilePath, localSrc)
      } catch {
        return [localSrc, PLACEHOLDER]
      }

      const result = await window.api.readAsset(workspaceRootPath, resolved)
      if (!cancelled && result.success && result.buffer && result.mimeType) {
        return [localSrc, toBlobUrl(result.buffer, result.mimeType)]
      }
      return [localSrc, PLACEHOLDER]
    }

    Promise.allSettled(localSrcs.map(loadSingleImage)).then((results) => {
      if (cancelled) return
      const batch: Record<string, string> = {}
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const [src, url] = r.value
          batch[src] = url
          loadingRef.current.delete(src)
        }
      }
      setLoadedImages((current) => ({
        key: imageContextKey,
        urls: {
          ...(current.key === imageContextKey ? current.urls : {}),
          ...batch
        }
      }))
    })

    return () => {
      cancelled = true
      for (const localSrc of localSrcs) {
        loadingRef.current.delete(localSrc)
      }
    }
  }, [activeImageUrls, currentFilePath, imageContextKey, renderedHtml, workspaceRootPath])

  useEffect(() => {
    return () => {
      revokeBlobUrls(prevImageUrlsRef.current)
    }
  }, [])

  if (renderResult.failed) {
    return (
      <div className="content-inner">
        <pre className="markdown-fallback">{source}</pre>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  )
}
