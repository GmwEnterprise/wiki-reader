import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
  confirmClose: () => ipcRenderer.send('window:confirm-close')
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
