import { ipcMain, BrowserWindow } from 'electron'
import {
  openFolderDialog,
  scanMarkdownFiles,
  readMarkdownFile,
  readWorkspaceAsset,
  readAbsoluteImageFile,
  saveMarkdownFile,
  watchWorkspace,
  unwatchWorkspace
} from './workspace'

export function registerIpcHandlers(): void {
  ipcMain.handle('workspace:openFolder', async () => {
    return openFolderDialog()
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
      const dataUrl = await readWorkspaceAsset(rootPath, relativePath)
      return { success: true, dataUrl }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('workspace:readAbsoluteAsset', async (_event, absolutePath: string) => {
    try {
      const dataUrl = await readAbsoluteImageFile(absolutePath)
      return { success: true, dataUrl }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('workspace:watch', (event, rootPath: string) => {
    watchWorkspace(rootPath, () => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        win.webContents.send('workspace:filesChanged')
      }
    })
  })

  ipcMain.handle('workspace:unwatch', (_event, rootPath: string) => {
    unwatchWorkspace(rootPath)
  })
}
