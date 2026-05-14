import { clipboard, dialog, shell } from 'electron'
import { readdir, stat, readFile, writeFile, rename, unlink, rm, mkdir } from 'fs/promises'
import { join, extname, basename, relative, normalize, sep, dirname } from 'path'
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
  contentSubscribers: Set<(relativePath: string) => void>
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
      const s = await stat(fullPath)
      files.push({
        relativePath: relative(rootPath, fullPath),
        name: entry.name,
        mtimeMs: s.mtimeMs,
        size: 0,
        isDirectory: true
      })
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

export async function readWorkspaceAsset(
  rootPath: string,
  relativePath: string
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const fullPath = join(rootPath, relativePath)
  const resolved = await validatePath(rootPath, fullPath)
  if (!resolved) throw new Error(`路径不合法: ${relativePath}`)

  const mimeType = IMAGE_MIME_TYPES.get(extname(relativePath).toLowerCase())
  if (!mimeType) throw new Error(`不支持的图片类型: ${relativePath}`)

  const buf = await readFile(fullPath)
  const buffer = new ArrayBuffer(buf.byteLength)
  new Uint8Array(buffer).set(buf)
  return { buffer, mimeType }
}

export async function readAbsoluteImageFile(
  absolutePath: string
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const normalizedPath = normalize(absolutePath)
  const ext = extname(normalizedPath).toLowerCase()
  const mimeType = IMAGE_MIME_TYPES.get(ext)
  if (!mimeType) throw new Error(`不支持的图片类型: ${ext}`)

  const buf = await readFile(normalizedPath)
  const buffer = new ArrayBuffer(buf.byteLength)
  new Uint8Array(buffer).set(buf)
  return { buffer, mimeType }
}

export async function validatePath(rootPath: string, targetPath: string): Promise<boolean> {
  const normalizedTarget = normalize(targetPath)
  const normalizedRoot = normalize(rootPath)
  return normalizedTarget.startsWith(normalizedRoot + sep) || normalizedTarget === normalizedRoot
}

export async function renameItem(
  rootPath: string,
  relativePath: string,
  newName: string
): Promise<{ success: boolean; newRelativePath?: string; error?: string }> {
  const fullPath = join(rootPath, relativePath)
  const valid = await validatePath(rootPath, fullPath)
  if (!valid) return { success: false, error: '路径不合法' }

  if (
    !newName ||
    newName.includes('/') ||
    newName.includes('\\') ||
    newName.includes(':')
  ) {
    return { success: false, error: '文件名不合法' }
  }

  const parentDir = dirname(relativePath)
  const newRelativePath = parentDir ? parentDir + '/' + newName : newName
  const newFullPath = join(rootPath, newRelativePath)
  const newValid = await validatePath(rootPath, newFullPath)
  if (!newValid) return { success: false, error: '新路径不合法' }

  try {
    await rename(fullPath, newFullPath)
    return { success: true, newRelativePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

function isInvalidItemName(name: string): boolean {
  return !name || name.includes('/') || name.includes('\\') || name.includes(':')
}

function normalizeMarkdownFileName(name: string): string {
  const ext = extname(name).toLowerCase()
  if (MD_EXTENSIONS.has(ext)) return name
  return name + '.md'
}

export async function createItem(
  rootPath: string,
  parentRelativePath: string,
  name: string,
  type: 'file' | 'folder'
): Promise<{ success: boolean; newRelativePath?: string; error?: string }> {
  const parentFullPath = join(rootPath, parentRelativePath)
  const parentValid = await validatePath(rootPath, parentFullPath)
  if (!parentValid) return { success: false, error: '路径不合法' }

  const itemName = type === 'file' ? normalizeMarkdownFileName(name.trim()) : name.trim()
  if (isInvalidItemName(itemName)) return { success: false, error: '名称不合法' }

  const newRelativePath = parentRelativePath ? parentRelativePath + '/' + itemName : itemName
  const fullPath = join(rootPath, newRelativePath)
  const valid = await validatePath(rootPath, fullPath)
  if (!valid) return { success: false, error: '新路径不合法' }

  try {
    if (type === 'folder') {
      await mkdir(fullPath)
    } else {
      await writeFile(fullPath, '', { encoding: 'utf-8', flag: 'wx' })
    }
    return { success: true, newRelativePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function copyItemPath(
  rootPath: string,
  relativePath: string,
  pathType: 'absolute' | 'relative'
): Promise<{ success: boolean; error?: string }> {
  const fullPath = join(rootPath, relativePath)
  const valid = await validatePath(rootPath, fullPath)
  if (!valid) return { success: false, error: '路径不合法' }

  clipboard.writeText(pathType === 'absolute' ? fullPath : relativePath)
  return { success: true }
}

export async function revealItem(
  rootPath: string,
  relativePath: string
): Promise<{ success: boolean; error?: string }> {
  const fullPath = join(rootPath, relativePath)
  const valid = await validatePath(rootPath, fullPath)
  if (!valid) return { success: false, error: '路径不合法' }

  shell.showItemInFolder(fullPath)
  return { success: true }
}

export async function deleteItem(
  rootPath: string,
  relativePath: string
): Promise<{ success: boolean; error?: string }> {
  const fullPath = join(rootPath, relativePath)
  const valid = await validatePath(rootPath, fullPath)
  if (!valid) return { success: false, error: '路径不合法' }

  try {
    const s = await stat(fullPath)
    if (s.isDirectory()) {
      await rm(fullPath, { recursive: true })
    } else {
      await unlink(fullPath)
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export function watchWorkspace(
  rootPath: string,
  onChange: () => void,
  onContentChange?: (relativePath: string) => void
): void {
  const existingState = watchers.get(rootPath)
  if (existingState && !existingState.closed) {
    existingState.subscribers.add(onChange)
    if (onContentChange) existingState.contentSubscribers.add(onContentChange)
    return
  }

  const watcher = chokidar.watch(['**/*.md', '**/*.markdown', '**/*/'], {
    cwd: rootPath,
    ignored: ['**/node_modules/**', '**/.git/**', '**/.*'],
    ignoreInitial: true
  })
  const state: WatchState = {
    watcher,
    timer: null,
    structureChanged: false,
    subscribers: new Set([onChange]),
    contentSubscribers: new Set(onContentChange ? [onContentChange] : []),
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
  watcher.on('addDir', () => scheduleChange(true))
  watcher.on('unlinkDir', () => scheduleChange(true))
  watcher.on('change', (changedPath: string) => {
    scheduleChange(false)
    if (state.contentSubscribers.size > 0) {
      const relativePath = relative(rootPath, join(rootPath, changedPath))
      for (const subscriber of state.contentSubscribers) {
        subscriber(relativePath)
      }
    }
  })

  watchers.set(rootPath, state)
}

export function unwatchWorkspace(
  rootPath: string,
  onChange?: () => void,
  onContentChange?: (relativePath: string) => void
): void {
  const state = watchers.get(rootPath)
  if (state) {
    if (onChange) {
      state.subscribers.delete(onChange)
    }
    if (onContentChange) {
      state.contentSubscribers.delete(onContentChange)
    }
    if (state.subscribers.size > 0 || state.contentSubscribers.size > 0) return

    if (state.timer) {
      clearTimeout(state.timer)
    }
    state.closed = true
    state.watcher.close()
    watchers.delete(rootPath)
  }
}

export async function openFileDialog(): Promise<{ absolutePath: string; name: string; dirPath: string } | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const absolutePath = result.filePaths[0]
  return {
    absolutePath,
    name: basename(absolutePath),
    dirPath: dirname(absolutePath)
  }
}

export async function readFileByPath(absolutePath: string): Promise<string> {
  const normalizedPath = normalize(absolutePath)
  return readFile(normalizedPath, 'utf-8')
}

export async function saveFileByPath(absolutePath: string, content: string): Promise<void> {
  const normalizedPath = normalize(absolutePath)
  const ext = extname(normalizedPath).toLowerCase()
  if (!MD_EXTENSIONS.has(ext)) throw new Error(`不是 Markdown 文件: ${normalizedPath}`)
  await writeFile(normalizedPath, content, 'utf-8')
}

type SingleFileWatchState = {
  watcher: FSWatcher
  subscribers: Set<() => void>
  closed: boolean
}

const singleFileWatchers = new Map<string, SingleFileWatchState>()

export function watchSingleFile(
  absolutePath: string,
  onChange: () => void
): void {
  const normalizedPath = normalize(absolutePath)
  const existing = singleFileWatchers.get(normalizedPath)
  if (existing && !existing.closed) {
    existing.subscribers.add(onChange)
    return
  }

  const watcher = chokidar.watch(normalizedPath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  })

  const state: SingleFileWatchState = {
    watcher,
    subscribers: new Set([onChange]),
    closed: false
  }

  watcher.on('change', () => {
    if (state.closed) return
    for (const subscriber of state.subscribers) {
      subscriber()
    }
  })

  singleFileWatchers.set(normalizedPath, state)
}

export function unwatchSingleFile(
  absolutePath: string,
  onChange?: () => void
): void {
  const normalizedPath = normalize(absolutePath)
  const state = singleFileWatchers.get(normalizedPath)
  if (!state) return

  if (onChange) {
    state.subscribers.delete(onChange)
  }
  if (state.subscribers.size > 0) return

  state.closed = true
  state.watcher.close()
  singleFileWatchers.delete(normalizedPath)
}
