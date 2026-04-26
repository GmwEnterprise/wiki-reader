import { dialog } from 'electron'
import { readdir, stat, readFile, writeFile } from 'fs/promises'
import { join, extname, basename, relative, normalize, sep } from 'path'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import type { WikiFile } from '../renderer/src/types'

const IGNORED_DIRS = new Set(['node_modules', '.git', '.DS_Store', 'Thumbs.db'])
const MD_EXTENSIONS = new Set(['.md', '.markdown'])
const IMAGE_MIME_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.bmp', 'image/bmp'],
  ['.ico', 'image/x-icon']
])
const WATCH_DEBOUNCE_MS = 500

type WatchState = {
  watcher: FSWatcher
  timer: ReturnType<typeof setTimeout> | null
  structureChanged: boolean
  subscribers: Set<() => void>
  closed: boolean
}

const watchers = new Map<string, WatchState>()

export async function openFolderDialog(): Promise<{ rootPath: string; name: string } | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const rootPath = result.filePaths[0]
  return { rootPath, name: basename(rootPath) }
}

export async function scanMarkdownFiles(rootPath: string): Promise<WikiFile[]> {
  const files: WikiFile[] = []
  await walkDir(rootPath, rootPath, files)
  return files
}

async function walkDir(rootPath: string, currentPath: string, files: WikiFile[]): Promise<void> {
  const entries = await readdir(currentPath, { withFileTypes: true })
  const dirs: string[] = []
  const mdFiles: WikiFile[] = []

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue

    const fullPath = join(currentPath, entry.name)

    if (entry.isDirectory()) {
      dirs.push(fullPath)
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase()
      if (MD_EXTENSIONS.has(ext)) {
        const s = await stat(fullPath)
        mdFiles.push({
          relativePath: relative(rootPath, fullPath),
          name: entry.name,
          mtimeMs: s.mtimeMs,
          size: s.size
        })
      }
    }
  }

  mdFiles.sort((a, b) => a.name.localeCompare(b.name))
  files.push(...mdFiles)

  dirs.sort((a, b) => basename(a).localeCompare(basename(b)))
  for (const dir of dirs) {
    await walkDir(rootPath, dir, files)
  }
}

export async function readMarkdownFile(rootPath: string, relativePath: string): Promise<string> {
  const fullPath = join(rootPath, relativePath)
  const resolved = await validatePath(rootPath, fullPath)
  if (!resolved) throw new Error(`路径不合法: ${relativePath}`)
  return readFile(fullPath, 'utf-8')
}

export async function saveMarkdownFile(
  rootPath: string,
  relativePath: string,
  content: string
): Promise<void> {
  const fullPath = join(rootPath, relativePath)
  const valid = await validatePath(rootPath, fullPath)
  if (!valid) throw new Error(`路径不合法: ${relativePath}`)
  const ext = extname(relativePath).toLowerCase()
  if (!MD_EXTENSIONS.has(ext)) throw new Error(`不是 Markdown 文件: ${relativePath}`)
  await writeFile(fullPath, content, 'utf-8')
}

export async function readWorkspaceAsset(rootPath: string, relativePath: string): Promise<string> {
  const fullPath = join(rootPath, relativePath)
  const resolved = await validatePath(rootPath, fullPath)
  if (!resolved) throw new Error(`路径不合法: ${relativePath}`)

  const mimeType = IMAGE_MIME_TYPES.get(extname(relativePath).toLowerCase())
  if (!mimeType) throw new Error(`不支持的图片类型: ${relativePath}`)

  const buffer = await readFile(fullPath)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export async function readAbsoluteImageFile(absolutePath: string): Promise<string> {
  const normalizedPath = normalize(absolutePath)
  const ext = extname(normalizedPath).toLowerCase()
  const mimeType = IMAGE_MIME_TYPES.get(ext)
  if (!mimeType) throw new Error(`不支持的图片类型: ${ext}`)

  const buffer = await readFile(normalizedPath)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export async function validatePath(rootPath: string, targetPath: string): Promise<boolean> {
  const normalizedTarget = normalize(targetPath)
  const normalizedRoot = normalize(rootPath)
  return normalizedTarget.startsWith(normalizedRoot + sep) || normalizedTarget === normalizedRoot
}

export function watchWorkspace(rootPath: string, onChange: () => void): void {
  const existingState = watchers.get(rootPath)
  if (existingState && !existingState.closed) {
    existingState.subscribers.add(onChange)
    return
  }

  const watcher = chokidar.watch(['**/*.md', '**/*.markdown'], {
    cwd: rootPath,
    ignored: ['**/node_modules/**', '**/.git/**', '**/.*'],
    ignoreInitial: true
  })
  const state: WatchState = {
    watcher,
    timer: null,
    structureChanged: false,
    subscribers: new Set([onChange]),
    closed: false
  }

  const scheduleChange = (structureChanged: boolean): void => {
    if (state.closed || watchers.get(rootPath) !== state) return

    state.structureChanged = state.structureChanged || structureChanged

    if (state.timer) {
      clearTimeout(state.timer)
    }

    state.timer = setTimeout(() => {
      state.timer = null
      if (state.closed || watchers.get(rootPath) !== state || !state.structureChanged) return

      state.structureChanged = false
      for (const subscriber of state.subscribers) {
        subscriber()
      }
    }, WATCH_DEBOUNCE_MS)
  }

  watcher.on('add', () => scheduleChange(true))
  watcher.on('unlink', () => scheduleChange(true))
  // 内容变更不刷新文件树，只用于合并附近的结构变化事件。
  watcher.on('change', () => scheduleChange(false))

  watchers.set(rootPath, state)
}

export function unwatchWorkspace(rootPath: string, onChange?: () => void): void {
  const state = watchers.get(rootPath)
  if (state) {
    if (onChange) {
      state.subscribers.delete(onChange)
      if (state.subscribers.size > 0) return
    }

    if (state.timer) {
      clearTimeout(state.timer)
    }
    state.closed = true
    state.watcher.close()
    watchers.delete(rootPath)
  }
}
