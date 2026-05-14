import { memo, useMemo, useRef, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { MouseEventHandler, RefObject } from 'react'
import { renderMarkdown } from '../utils/markdown'
import { useMermaid } from '../hooks/useMermaid'
import type { WikiFile } from '../types'

type MarkdownViewProps = {
  source: string
  currentFilePath: string | null
  workspaceRootPath: string | null
  files: WikiFile[]
  onOpenFile: (file: WikiFile) => void
  onRendered?: (container: HTMLElement) => void
  selectionSpeechEnabled: boolean
}

type SpeechAction = {
  text: string
  x: number
  y: number
}

type MarkdownContentProps = {
  html: string
  containerRef: RefObject<HTMLDivElement | null>
  onClick: MouseEventHandler<HTMLDivElement>
  onMouseUp: MouseEventHandler<HTMLDivElement>
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

const MarkdownContent = memo(function MarkdownContent({
  html,
  containerRef,
  onClick,
  onMouseUp
}: MarkdownContentProps) {
  return (
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onClick}
      onMouseUp={onMouseUp}
    />
  )
})

export default function MarkdownView({
  source,
  currentFilePath,
  workspaceRootPath,
  files,
  onOpenFile,
  onRendered,
  selectionSpeechEnabled
}: MarkdownViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef<Set<string>>(new Set())
  const prevImageUrlsRef = useRef<Record<string, string>>({})
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const speechActionRef = useRef<SpeechAction | null>(null)
  const speechActionPopoverRef = useRef<HTMLDivElement>(null)
  const zoomContainerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [zoomState, setZoomState] = useState<{ svgHtml: string; scale: number; tx: number; ty: number } | null>(null)
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

  useMermaid(containerRef, html)

  useLayoutEffect(() => {
    if (containerRef.current) {
      onRendered?.(containerRef.current)
    }
  }, [html, onRendered])

  const handleClick = useCallback<MouseEventHandler<HTMLDivElement>>((e) => {
    const target = e.target as HTMLElement
    const diagram = target.closest('.mermaid-diagram')
    if (diagram) {
      const svgEl = diagram.querySelector('svg')
      if (svgEl) {
        setZoomState({ svgHtml: svgEl.outerHTML, scale: 2, tx: 0, ty: 0 })
      }
      return
    }

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
      const targetFile = files.find((f) => !f.isDirectory && normalizePath(f.relativePath) === resolvedPath)
      if (targetFile) {
        onOpenFile(targetFile)
      }
    }
  }, [currentFilePath, files, onOpenFile])

  const stopSpeech = useCallback(() => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    speechUtteranceRef.current = null
    setIsSpeaking(false)
  }, [])

  const hideSpeechAction = useCallback(() => {
    speechActionRef.current = null
    if (speechActionPopoverRef.current) {
      speechActionPopoverRef.current.hidden = true
    }
  }, [])

  const speakSelectedText = useCallback(() => {
    const speechAction = speechActionRef.current
    if (!speechAction || !('speechSynthesis' in window)) return

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(speechAction.text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1
    utterance.pitch = 1
    speechUtteranceRef.current = utterance
    hideSpeechAction()
    setIsSpeaking(true)

    const finish = () => {
      if (speechUtteranceRef.current === utterance) {
        speechUtteranceRef.current = null
        setIsSpeaking(false)
      }
    }
    utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.speak(utterance)
  }, [hideSpeechAction])

  const handleMouseUp = useCallback<MouseEventHandler<HTMLDivElement>>((e) => {
    if (!selectionSpeechEnabled) return

    const container = containerRef.current
    const selection = window.getSelection()
    if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      hideSpeechAction()
      return
    }

    const range = selection.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) {
      hideSpeechAction()
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      hideSpeechAction()
      return
    }

    speechActionRef.current = { text, x: e.clientX, y: e.clientY }
    if (speechActionPopoverRef.current) {
      speechActionPopoverRef.current.style.setProperty('--speech-action-x', `${e.clientX}px`)
      speechActionPopoverRef.current.style.setProperty('--speech-action-y', `${e.clientY}px`)
      speechActionPopoverRef.current.hidden = false
    }
  }, [hideSpeechAction, selectionSpeechEnabled])

  useEffect(() => {
    if (selectionSpeechEnabled) return
    hideSpeechAction()
    stopSpeech()
  }, [hideSpeechAction, selectionSpeechEnabled, stopSpeech])

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
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  useEffect(() => {
    if (!zoomState) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setZoomState(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomState])

  useEffect(() => {
    if (!zoomState) return
    const el = zoomContainerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setZoomState((prev) => prev ? { ...prev, scale: Math.min(Math.max(prev.scale * delta, 0.1), 10) } : null)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [zoomState])

  if (renderResult.failed) {
    return (
      <div className="content-inner">
        <pre className="markdown-fallback">{source}</pre>
      </div>
    )
  }

  return (
    <>
      <MarkdownContent
        html={html}
        containerRef={containerRef}
        onClick={handleClick}
        onMouseUp={handleMouseUp}
      />
      {'speechSynthesis' in window ? (
        <div
          ref={speechActionPopoverRef}
          className="speech-action-popover"
          hidden
        >
          <button
            type="button"
            className="speech-action-button"
            tabIndex={-1}
            title="朗读选中文本"
            aria-label="朗读选中文本"
            onMouseDown={(e) => e.preventDefault()}
            onClick={speakSelectedText}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="speech-action-close"
            tabIndex={-1}
            title="关闭朗读按钮"
            aria-label="关闭朗读按钮"
            onMouseDown={(e) => e.preventDefault()}
            onClick={hideSpeechAction}
          />
        </div>
      ) : null}
      {isSpeaking ? (
        <button
          type="button"
          className="speech-status-button"
          title="停止朗读"
          aria-label="停止朗读"
          onClick={stopSpeech}
        >
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="1" y="1" width="10" height="10" rx="2" />
          </svg>
        </button>
      ) : null}
      {zoomState ? (
        <div
          className="mermaid-zoom-overlay"
          onClick={() => setZoomState(null)}
        >
          <div
            ref={zoomContainerRef}
            className="mermaid-zoom-container"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              dragRef.current = { startX: e.clientX, startY: e.clientY, tx: zoomState.tx, ty: zoomState.ty }
            }}
            onMouseMove={(e) => {
              const drag = dragRef.current
              if (!drag) return
              setZoomState((prev) => prev ? { ...prev, tx: drag.tx + (e.clientX - drag.startX), ty: drag.ty + (e.clientY - drag.startY) } : null)
            }}
            onMouseUp={() => { dragRef.current = null }}
            onMouseLeave={() => { dragRef.current = null }}
            style={{
              transform: `translate(${zoomState.tx}px, ${zoomState.ty}px) scale(${zoomState.scale})`
            }}
            dangerouslySetInnerHTML={{ __html: zoomState.svgHtml }}
          />
          <button
            type="button"
            className="mermaid-zoom-close"
            title="关闭"
            aria-label="关闭"
            onClick={() => setZoomState(null)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      ) : null}
    </>
  )
}
