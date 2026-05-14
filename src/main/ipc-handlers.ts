import { ipcMain, BrowserWindow } from 'electron'
import { basename } from 'path'
import {
  openFolderDialog,
  scanMarkdownFiles,
  readMarkdownFile,
  readWorkspaceAsset,
  readAbsoluteImageFile,
  saveMarkdownFile,
  renameItem,
  createItem,
  copyItemPath,
  revealItem,
  deleteItem,
  watchWorkspace,
  unwatchWorkspace
} from './workspace'
import { createTerminal, terminalWrite, terminalResize, terminalKill } from './terminal'
import { setWindowWorkspace } from './window'
import {
  addRecentFolder,
  getRecentFolders,
  removeRecentFolder,
  clearRecentFolders
} from './recent-folders'

const workspaceWatchCallbacks = new Map<string, () => void>()
const workspaceWatchContentCallbacks = new Map<string, (relativePath: string) => void>()
const workspaceWatchClosedHandlers = new Set<number>()

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

  ipcMain.handle('workspace:openPath', async (event, folderPath: string) => {
    if (typeof folderPath !== 'string' || !folderPath) return null
    const name = basename(folderPath)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      win.setTitle(name + ' - Wiki Reader')
      setWindowWorkspace(win, folderPath)
    }
    addRecentFolder(folderPath, name)
    return { rootPath: folderPath, name }
  })

  ipcMain.handle('recent:getList', async () => {
    return getRecentFolders()
  })

  ipcMain.handle('recent:remove', async (_event, folderPath: string) => {
    if (typeof folderPath !== 'string') return
    removeRecentFolder(folderPath)
  })

  ipcMain.handle('recent:clear', async () => {
    clearRecentFolders()
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
