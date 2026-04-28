import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { getInitialOpenPathFromArgv } from './initial-open-path'

const api = {
  windowControls: {
    minimize: (): void => ipcRenderer.send('window:minimize'),
    toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
    close: (): void => ipcRenderer.send('window:close'),
    onMaximizedChanged: (callback: (maximized: boolean) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        callback(maximized)
      }
      ipcRenderer.on('window:maximized-changed', handler)
      return () => ipcRenderer.removeListener('window:maximized-changed', handler)
    }
  },
  openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
  scanFiles: (rootPath: string) => ipcRenderer.invoke('workspace:scanFiles', rootPath),
  readFile: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('workspace:readFile', rootPath, relativePath),
  saveFile: (rootPath: string, relativePath: string, content: string) =>
    ipcRenderer.invoke('workspace:saveFile', rootPath, relativePath, content),
  readAsset: (rootPath: string, relativePath: string) =>
    ipcRenderer.invoke('workspace:readAsset', rootPath, relativePath),
  readAbsoluteAsset: (absolutePath: string) =>
    ipcRenderer.invoke('workspace:readAbsoluteAsset', absolutePath),
  watchWorkspace: (rootPath: string) => ipcRenderer.invoke('workspace:watch', rootPath),
  unwatchWorkspace: (rootPath: string) => ipcRenderer.invoke('workspace:unwatch', rootPath),
  onFilesChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('workspace:filesChanged', handler)
    return () => ipcRenderer.removeListener('workspace:filesChanged', handler)
  },
  onBeforeClose: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('window:before-close', handler)
    return () => ipcRenderer.removeListener('window:before-close', handler)
  },
  confirmClose: () => ipcRenderer.send('window:confirm-close'),
  onMenuOpenFolder: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:openFolder', handler)
    return () => ipcRenderer.removeListener('menu:openFolder', handler)
  },
  onMenuToggleMode: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('menu:toggleMode', handler)
    return () => ipcRenderer.removeListener('menu:toggleMode', handler)
  },
  newWindow: () => ipcRenderer.send('window:new-window'),
  closeWorkspace: () => ipcRenderer.send('window:close-workspace'),
  quitApp: () => ipcRenderer.send('window:quit'),
  getInitialOpenPath: () => getInitialOpenPathFromArgv(process.argv),
  openPath: (folderPath: string) => ipcRenderer.invoke('workspace:openPath', folderPath),
  getRecentFolders: () => ipcRenderer.invoke('recent:getList'),
  removeRecentFolder: (folderPath: string) => ipcRenderer.invoke('recent:remove', folderPath),
  clearRecentFolders: () => ipcRenderer.invoke('recent:clear'),
  onOpenPath: (callback: (path: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string): void => {
      callback(path)
    }
    ipcRenderer.on('workspace:open-path', handler)
    return () => ipcRenderer.removeListener('workspace:open-path', handler)
  },
  terminalCreate: (id: number, cwd: string | null) =>
    ipcRenderer.invoke('terminal:create', id, cwd),
  terminalWrite: (id: number, data: string) =>
    ipcRenderer.invoke('terminal:write', id, data) as Promise<boolean>,
  terminalResize: (id: number, cols: number, rows: number) =>
    ipcRenderer.send('terminal:resize', id, cols, rows),
  terminalKill: (id: number) =>
    ipcRenderer.invoke('terminal:kill', id),
  onTerminalData: (id: number, callback: (data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, terminalId: number, data: string): void => {
      if (terminalId === id) callback(data)
    }
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.removeListener('terminal:data', handler)
  },
  onTerminalExit: (id: number, callback: (exitCode: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, terminalId: number, exitCode: number): void => {
      if (terminalId === id) callback(exitCode)
    }
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.removeListener('terminal:exit', handler)
  },
  onTerminalError: (id: number, callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, terminalId: number, error: string): void => {
      if (terminalId === id) callback(error)
    }
    ipcRenderer.on('terminal:error', handler)
    return () => ipcRenderer.removeListener('terminal:error', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
