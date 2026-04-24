import { describe, it, expect } from 'vitest'
import { validatePath } from '../../src/main/workspace'

describe('validatePath', () => {
  it('允许 workspace 内的文件路径', async () => {
    const result = await validatePath('/home/user/wiki', '/home/user/wiki/notes/test.md')
    expect(result).toBe(true)
  })

  it('拒绝 workspace 外的文件路径', async () => {
    const result = await validatePath('/home/user/wiki', '/etc/passwd')
    expect(result).toBe(false)
  })

  it('拒绝包含 .. 的路径逃逸', async () => {
    const result = await validatePath('/home/user/wiki', '/home/user/wiki/../../../etc/passwd')
    expect(result).toBe(false)
  })

  it('根路径本身是合法的', async () => {
    const result = await validatePath('/home/user/wiki', '/home/user/wiki')
    expect(result).toBe(true)
  })
})
