import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const appCss = fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/App.css'), 'utf8')

describe('terminal CSS', () => {
  it('覆盖 xterm viewport 默认黑色背景', () => {
    expect(appCss).toMatch(
      /\.terminal-body\s+\.xterm\s+\.xterm-viewport\s*{[^}]*background-color:\s*var\(--terminal-bg\)/s
    )
  })

  it('让 xterm viewport 滚动条样式与应用滚动条保持一致', () => {
    expect(appCss).toMatch(
      /\.terminal-body\s+\.xterm\s+\.xterm-scrollable-element\s+>\s+\.scrollbar\.vertical\s*{[^}]*width:\s*7px\s*!important/s
    )
    expect(appCss).toMatch(
      /\.terminal-body\s+\.xterm\s+\.xterm-scrollable-element\s+>\s+\.scrollbar\s+>\s+\.slider\s*{[^}]*border-radius:\s*4px/s
    )
    expect(appCss).toMatch(
      /\.terminal-body\s+\.xterm\s+\.xterm-viewport::\-webkit-scrollbar-track\s*{[^}]*background:\s*transparent/s
    )
    expect(appCss).toMatch(
      /\.terminal-body\s+\.xterm\s+\.xterm-viewport::\-webkit-scrollbar-thumb\s*{[^}]*background:\s*var\(--scrollbar-thumb\)[^}]*border-radius:\s*4px/s
    )
    expect(appCss).toMatch(
      /\.terminal-body\s+\.xterm\s+\.xterm-viewport::\-webkit-scrollbar-corner\s*{[^}]*background:\s*var\(--terminal-bg\)/s
    )
  })
})
