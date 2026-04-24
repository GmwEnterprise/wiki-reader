import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { extractHeadings } from '../utils/headings'

export function useHeadings(content: string) {
  const headings = useMemo(() => extractHeadings(content), [content])
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

      for (const h of headings) {
        const el = container.querySelector(`#${CSS.escape(h.id)}`)
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
