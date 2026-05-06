import { useEffect } from 'react'
import mermaid from 'mermaid'
import type { RefObject } from 'react'

let mermaidInitialized = false
let idCounter = 0

function getTheme(): 'dark' | 'default' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default'
}

function initMermaid(): void {
  mermaid.initialize({
    startOnLoad: false,
    theme: getTheme(),
    securityLevel: 'loose'
  })
  mermaidInitialized = true
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

async function renderMermaid(id: string, source: string): Promise<Awaited<ReturnType<typeof mermaid.render>>> {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '-10000px'
  host.style.visibility = 'hidden'
  document.body.appendChild(host)
  try {
    return await mermaid.render(id, source, host)
  } finally {
    host.remove()
  }
}

export function useMermaid(
  containerRef: RefObject<HTMLDivElement | null>,
  html: string
): void {
  useEffect(() => {
    if (!mermaidInitialized) initMermaid()

    const container = containerRef.current
    if (!container) return

    let cancelled = false

    const renderAll = async (): Promise<void> => {
      const currentTheme = getTheme()
      mermaid.initialize({
        startOnLoad: false,
        theme: currentTheme,
        securityLevel: 'loose'
      })

      const sources = container.querySelectorAll<HTMLElement>('[data-mermaid]:not([data-mermaid-processing])')
      if (sources.length === 0) return

      for (const el of sources) {
        if (cancelled) break
        el.setAttribute('data-mermaid-processing', 'true')

        const source = (el.getAttribute('data-mermaid-source') ?? el.querySelector('code')?.textContent ?? '').trim()
        if (!el.hasAttribute('data-mermaid-source')) {
          el.setAttribute('data-mermaid-source', source)
        }

        const id = `mermaid-svg-${++idCounter}`

        try {
          if (!source) throw new Error('mermaid 图表源码为空')
          const { svg, bindFunctions } = await renderMermaid(id, source)
          if (!svg.trim()) throw new Error('mermaid 未返回可显示的 SVG')
          if (!cancelled) {
            const wrapper = document.createElement('div')
            wrapper.className = 'mermaid-diagram'
            wrapper.setAttribute('data-mermaid-processed', 'true')
            wrapper.setAttribute('data-mermaid-source', source)
            wrapper.innerHTML = svg
            el.replaceWith(wrapper)
            bindFunctions?.(wrapper)
          } else {
            el.removeAttribute('data-mermaid-processing')
          }
        } catch (err) {
          if (!cancelled) {
            el.removeAttribute('data-mermaid-processing')
            el.classList.add('mermaid-error')
            const msg = err instanceof Error ? err.message : String(err)
            el.innerHTML = `<code>${escapeHtml(msg)}</code>`
          } else {
            el.removeAttribute('data-mermaid-processing')
          }
        }
      }
    }

    renderAll()

    const observer = new MutationObserver(() => {
      const processed = container.querySelectorAll<HTMLElement>('[data-mermaid-processed]')
      for (const el of processed) {
        const savedSource = el.getAttribute('data-mermaid-source') ?? ''
        const pre = document.createElement('pre')
        pre.className = 'mermaid-src'
        pre.setAttribute('data-mermaid', '')
        pre.setAttribute('data-mermaid-source', savedSource)
        pre.innerHTML = `<code>${escapeHtml(savedSource)}</code>`
        el.replaceWith(pre)
      }
      if (processed.length > 0) {
        renderAll()
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      cancelled = true
      const pending = container.querySelectorAll<HTMLElement>('[data-mermaid-processing]')
      for (const el of pending) {
        el.removeAttribute('data-mermaid-processing')
      }
      observer.disconnect()
    }
  }, [containerRef, html])
}
