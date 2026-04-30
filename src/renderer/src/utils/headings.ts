import type { Heading } from '../types'

export function extractHeadingsFromSource(source: string): Heading[] {
  const headings: Heading[] = []
  const idCounts = new Map<string, number>()
  const lines = source.split('\n')

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (!match) continue

    const level = match[1].length
    const text = match[2].replace(/\s+#+\s*$/, '').trim()
    const baseId = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-|-$/g, '')

    const count = idCounts.get(baseId) || 0
    idCounts.set(baseId, count + 1)
    const id = count === 0 ? baseId : `${baseId}-${count}`

    headings.push({ id, level, text })
  }

  return headings
}

export function extractHeadings(markdownSource: string): Heading[] {
  return extractHeadingsFromSource(markdownSource)
}
