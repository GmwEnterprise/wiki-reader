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
      readAsset: (
        rootPath: string,
        relativePath: string
      ) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
      watchWorkspace: (rootPath: string) => Promise<void>
      unwatchWorkspace: (rootPath: string) => Promise<void>
      onFilesChanged: (callback: () => void) => () => void
    }
  }
}
