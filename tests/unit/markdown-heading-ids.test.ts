import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../src/renderer/src/utils/markdown'

describe('markdown heading_ids 插件', () => {
  it('为单标题生成正确 ID', () => {
    const html = renderMarkdown('# Hello World')
    expect(html).toContain('id="hello-world"')
  })

  it('为重复标题添加计数后缀', () => {
    const html = renderMarkdown('# Intro\n## Intro\n### Intro')
    expect(html).toContain('id="intro"')
    expect(html).toContain('id="intro-1"')
    expect(html).toContain('id="intro-2"')
  })

  it('为中文标题生成正确 ID', () => {
    const html = renderMarkdown('# 你好世界')
    expect(html).toContain('id="你好世界"')
  })

  it('标题 ID 中的特殊字符被替换为连字符', () => {
    const html = renderMarkdown('# Hello & World!')
    expect(html).toContain('id="hello-world"')
  })

  it('多级标题各自独立编号', () => {
    const html = renderMarkdown('# Title\n## Section\n## Section\n# Title')
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1])
    expect(ids).toEqual(['title', 'section', 'section-1', 'title-1'])
  })
})
