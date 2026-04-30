import { describe, expect, it } from 'vitest'
import { parseOpenArg } from '../../src/main/open-args'

describe('open args', () => {
  it('从 --open 后读取文件夹路径', () => {
    expect(parseOpenArg(['wiki-reader.exe', '--open', 'C:\\Users\\me\\Documents\\笔记'])).toBe(
      'C:\\Users\\me\\Documents\\笔记'
    )
  })

  it('忽略 --open 后插入的 Electron 启动开关', () => {
    expect(
      parseOpenArg([
        'wiki-reader.exe',
        '--open',
        '--allow-file-access-from-files',
        'C:\\Users\\me\\Documents\\笔记'
      ])
    ).toBe('C:\\Users\\me\\Documents\\笔记')
  })

  it('没有有效打开路径时返回 null', () => {
    expect(parseOpenArg(['wiki-reader.exe', '--allow-file-access-from-files'])).toBe(null)
    expect(parseOpenArg(['wiki-reader.exe', '--open', '--allow-file-access-from-files'])).toBe(null)
  })
})
