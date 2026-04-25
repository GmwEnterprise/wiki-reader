import { useState, useCallback, useEffect } from 'react'
import type { Workspace, WikiFile } from '../types'

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [files, setFiles] = useState<WikiFile[]>([])

  const refreshFiles = useCallback(async (rootPath: string) => {
    const scannedFiles = await window.api.scanFiles(rootPath)
    setFiles(scannedFiles)
  }, [])

  const openFolder = useCallback(async () => {
    const result = await window.api.openFolder()
    if (!result) return

    const ws: Workspace = {
      id: result.rootPath,
      rootPath: result.rootPath,
      name: result.name
    }
    setWorkspace(ws)

    const scannedFiles = await window.api.scanFiles(result.rootPath)
    setFiles(scannedFiles)

    window.api.watchWorkspace(result.rootPath)
  }, [])

  const openRecentFolder = useCallback(async (folderPath: string) => {
    const result = await window.api.openPath(folderPath)
    if (!result) return

    const ws: Workspace = {
      id: result.rootPath,
      rootPath: result.rootPath,
      name: result.name
    }
    setWorkspace(ws)

    const scannedFiles = await window.api.scanFiles(result.rootPath)
    setFiles(scannedFiles)

    window.api.watchWorkspace(result.rootPath)
  }, [])

  const closeWorkspace = useCallback(() => {
    setWorkspace(null)
    setFiles([])
  }, [])

  useEffect(() => {
    if (!workspace) return
    const unsubscribe = window.api.onFilesChanged(() => {
      refreshFiles(workspace.rootPath)
    })
    return () => {
      unsubscribe()
      window.api.unwatchWorkspace(workspace.rootPath)
    }
  }, [workspace, refreshFiles])

  return { workspace, files, openFolder, openRecentFolder, closeWorkspace }
}
