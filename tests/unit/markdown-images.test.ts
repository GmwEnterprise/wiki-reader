import { describe, expect, it } from 'vitest'
import { collectLocalImageSrcs, replaceLocalImageSrc } from '../../src/renderer/src/components/MarkdownView'

describe('MarkdownView 图片资源处理', () => {
  it('收集并占位本地图片 src，忽略外部和 data 图片', () => {
    const html = [
      '<p><img src="../img/thumbnail.jpg" alt="图片一"></p>',
      '<p><img src="https://example.com/a.jpg" alt="外部图片"></p>',
      '<p><img src="data:image/png;base64,abc" alt="内联图片"></p>'
    ].join('')

    expect(collectLocalImageSrcs(html)).toEqual(['../img/thumbnail.jpg'])
    expect(replaceLocalImageSrc(html, {})).toContain('data-local-src="../img/thumbnail.jpg"')
  })

  it('本地图片读取完成后用真实资源替换占位 src', () => {
    const html = '<p><img src="../img/thumbnail.jpg" alt="图片一"></p>'
    const replaced = replaceLocalImageSrc(html, {
      '../img/thumbnail.jpg': 'data:image/jpeg;base64,abc'
    })

    expect(replaced).toContain('src="data:image/jpeg;base64,abc"')
    expect(replaced).not.toContain('data-local-src')
  })
})
