import { describe, expect, it } from 'vitest'
import { getWorkspaceShellState } from '../../src/renderer/src/appShell'

describe('getWorkspaceShellState', () => {
  it('冷启动带初始路径且工作区尚未打开时不进入欢迎页', () => {
    expect(getWorkspaceShellState(false, 'C:\\Users\\me\\Documents\\我的简历')).toBe('opening')
  })

  it('没有工作区也没有初始路径时进入欢迎页', () => {
    expect(getWorkspaceShellState(false, null)).toBe('welcome')
  })

  it('工作区已打开时进入工作区界面', () => {
    expect(getWorkspaceShellState(true, 'C:\\Users\\me\\Documents\\我的简历')).toBe('workspace')
  })
})
