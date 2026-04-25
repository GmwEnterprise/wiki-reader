import { describe, expect, it } from 'vitest'
import {
  buildFileTree,
  collectDirectoryPaths,
  mergeCollapsedWithNewDirectories
} from '../../src/renderer/src/components/FileList'
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

  it('文件树从空列表更新为非空列表时新增目录默认折叠', () => {
    const previousTree = buildFileTree([])
    const nextTree = buildFileTree(files)

    expect(Array.from(mergeCollapsedWithNewDirectories(new Set(), previousTree, nextTree))).toEqual([
      'guides',
      'guides/deploy'
    ])
  })
})
