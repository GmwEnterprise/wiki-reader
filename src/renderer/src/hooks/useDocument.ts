import { useState, useCallback, useRef } from 'react'
import type { WikiFile, DocumentState } from '../types'

const AUTO_SAVE_DELAY = 1000

export function useDocument(workspaceRootPath: string | null) {
  const [doc, setDoc] = useState<DocumentState>({
    file: null,
    content: '',
    originalContent: '',
    mode: 'preview',
    dirty: false,
    loading: false
  })
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const loadSeqRef = useRef(0)

  const saveCurrentDoc = useCallback(async () => {
    const current = docRef.current
    if (!current.file || !workspaceRootPath || !current.dirty) return
    const savedContent = current.content
    const result = await window.api.saveFile(
      workspaceRootPath,
      current.file.relativePath,
      savedContent
    )
    if (result.success) {
      setDoc((prev) => ({
        ...prev,
        originalContent: savedContent,
        dirty: prev.content !== savedContent
      }))
    }
  }, [workspaceRootPath])

  const cancelAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
  }, [])

  const loadContent = useCallback(
    async (file: WikiFile) => {
      if (!workspaceRootPath) return
      const seq = ++loadSeqRef.current
      cancelAutoSave()
      await saveCurrentDoc()
      if (seq !== loadSeqRef.current) return
      setDoc((prev) => ({ ...prev, loading: true }))
      const result = await window.api.readFile(workspaceRootPath, file.relativePath)
      if (seq !== loadSeqRef.current) return
      if (result.success && result.content !== undefined) {
        setDoc({
          file,
          content: result.content,
          originalContent: result.content,
          mode: 'preview',
          dirty: false,
          loading: false
        })
      } else {
        setDoc({
          file,
          content: `读取失败: ${result.error}`,
          originalContent: '',
          mode: 'preview',
          dirty: false,
          loading: false
        })
      }
    },
    [workspaceRootPath, saveCurrentDoc, cancelAutoSave]
  )

  const updateContent = useCallback(
    (newContent: string) => {
      setDoc((prev) => ({
        ...prev,
        content: newContent,
        dirty: newContent !== prev.originalContent
      }))
      cancelAutoSave()
      autoSaveTimerRef.current = setTimeout(() => {
        saveCurrentDoc()
      }, AUTO_SAVE_DELAY)
    },
    [saveCurrentDoc, cancelAutoSave]
  )

  const flushSave = useCallback(async () => {
    cancelAutoSave()
    await saveCurrentDoc()
  }, [saveCurrentDoc, cancelAutoSave])

  const setMode = useCallback((mode: 'preview' | 'source') => {
    setDoc((prev) => ({ ...prev, mode }))
  }, [])

  const reset = useCallback(() => {
    cancelAutoSave()
    setDoc({ file: null, content: '', originalContent: '', mode: 'preview', dirty: false, loading: false })
  }, [cancelAutoSave])

  return { doc, loadContent, updateContent, flushSave, setMode, reset }
}
