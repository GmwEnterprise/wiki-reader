import os from 'os'
import { describe, expect, it } from 'vitest'
import { getTerminalProcessName, resolveTerminalCwd } from '../../src/main/terminal'

describe('resolveTerminalCwd', () => {
  it('未提供工作区时使用用户目录', () => {
    expect(resolveTerminalCwd(null)).toBe(os.homedir())
  })
})

describe('getTerminalProcessName', () => {
  it('使用 shell 文件名作为终端标题来源', () => {
    expect(getTerminalProcessName('powershell.exe')).toBe('powershell.exe')
    expect(getTerminalProcessName('/bin/bash')).toBe('bash')
  })
})
