import { app, BrowserWindow, ipcMain } from 'electron'
import { basename } from 'path'
import { electronApp } from '@electron-toolkit/utils'
import { createMainWindow, clearWindowWorkspace } from './window'
import { registerIpcHandlers } from './ipc-handlers'
import { killAllTerminals, killWindowTerminals } from './terminal'
import { refreshJumpList } from './recent-folders'
import { parseOpenArg } from './open-args'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const openPath = parseOpenArg(argv)
    const newWin = createMainWindow(openPath ?? undefined)
    if (openPath) {
      newWin.setTitle(basename(openPath) + ' - Wiki Reader')
    }
  })

  electronApp.setAppUserModelId('com.wiki-reader.app')

  app.whenReady().then(() => {
    app.on('browser-window-created', (_, window) => {
      window.on('maximize', () => {
        window.webContents.send('window:maximized-changed', true)
      })
      window.on('unmaximize', () => {
        window.webContents.send('window:maximized-changed', false)
      })
    })

    registerIpcHandlers()
    refreshJumpList()

    const openPath = parseOpenArg(process.argv)
    createMainWindow(openPath ?? undefined)
  })
}

ipcMain.on('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return

  if (win.isMaximized()) {
    win.unmaximize()
  } else {
    win.maximize()
  }
})

ipcMain.on('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.on('window:confirm-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.destroy()
})

ipcMain.on('window:new-window', () => {
  createMainWindow()
})

ipcMain.on('window:close-workspace', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    killWindowTerminals(win.id)
    win.setTitle('Wiki Reader')
    clearWindowWorkspace(win)
  }
})

ipcMain.on('window:quit', () => {
  killAllTerminals()
  app.quit()
})

app.on('window-all-closed', () => {
  killAllTerminals()
  app.quit()
})
