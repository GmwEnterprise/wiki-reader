import { useState, useCallback, useEffect } from 'react'
import type { Workspace, WikiFile, DocumentState } from '../types'

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [files, setFiles] = useState<WikiFile[]>([])
  const [doc, setDoc] = useState<DocumentState>({
    file: null,
    content: '',
    mode: 'preview',
    dirty: false
  })

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
    setDoc({ file: null, content: '', mode: 'preview', dirty: false })

    window.api.watchWorkspace(result.rootPath)
  }, [])

  const openFile = useCallback(
    async (file: WikiFile) => {
      if (!workspace) return
      if (doc.dirty && doc.file) {
        const confirmed = window.confirm('当前文件有未保存的修改，是否放弃？')
        if (!confirmed) return
      }

      const result = await window.api.readFile(workspace.rootPath, file.relativePath)
      if (result.success && result.content !== undefined) {
        setDoc({ file, content: result.content, mode: 'preview', dirty: false })
      } else {
        setDoc({ file, content: `读取失败: ${result.error}`, mode: 'preview', dirty: false })
      }
    },
    [workspace, doc]
  )

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

  return { workspace, files, doc, setDoc, openFolder, openFile }
}
