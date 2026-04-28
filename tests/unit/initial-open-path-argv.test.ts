import { describe, expect, it } from 'vitest'
import { getInitialOpenPathArg, getInitialOpenPathFromArgv } from '../../src/preload/initial-open-path'

describe('initial open path argv', () => {
  it('从窗口附加参数中读取初始打开路径', () => {
    const argv = ['electron', ...getInitialOpenPathArg('C:\\Users\\me\\Documents\\我的简历')]

    expect(getInitialOpenPathFromArgv(argv)).toBe('C:\\Users\\me\\Documents\\我的简历')
  })

  it('没有初始打开路径参数时返回 null', () => {
    expect(getInitialOpenPathFromArgv(['electron'])).toBe(null)
  })
})
