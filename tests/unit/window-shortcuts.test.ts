import { describe, expect, it } from 'vitest'
import { getWindowShortcutAction } from '../../src/main/window-shortcuts'

describe('getWindowShortcutAction', () => {
  it('非开发模式下仍允许 F12 切换开发者工具', () => {
    expect(getWindowShortcutAction({ type: 'keyDown', code: 'F12' }, false)).toBe('toggle-devtools')
  })

  it('非开发模式下允许 Ctrl+Shift+I 切换开发者工具', () => {
    expect(
      getWindowShortcutAction({ type: 'keyDown', code: 'KeyI', control: true, shift: true }, false)
    ).toBe('toggle-devtools')
  })

  it('非开发模式下继续阻止刷新窗口', () => {
    expect(getWindowShortcutAction({ type: 'keyDown', code: 'KeyR', control: true }, false)).toBe(
      'prevent-default'
    )
  })

  it('继续阻止窗口缩放快捷键', () => {
    expect(getWindowShortcutAction({ type: 'keyDown', code: 'Minus', control: true }, true)).toBe(
      'prevent-default'
    )
    expect(
      getWindowShortcutAction({ type: 'keyDown', code: 'Equal', control: true, shift: true }, true)
    ).toBe('prevent-default')
  })
})
