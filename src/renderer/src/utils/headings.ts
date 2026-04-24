import type { Heading } from '../types'

export function extractHeadings(markdownSource: string): Heading[] {
  const headings: Heading[] = []
  const lines = markdownSource.split('\n')
  const idCounts = new Map<string, number>()

  let inCodeBlock = false

  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].trim()
      const baseId = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-|-$/g, '')
      const count = idCounts.get(baseId) || 0
      idCounts.set(baseId, count + 1)
      const id = count === 0 ? baseId : `${baseId}-${count}`
      headings.push({ id, level, text })
    }
  }

  return headings
}
