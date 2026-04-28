/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    api: {
      windowControls: {
        minimize: () => void
        toggleMaximize: () => void
        close: () => void
        onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void
      }
      openFolder: () => Promise<{ rootPath: string; name: string } | null>
      scanFiles: (rootPath: string) => Promise<import('./types').WikiFile[]>
      readFile: (
        rootPath: string,
        relativePath: string
      ) => Promise<{ success: boolean; content?: string; error?: string }>
      saveFile: (
        rootPath: string,
        relativePath: string,
        content: string
      ) => Promise<{ success: boolean; error?: string }>
      readAsset: (
        rootPath: string,
        relativePath: string
      ) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
      readAbsoluteAsset: (
        absolutePath: string
      ) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
      watchWorkspace: (rootPath: string) => Promise<void>
      unwatchWorkspace: (rootPath: string) => Promise<void>
      onFilesChanged: (callback: () => void) => () => void
      onBeforeClose: (callback: () => void) => () => void
      confirmClose: () => void
      onMenuOpenFolder: (callback: () => void) => () => void
      onMenuToggleMode: (callback: () => void) => () => void
      newWindow: () => void
      closeWorkspace: () => void
      quitApp: () => void
      getInitialOpenPath: () => string | null
      openPath: (folderPath: string) => Promise<{ rootPath: string; name: string } | null>
      getRecentFolders: () => Promise<Array<{ path: string; name: string; lastAccessed: number }>>
      removeRecentFolder: (folderPath: string) => Promise<void>
      clearRecentFolders: () => Promise<void>
      onOpenPath: (callback: (path: string) => void) => () => void
      terminalCreate: (id: number, cwd: string | null) => Promise<{ error?: string; processName?: string } | null>
      terminalWrite: (id: number, data: string) => Promise<boolean>
      terminalResize: (id: number, cols: number, rows: number) => void
      terminalKill: (id: number) => Promise<void>
      onTerminalData: (id: number, callback: (data: string) => void) => () => void
      onTerminalExit: (id: number, callback: (exitCode: number) => void) => () => void
      onTerminalError: (id: number, callback: (error: string) => void) => () => void
    }
  }
}
