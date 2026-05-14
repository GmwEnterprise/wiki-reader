import { ipcMain, BrowserWindow } from 'electron'
import { basename, dirname } from 'path'
import { stat } from 'fs/promises'
import {
  openFolderDialog,
  openFileDialog,
  scanMarkdownFiles,
  readMarkdownFile,
  readWorkspaceAsset,
  readAbsoluteImageFile,
  saveMarkdownFile,
  readFileByPath,
  saveFileByPath,
  renameItem,
  createItem,
  copyItemPath,
  revealItem,
  deleteItem,
  watchWorkspace,
  unwatchWorkspace,
  watchSingleFile,
  unwatchSingleFile
} from './workspace'
import { createTerminal, terminalWrite, terminalResize, terminalKill } from './terminal'
import { setWindowWorkspace } from './window'
import {
  addRecentFolder,
  addRecentFile,
  getRecentItems,
  removeRecentItem,
  clearRecentItems
} from './recent-folders'

const workspaceWatchCallbacks = new Map<string, () => void>()
const workspaceWatchContentCallbacks = new Map<string, (relativePath: string) => void>()
const workspaceWatchClosedHandlers = new Set<number>()
const singleFileWatchCallbacks = new Map<string, () => void>()
const singleFileWatchClosedHandlers = new Set<number>()

function getWorkspaceWatchKey(winId: number, rootPath: string): string {
  return `${winId}:${rootPath}`
}

function parseWorkspaceWatchKey(key: string): { winId: number; rootPath: string } | null {
  const separatorIndex = key.indexOf(':')
  if (separatorIndex === -1) return null

  const winId = Number(key.slice(0, separatorIndex))
  if (!Number.isFinite(winId)) return null

  return { winId, rootPath: key.slice(separatorIndex + 1) }
}

function ensureWorkspaceWatchCleanup(win: BrowserWindow): void {
  if (workspaceWatchClosedHandlers.has(win.id)) return

  workspaceWatchClosedHandlers.add(win.id)
  win.once('closed', () => {
    workspaceWatchClosedHandlers.delete(win.id)

    for (const [key, callback] of workspaceWatchCallbacks) {
      const parsedKey = parseWorkspaceWatchKey(key)
      if (!parsedKey || parsedKey.winId !== win.id) continue

      unwatchWorkspace(parsedKey.rootPath, callback, workspaceWatchContentCallbacks.get(key))
      workspaceWatchCallbacks.delete(key)
      workspaceWatchContentCallbacks.delete(key)
    }
  })
}

export function registerIpcHandlers(): void {
  ipcMain.handle('workspace:openFolder', async (event) => {
    const result = await openFolderDialog()
    if (result) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        win.setTitle(result.name + ' - Wiki Reader')
        setWindowWorkspace(win, result.rootPath)
      }
      addRecentFolder(result.rootPath, result.name)
    }
    return result
  })

  ipcMain.handle('workspace:openPath', async (event, itemPath: string) => {
    if (typeof itemPath !== 'string' || !itemPath) return null
    try {
      const s = await stat(itemPath)
      const name = basename(itemPath)
      const win = BrowserWindow.fromWebContents(event.sender)
      if (s.isDirectory()) {
        if (win) {
          win.setTitle(name + ' - Wiki Reader')
          setWindowWorkspace(win, itemPath)
        }
        addRecentFolder(itemPath, name)
        return { type: 'folder' as const, rootPath: itemPath, name }
      } else {
        if (win) {
          win.setTitle(name + ' - Wiki Reader')
        }
        addRecentFile(itemPath, name)
        return {
          type: 'file' as const,
          absolutePath: itemPath,
          name,
          dirPath: dirname(itemPath)
        }
      }
    } catch {
      return null
    }
  })

  ipcMain.handle('recent:getList', async () => {
    return getRecentItems()
  })

  ipcMain.handle('recent:remove', async (_event, itemPath: string) => {
    if (typeof itemPath !== 'string') return
    removeRecentItem(itemPath)
  })

  ipcMain.handle('recent:clear', async () => {
    clearRecentItems()
  })

  ipcMain.handle('workspace:scanFiles', async (_event, rootPath: string) => {
    return scanMarkdownFiles(rootPath)
  })

  ipcMain.handle('workspace:readFile', async (_event, rootPath: string, relativePath: string) => {
    try {
      const content = await readMarkdownFile(rootPath, relativePath)
      return { success: true, content }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('workspace:saveFile', async (_event, rootPath: string, relativePath: string, content: string) => {
    try {
      await saveMarkdownFile(rootPath, relativePath, content)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('workspace:readAsset', async (_event, rootPath: string, relativePath: string) => {
    try {
      const result = await readWorkspaceAsset(rootPath, relativePath)
      return { success: true, buffer: result.buffer, mimeType: result.mimeType }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('workspace:readAbsoluteAsset', async (_event, absolutePath: string) => {
    try {
      const result = await readAbsoluteImageFile(absolutePath)
      return { success: true, buffer: result.buffer, mimeType: result.mimeType }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle(
    'workspace:renameItem',
    async (_event, rootPath: string, relativePath: string, newName: string) => {
      if (typeof rootPath !== 'string' || typeof relativePath !== 'string' || typeof newName !== 'string') {
        return { success: false, error: '参数不合法' }
      }
      return renameItem(rootPath, relativePath, newName)
    }
  )

  ipcMain.handle(
    'workspace:deleteItem',
    async (_event, rootPath: string, relativePath: string) => {
      if (typeof rootPath !== 'string' || typeof relativePath !== 'string') {
        return { success: false, error: '参数不合法' }
      }
      return deleteItem(rootPath, relativePath)
    }
  )

  ipcMain.handle(
    'workspace:createItem',
    async (_event, rootPath: string, parentRelativePath: string, name: string, type: 'file' | 'folder') => {
      if (
        typeof rootPath !== 'string' ||
        typeof parentRelativePath !== 'string' ||
        typeof name !== 'string' ||
        (type !== 'file' && type !== 'folder')
      ) {
        return { success: false, error: '参数不合法' }
      }
      return createItem(rootPath, parentRelativePath, name, type)
    }
  )

  ipcMain.handle(
    'workspace:copyItemPath',
    async (_event, rootPath: string, relativePath: string, pathType: 'absolute' | 'relative') => {
      if (
        typeof rootPath !== 'string' ||
        typeof relativePath !== 'string' ||
        (pathType !== 'absolute' && pathType !== 'relative')
      ) {
        return { success: false, error: '参数不合法' }
      }
      return copyItemPath(rootPath, relativePath, pathType)
    }
  )

  ipcMain.handle(
    'workspace:revealItem',
    async (_event, rootPath: string, relativePath: string) => {
      if (typeof rootPath !== 'string' || typeof relativePath !== 'string') {
        return { success: false, error: '参数不合法' }
      }
      return revealItem(rootPath, relativePath)
    }
  )

  ipcMain.handle('workspace:watch', (event, rootPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    ensureWorkspaceWatchCleanup(win)

    const key = getWorkspaceWatchKey(win.id, rootPath)
    const existingCallback = workspaceWatchCallbacks.get(key)
    if (existingCallback) {
      unwatchWorkspace(rootPath, existingCallback, workspaceWatchContentCallbacks.get(key))
    }

    const callback = (): void => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('workspace:filesChanged')
      }
    }

    const contentCallback = (relativePath: string): void => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('workspace:fileContentChanged', relativePath)
      }
    }

    workspaceWatchCallbacks.set(key, callback)
    workspaceWatchContentCallbacks.set(key, contentCallback)
    watchWorkspace(rootPath, callback, contentCallback)
  })

  ipcMain.handle('workspace:unwatch', (event, rootPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const key = getWorkspaceWatchKey(win.id, rootPath)
    const callback = workspaceWatchCallbacks.get(key)
    if (!callback) return

    unwatchWorkspace(rootPath, callback, workspaceWatchContentCallbacks.get(key))
    workspaceWatchCallbacks.delete(key)
    workspaceWatchContentCallbacks.delete(key)
  })

  ipcMain.handle('workspace:openFileDialog', async (event) => {
    const result = await openFileDialog()
    if (result) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        win.setTitle(result.name + ' - Wiki Reader')
      }
      addRecentFile(result.absolutePath, result.name)
    }
    return result
  })

  ipcMain.handle('workspace:readFileByPath', async (_event, absolutePath: string) => {
    if (typeof absolutePath !== 'string' || !absolutePath) {
      return { success: false, error: '参数不合法' }
    }
    try {
      const content = await readFileByPath(absolutePath)
      return { success: true, content }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('workspace:saveFileByPath', async (_event, absolutePath: string, content: string) => {
    if (typeof absolutePath !== 'string' || !absolutePath || typeof content !== 'string') {
      return { success: false, error: '参数不合法' }
    }
    try {
      await saveFileByPath(absolutePath, content)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('workspace:watchFile', (event, absolutePath: string) => {
    if (typeof absolutePath !== 'string' || !absolutePath) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    if (!singleFileWatchClosedHandlers.has(win.id)) {
      singleFileWatchClosedHandlers.add(win.id)
      win.once('closed', () => {
        singleFileWatchClosedHandlers.delete(win.id)
        for (const [path, callback] of singleFileWatchCallbacks) {
          unwatchSingleFile(path, callback)
        }
        singleFileWatchCallbacks.clear()
      })
    }

    const existingCallback = singleFileWatchCallbacks.get(absolutePath)
    if (existingCallback) {
      unwatchSingleFile(absolutePath, existingCallback)
    }

    const callback = (): void => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('workspace:singleFileContentChanged')
      }
    }

    singleFileWatchCallbacks.set(absolutePath, callback)
    watchSingleFile(absolutePath, callback)
  })

  ipcMain.handle('workspace:unwatchFile', (_event, absolutePath: string) => {
    if (typeof absolutePath !== 'string' || !absolutePath) return
    const callback = singleFileWatchCallbacks.get(absolutePath)
    if (!callback) return
    unwatchSingleFile(absolutePath, callback)
    singleFileWatchCallbacks.delete(absolutePath)
  })

  ipcMain.handle('terminal:create', (event, id: number, cwd: string | null) => {
    if (typeof id !== 'number' || (cwd !== null && typeof cwd !== 'string')) return null
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { error: '窗口不存在' }
    return createTerminal(win, cwd, id)
  })

  ipcMain.on('terminal:write', (event, id: number, data: string) => {
    if (typeof id !== 'number' || typeof data !== 'string') return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    terminalWrite(win.id, id, data)
  })

  ipcMain.on('terminal:resize', (event, id: number, cols: number, rows: number) => {
    if (typeof id !== 'number' || typeof cols !== 'number' || typeof rows !== 'number') return
    if (cols <= 0 || rows <= 0) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    terminalResize(win.id, id, cols, rows)
  })

  ipcMain.handle('terminal:kill', (event, id: number) => {
    if (typeof id !== 'number') return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    terminalKill(win.id, id)
  })
}
