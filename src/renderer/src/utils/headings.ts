import type { Heading } from '../types'
import { extractRenderedHeadings } from './markdown'

export function extractHeadings(markdownSource: string): Heading[] {
  return extractRenderedHeadings(markdownSource)
}
