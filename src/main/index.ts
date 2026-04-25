import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { registerIpcHandlers } from './ipc-handlers'
import { killAllTerminals } from './terminal'

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
  createMainWindow()
})

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

app.on('window-all-closed', () => {
  killAllTerminals()
  app.quit()
})
