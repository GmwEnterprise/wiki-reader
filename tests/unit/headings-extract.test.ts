import { describe, expect, it } from 'vitest'
import { extractHeadingsFromSource } from '../../src/renderer/src/utils/headings'

describe('extractHeadingsFromSource', () => {
  it('提取各层级标题', () => {
    const headings = extractHeadingsFromSource('# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6')
    expect(headings).toEqual([
      { id: 'h1', level: 1, text: 'H1' },
      { id: 'h2', level: 2, text: 'H2' },
      { id: 'h3', level: 3, text: 'H3' },
      { id: 'h4', level: 4, text: 'H4' },
      { id: 'h5', level: 5, text: 'H5' },
      { id: 'h6', level: 6, text: 'H6' }
    ])
  })

  it('忽略非标题行', () => {
    const headings = extractHeadingsFromSource('普通文本\n# 标题\n更多文本')
    expect(headings).toEqual([{ id: '标题', level: 1, text: '标题' }])
  })

  it('重复标题添加计数后缀', () => {
    const headings = extractHeadingsFromSource('# Intro\n## Intro\n### Intro')
    expect(headings.map(h => h.id)).toEqual(['intro', 'intro-1', 'intro-2'])
  })

  it('中文标题生成正确 ID', () => {
    const headings = extractHeadingsFromSource('# 你好世界')
    expect(headings[0].id).toBe('你好世界')
  })

  it('特殊字符替换为连字符', () => {
    const headings = extractHeadingsFromSource('# Hello & World!')
    expect(headings[0].id).toBe('hello-world')
  })

  it('去除尾部闭合 # 标记', () => {
    const headings = extractHeadingsFromSource('# Title #')
    expect(headings[0].text).toBe('Title')
  })

  it('空内容返回空数组', () => {
    expect(extractHeadingsFromSource('')).toEqual([])
    expect(extractHeadingsFromSource('没有标题的文本\n更多文本')).toEqual([])
  })

  it('多于 6 个 # 不识别为标题', () => {
    const headings = extractHeadingsFromSource('####### 七级不是标题')
    expect(headings).toEqual([])
  })

  it('# 后必须跟空格', () => {
    const headings = extractHeadingsFromSource('#标题无空格')
    expect(headings).toEqual([])
  })
})
