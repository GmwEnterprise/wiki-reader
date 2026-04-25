import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

export type RecentFolder = {
  path: string
  name: string
  lastAccessed: number
}

const MAX_RECENT = 15
const STORAGE_FILE = join(app.getPath('userData'), 'recent-folders.json')

function readFromDisk(): RecentFolder[] {
  if (!existsSync(STORAGE_FILE)) return []
  try {
    const data = readFileSync(STORAGE_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function writeToDisk(folders: RecentFolder[]): void {
  try {
    writeFileSync(STORAGE_FILE, JSON.stringify(folders, null, 2), 'utf-8')
  } catch {
    // 写入失败不阻塞主流程
  }
}

export function addRecentFolder(folderPath: string, folderName: string): void {
  let folders = readFromDisk()
  folders = folders.filter((f) => f.path !== folderPath)
  folders.unshift({
    path: folderPath,
    name: folderName,
    lastAccessed: Date.now()
  })
  if (folders.length > MAX_RECENT) {
    folders = folders.slice(0, MAX_RECENT)
  }
  writeToDisk(folders)
  app.addRecentDocument(folderPath)
  refreshJumpList()
}

export function getRecentFolders(): RecentFolder[] {
  return readFromDisk()
}

export function removeRecentFolder(folderPath: string): void {
  let folders = readFromDisk()
  folders = folders.filter((f) => f.path !== folderPath)
  writeToDisk(folders)
  refreshJumpList()
}

export function clearRecentFolders(): void {
  writeToDisk([])
  app.clearRecentDocuments()
  refreshJumpList()
}

export function refreshJumpList(): void {
  if (process.platform !== 'win32') return

  const folders = getRecentFolders().slice(0, 10)

  app.setJumpList([
    {
      name: '最近打开',
      items: folders.map((f) => ({
        type: 'task' as const,
        program: process.execPath,
        args: `--open "${f.path}"`,
        title: f.name,
        description: f.path
      }))
    }
  ])
}
