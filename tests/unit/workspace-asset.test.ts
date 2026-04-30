import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { readWorkspaceAsset } from '../../src/main/workspace'

const workspaceRoot = join(process.cwd(), 'docs/wiki-example')

describe('readWorkspaceAsset', () => {
  it('返回 ArrayBuffer 和 mimeType', async () => {
    const result = await readWorkspaceAsset(workspaceRoot, 'img/thumbnail.jpg')

    expect(result.buffer).toBeInstanceOf(ArrayBuffer)
    expect(result.buffer.byteLength).toBeGreaterThan(0)
    expect(result.mimeType).toBe('image/jpeg')
  })

  it('拒绝读取 workspace 外的文件', async () => {
    await expect(readWorkspaceAsset(workspaceRoot, '../README.md')).rejects.toThrow('路径不合法')
  })
})
