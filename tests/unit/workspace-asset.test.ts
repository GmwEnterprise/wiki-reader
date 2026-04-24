import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { readWorkspaceAsset } from '../../src/main/workspace'

const workspaceRoot = join(process.cwd(), 'docs/wiki-example')

describe('readWorkspaceAsset', () => {
  it('把 workspace 内的图片读取为 data URL', async () => {
    const dataUrl = await readWorkspaceAsset(workspaceRoot, 'img/thumbnail.jpg')

    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('拒绝读取 workspace 外的文件', async () => {
    await expect(readWorkspaceAsset(workspaceRoot, '../README.md')).rejects.toThrow('路径不合法')
  })
})
