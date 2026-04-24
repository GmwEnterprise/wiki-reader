import { describe, expect, it } from 'vitest'
import { buildFileTree, collectDirectoryPaths } from '../../src/renderer/src/components/FileList'
import type { WikiFile } from '../../src/renderer/src/types'

const files: WikiFile[] = [
  { relativePath: 'guides/setup.md', name: 'setup.md', mtimeMs: 1, size: 10 },
  { relativePath: 'guides/deploy/checklist.md', name: 'checklist.md', mtimeMs: 2, size: 20 },
  { relativePath: 'readme.md', name: 'readme.md', mtimeMs: 3, size: 30 }
]

describe('FileList tree helpers', () => {
  it('收集所有目录路径用于默认折叠', () => {
    const tree = buildFileTree(files)

    expect(collectDirectoryPaths(tree)).toEqual(['guides', 'guides/deploy'])
  })
})
