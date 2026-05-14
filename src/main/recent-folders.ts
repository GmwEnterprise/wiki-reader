import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

export type RecentItem = {
  path: string
  name: string
  type: 'file' | 'folder'
  lastAccessed: number
}

const MAX_RECENT = 15
const STORAGE_FILE = join(app.getPath('userData'), 'recent-folders.json')

function readFromDisk(): RecentItem[] {
  if (!existsSync(STORAGE_FILE)) return []
  try {
    const data = readFileSync(STORAGE_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item: any) => ({
      path: item.path,
      name: item.name,
      type: item.type === 'file' ? 'file' : 'folder',
      lastAccessed: item.lastAccessed ?? 0
    }))
  } catch {
    return []
  }
}

function writeToDisk(items: RecentItem[]): void {
  try {
    writeFileSync(STORAGE_FILE, JSON.stringify(items, null, 2), 'utf-8')
  } catch {
    // 写入失败不阻塞主流程
  }
}

export function addRecentFolder(folderPath: string, folderName: string): void {
  if (!isValidRecentPath(folderPath)) return

  let items = readFromDisk()
  items = items.filter((f) => f.path !== folderPath)
  items.unshift({
    path: folderPath,
    name: folderName,
    type: 'folder',
    lastAccessed: Date.now()
  })
  if (items.length > MAX_RECENT) {
    items = items.slice(0, MAX_RECENT)
  }
  writeToDisk(items)
  refreshJumpList()
}

export function addRecentFile(filePath: string, fileName: string): void {
  if (!isValidRecentPath(filePath)) return

  let items = readFromDisk()
  items = items.filter((f) => f.path !== filePath)
  items.unshift({
    path: filePath,
    name: fileName,
    type: 'file',
    lastAccessed: Date.now()
  })
  if (items.length > MAX_RECENT) {
    items = items.slice(0, MAX_RECENT)
  }
  writeToDisk(items)
  refreshJumpList()
}

export function getRecentItems(): RecentItem[] {
  return readFromDisk().filter((f) => isValidRecentPath(f.path))
}

export function removeRecentItem(itemPath: string): void {
  let items = readFromDisk()
  items = items.filter((f) => f.path !== itemPath)
  writeToDisk(items)
  refreshJumpList()
}

export function clearRecentItems(): void {
  writeToDisk([])
  app.clearRecentDocuments()
  refreshJumpList()
}

export function refreshJumpList(): void {
  if (process.platform !== 'win32') return

  app.clearRecentDocuments()

  const items = getRecentItems().slice(0, 10)

  app.setJumpList([
    {
      name: '最近打开',
      items: items.map((f) => ({
        type: 'task' as const,
        program: process.execPath,
        args: `--open "${f.path}"`,
        title: f.name,
        description: f.path,
        iconPath: f.type === 'folder'
          ? process.execPath
          : process.execPath,
        iconIndex: f.type === 'folder' ? 0 : 0
      }))
    }
  ])
}

function isValidRecentPath(itemPath: string): boolean {
  return typeof itemPath === 'string' && itemPath.length > 0 && !itemPath.startsWith('--')
}

export const getRecentFolders = getRecentItems
export const removeRecentFolder = removeRecentItem
export const clearRecentFolders = clearRecentItems
