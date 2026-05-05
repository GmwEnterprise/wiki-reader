import { useState, useCallback, useRef } from 'react'
import type { WikiFile, DocumentState } from '../types'

export function useDocument(workspaceRootPath: string | null) {
  const [doc, setDoc] = useState<DocumentState>({
    file: null,
    content: '',
    mode: 'preview',
    dirty: false,
    loading: false
  })
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const loadSeqRef = useRef(0)
  const editVersionRef = useRef(0)
  const originalContentRef = useRef('')

  const saveCurrentDoc = useCallback(async (contentOverride?: string) => {
    const current = docRef.current
    if (!current.file || !workspaceRootPath) return
    const savedRelativePath = current.file.relativePath
    const savedEditVersion = editVersionRef.current
    const savedContent = contentOverride ?? current.content
    if (!current.dirty && savedContent === originalContentRef.current) return
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
        originalContentRef.current = savedContent
        docRef.current = {
          ...docRef.current,
          content: savedContent,
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
      const loadingDoc = {
        file,
        content: '',
        mode: 'preview' as const,
        dirty: false,
        loading: true
      }
      docRef.current = loadingDoc
      setDoc(loadingDoc)
      const result = await window.api.readFile(workspaceRootPath, file.relativePath)
      if (seq !== loadSeqRef.current) return
      editVersionRef.current += 1
      if (result.success && result.content !== undefined) {
        originalContentRef.current = result.content
        const next = {
          file,
          content: result.content,
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
          mode: 'preview' as const,
          dirty: false,
          loading: false
        }
        originalContentRef.current = ''
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
        dirty: content !== originalContentRef.current
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
    loadSeqRef.current += 1
    editVersionRef.current += 1
    originalContentRef.current = ''
    const next = {
      file: null,
      content: '',
      mode: 'preview' as const,
      dirty: false,
      loading: false
    }
    docRef.current = next
    setDoc(next)
  }, [cancelAutoSave])

  return { doc, loadContent, markDirty, syncContent, flushSave, setMode, reset }
}
