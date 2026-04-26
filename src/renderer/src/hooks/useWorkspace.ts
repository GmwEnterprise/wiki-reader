import { useState, useCallback, useEffect, useRef } from 'react'
import type { Workspace, WikiFile } from '../types'

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [files, setFiles] = useState<WikiFile[]>([])
  const scanSeqRef = useRef(0)
  const openSeqRef = useRef(0)
  const activeRootRef = useRef<string | null>(null)

  const refreshFiles = useCallback(async (rootPath: string) => {
    if (activeRootRef.current !== rootPath) return

    const scanSeq = scanSeqRef.current + 1
    scanSeqRef.current = scanSeq
    const scannedFiles = await window.api.scanFiles(rootPath)
    if (scanSeq === scanSeqRef.current && activeRootRef.current === rootPath) {
      setFiles(scannedFiles)
    }
  }, [])

  const openFolder = useCallback(async () => {
    const result = await window.api.openFolder()
    if (!result) return

    const openSeq = openSeqRef.current + 1
    openSeqRef.current = openSeq

    const ws: Workspace = {
      id: result.rootPath,
      rootPath: result.rootPath,
      name: result.name
    }
    activeRootRef.current = result.rootPath
    setWorkspace(ws)

    await refreshFiles(result.rootPath)

    if (openSeq === openSeqRef.current) {
      window.api.watchWorkspace(result.rootPath)
    }
  }, [refreshFiles])

  const openRecentFolder = useCallback(async (folderPath: string) => {
    const result = await window.api.openPath(folderPath)
    if (!result) return

    const openSeq = openSeqRef.current + 1
    openSeqRef.current = openSeq

    const ws: Workspace = {
      id: result.rootPath,
      rootPath: result.rootPath,
      name: result.name
    }
    activeRootRef.current = result.rootPath
    setWorkspace(ws)

    await refreshFiles(result.rootPath)

    if (openSeq === openSeqRef.current) {
      window.api.watchWorkspace(result.rootPath)
    }
  }, [refreshFiles])

  const closeWorkspace = useCallback(() => {
    scanSeqRef.current += 1
    openSeqRef.current += 1
    activeRootRef.current = null
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
