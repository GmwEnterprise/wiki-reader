import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // fallback
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  }
})

const headingIds = new Map<string, number>()

md.core.ruler.push('heading_ids', (state) => {
  headingIds.clear()
  for (const token of state.tokens) {
    if (token.type === 'heading_open') {
      const inline = state.tokens[state.tokens.indexOf(token) + 1]
      if (inline) {
        const text = inline.content
        const baseId = text
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
          .replace(/^-|-$/g, '')
        const count = headingIds.get(baseId) || 0
        headingIds.set(baseId, count + 1)
        const id = count === 0 ? baseId : `${baseId}-${count}`
        token.attrSet('id', id)
      }
    }
  }
})

export function renderMarkdown(source: string): string {
  return md.render(source)
}

export function extractRenderedHeadings(source: string): import('../types').Heading[] {
  const headings: import('../types').Heading[] = []
  const tempMd = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(str: string, lang: string): string {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
        } catch { /* fallback */ }
      }
      return `<pre class="hljs"><code>${tempMd.utils.escapeHtml(str)}</code></pre>`
    }
  })

  const localHeadingIds = new Map<string, number>()

  tempMd.core.ruler.push('heading_ids', (state) => {
    localHeadingIds.clear()
    for (const token of state.tokens) {
      if (token.type === 'heading_open') {
        const inline = state.tokens[state.tokens.indexOf(token) + 1]
        if (inline) {
          const text = inline.content
          const baseId = text
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
            .replace(/^-|-$/g, '')
          const count = localHeadingIds.get(baseId) || 0
          localHeadingIds.set(baseId, count + 1)
          const id = count === 0 ? baseId : `${baseId}-${count}`
          token.attrSet('id', id)
          headings.push({ id, level: parseInt(token.tag.slice(1)), text })
        }
      }
    }
  })

  tempMd.render(source)
  return headings
}
