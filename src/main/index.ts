import { app, BrowserWindow, ipcMain } from 'electron'
import { basename } from 'path'
import { electronApp } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { registerIpcHandlers } from './ipc-handlers'
import { killAllTerminals, killWindowTerminals } from './terminal'
import { refreshJumpList } from './recent-folders'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const openPath = parseOpenArg(argv)
    const win = getLastWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      if (openPath) {
        win.webContents.send('workspace:open-path', openPath)
      }
    } else {
      const newWin = createMainWindow(openPath ?? undefined)
      if (openPath) {
        newWin.setTitle(basename(openPath) + ' - Wiki Reader')
      }
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.wiki-reader.app')

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

function parseOpenArg(argv: string[]): string | null {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--open') {
      let path = argv[i + 1]
      if (path.startsWith('"') && path.endsWith('"')) {
        path = path.slice(1, -1)
      }
      return path
    }
  }
  return null
}

function getLastWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[windows.length - 1] : null
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
