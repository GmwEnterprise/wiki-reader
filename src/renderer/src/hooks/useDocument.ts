import { useState, useCallback, useRef } from 'react'
import type { WikiFile, DocumentState } from '../types'

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
  const editVersionRef = useRef(0)

  const saveCurrentDoc = useCallback(async (contentOverride?: string) => {
    const current = docRef.current
    if (!current.file || !workspaceRootPath) return
    const savedRelativePath = current.file.relativePath
    const savedEditVersion = editVersionRef.current
    const savedContent = contentOverride ?? current.content
    if (!current.dirty && savedContent === current.originalContent) return
    const result = await window.api.saveFile(
      workspaceRootPath,
      savedRelativePath,
      savedContent
    )
    if (result.success) {
      if (
        docRef.current.file?.relativePath === savedRelativePath &&
        editVersionRef.current === savedEditVersion
      ) {
        docRef.current = {
          ...docRef.current,
          content: savedContent,
          originalContent: savedContent,
          dirty: false
        }
      }
      setDoc((prev) => {
        if (
          prev.file?.relativePath !== savedRelativePath ||
          editVersionRef.current !== savedEditVersion
        ) return prev
        return {
          ...prev,
          content: savedContent,
          originalContent: savedContent,
          dirty: false
        }
      })
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
      setDoc((prev) => ({ ...prev, loading: true }))
      const result = await window.api.readFile(workspaceRootPath, file.relativePath)
      if (seq !== loadSeqRef.current) return
      editVersionRef.current += 1
      if (result.success && result.content !== undefined) {
        const next = {
          file,
          content: result.content,
          originalContent: result.content,
          mode: 'preview' as const,
          dirty: false,
          loading: false
        }
        docRef.current = next
        setDoc(next)
      } else {
        const next = {
          file,
          content: `读取失败: ${result.error}`,
          originalContent: '',
          mode: 'preview' as const,
          dirty: false,
          loading: false
        }
        docRef.current = next
        setDoc(next)
      }
    },
    [workspaceRootPath, cancelAutoSave]
  )

  const markDirty = useCallback(
    () => {
      editVersionRef.current += 1
      setDoc((prev) => {
        if (prev.dirty) return prev
        const next = {
          ...prev,
          dirty: true
        }
        docRef.current = next
        return next
      })
      cancelAutoSave()
    },
    [cancelAutoSave]
  )

  const syncContent = useCallback((content: string) => {
    setDoc((prev) => {
      const next = {
        ...prev,
        content,
        dirty: content !== prev.originalContent
      }
      docRef.current = next
      return next
    })
  }, [])

  const flushSave = useCallback(async (contentOverride?: string) => {
    cancelAutoSave()
    await saveCurrentDoc(contentOverride)
  }, [saveCurrentDoc, cancelAutoSave])

  const setMode = useCallback((mode: 'preview' | 'source') => {
    setDoc((prev) => ({ ...prev, mode }))
  }, [])

  const reset = useCallback(() => {
    cancelAutoSave()
    editVersionRef.current += 1
    const next = {
      file: null,
      content: '',
      originalContent: '',
      mode: 'preview' as const,
      dirty: false,
      loading: false
    }
    docRef.current = next
    setDoc(next)
  }, [cancelAutoSave])

  return { doc, loadContent, markDirty, syncContent, flushSave, setMode, reset }
}
