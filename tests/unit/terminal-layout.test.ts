import { describe, expect, it, vi } from 'vitest'
import {
  calculateTerminalPanelHeight,
  createTerminalTheme,
  fitAndResizeTerminal
} from '../../src/renderer/src/components/terminalLayout'

describe('terminal layout helpers', () => {
  it('根据鼠标拖动距离计算终端面板高度', () => {
    expect(calculateTerminalPanelHeight(250, 400, 340)).toBe(310)
  })

  it('限制终端面板高度范围', () => {
    expect(calculateTerminalPanelHeight(250, 400, 800)).toBe(100)
    expect(calculateTerminalPanelHeight(250, 400, -100)).toBe(600)
  })

  it('fit 后把最新行列同步给主进程', () => {
    const fit = vi.fn()
    const resize = vi.fn()
    const terminal = { cols: 120, rows: 32 }

    fitAndResizeTerminal({ fit }, terminal, resize)

    expect(fit).toHaveBeenCalledTimes(1)
    expect(resize).toHaveBeenCalledWith(120, 32)
  })

  it('终端主题包含与应用滚动条一致的滑块颜色', () => {
    expect(createTerminalTheme(true)).toMatchObject({
      scrollbarSliderBackground: 'rgba(255, 255, 255, 0.18)',
      scrollbarSliderHoverBackground: 'rgba(255, 255, 255, 0.32)',
      scrollbarSliderActiveBackground: 'rgba(255, 255, 255, 0.32)'
    })
    expect(createTerminalTheme(false)).toMatchObject({
      scrollbarSliderBackground: 'rgba(0, 0, 0, 0.12)',
      scrollbarSliderHoverBackground: 'rgba(0, 0, 0, 0.22)',
      scrollbarSliderActiveBackground: 'rgba(0, 0, 0, 0.22)'
    })
  })
})
