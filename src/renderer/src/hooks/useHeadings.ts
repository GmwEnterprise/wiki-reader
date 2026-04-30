import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { extractHeadings } from '../utils/headings'

export function useHeadings(content: string, mode: 'preview' | 'source') {
  const headings = useMemo(
    () => (mode === 'source' ? [] : extractHeadings(content)),
    [content, mode]
  )
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

  return { headings, activeId, setupObserver, jumpToHeading }
}
