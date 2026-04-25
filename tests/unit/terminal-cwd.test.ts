import os from 'os'
import { describe, expect, it } from 'vitest'
import { resolveTerminalCwd } from '../../src/main/terminal'

describe('resolveTerminalCwd', () => {
  it('未提供工作区时使用用户目录', () => {
    expect(resolveTerminalCwd(null)).toBe(os.homedir())
  })
})
