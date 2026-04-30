import { describe, expect, it } from 'vitest'
import {
  buildFileTree,
  collectDirectoryPaths,
  mergeCollapsedWithNewDirectories,
  flattenVisibleNodes
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

describe('flattenVisibleNodes', () => {
  const tree = buildFileTree(files)

  it('折叠状态只返回根节点', () => {
    const collapsed = new Set(['guides', 'guides/deploy'])
    const flat = flattenVisibleNodes(tree, collapsed)
    expect(flat.map(n => n.node.name)).toEqual(['guides', 'readme.md'])
  })

  it('部分展开返回可见子节点', () => {
    const collapsed = new Set(['guides/deploy'])
    const flat = flattenVisibleNodes(tree, collapsed)
    expect(flat.map(n => n.node.name)).toEqual(['guides', 'deploy', 'setup.md', 'readme.md'])
  })

  it('全部展开返回所有节点', () => {
    const flat = flattenVisibleNodes(tree, new Set())
    expect(flat.map(n => n.node.name)).toEqual(['guides', 'deploy', 'checklist.md', 'setup.md', 'readme.md'])
  })

  it('depth 值正确', () => {
    const flat = flattenVisibleNodes(tree, new Set())
    expect(flat.map(n => n.depth)).toEqual([0, 1, 2, 1, 0])
  })
})
