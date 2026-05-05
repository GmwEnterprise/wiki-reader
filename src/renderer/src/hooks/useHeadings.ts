import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { extractHeadings } from '../utils/headings'

function getHeadingLines(content: string): Map<string, number> {
  const linesById = new Map<string, number>()
  const idCounts = new Map<string, number>()
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let inCodeBlock = false

  lines.forEach((line, index) => {
    if (/^(?:```|~~~)/.test(line)) {
      inCodeBlock = !inCodeBlock
      return
    }
    if (inCodeBlock) return

    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!match) return

    const text = match[2].replace(/\s+#+\s*$/, '').trim()
    const baseId = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '')
    const count = idCounts.get(baseId) || 0
    idCounts.set(baseId, count + 1)
    const id = count === 0 ? baseId : `${baseId}-${count}`
    linesById.set(id, index + 1)
  })

  return linesById
}

export function useHeadings(content: string, documentKey: string | null) {
  const headings = useMemo(() => extractHeadings(content), [content])
  const headingLines = useMemo(() => getHeadingLines(content), [content])
  const [activeId, setActiveId] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const setupObserver = useCallback(
    (container: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
      if (!container || headings.length === 0) return

      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveId(entry.target.id)
            }
          }
        },
        { rootMargin: '0px 0px -80% 0px' }
      )

      const elementsById = new Map<string, Element>()
      for (const el of container.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
        elementsById.set(el.id, el)
      }
      for (const h of headings) {
        const el = elementsById.get(h.id)
        if (el) observerRef.current.observe(el)
      }
    },
    [headings]
  )

  useEffect(() => {
    setActiveId(null)
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
  }, [documentKey])

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  const jumpToHeading = useCallback((id: string) => {
    setActiveId(id)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  const getHeadingLine = useCallback(
    (id: string, source = content) => {
      const linesById = source === content ? headingLines : getHeadingLines(source)
      return linesById.get(id)
    },
    [content, headingLines]
  )

  return { headings, activeId, setupObserver, jumpToHeading, setActiveId, getHeadingLine }
}
