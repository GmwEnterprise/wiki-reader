import { useState, useCallback, useRef } from 'react'
import {
  addTab,
  ensureInitialTab,
  removeTab,
  updateTabTitle,
  type TerminalTab,
  type TabState
} from '../components/terminalTabActions'

export type { TerminalTab }

export interface UseTerminalTabsReturn {
  visible: boolean
  tabs: TerminalTab[]
  activeTabId: number | null
  tabCount: number
  toggle: () => void
  close: () => void
  openNewTab: () => void
  removeTab: (id: number) => void
  setActive: (id: number) => void
  updateTitle: (id: number, title: string) => void
}

export function useTerminalTabs(): UseTerminalTabsReturn {
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<TabState>({ tabs: [], activeTabId: null })
  const nextIdRef = useRef(1)

  const toggle = useCallback(() => {
    if (!visible && state.tabs.length === 0) {
      const id = nextIdRef.current++
      setState((s) => ensureInitialTab(s, id))
    }
    setVisible((prev) => !prev)
  }, [visible, state.tabs.length])

  const close = useCallback(() => {
    setVisible(false)
  }, [])

  const openNewTab = useCallback(() => {
    const id = nextIdRef.current++
    setState((s) => addTab(s, id))
    setVisible(true)
  }, [])

  const removeTabById = useCallback(
    (id: number) => {
      setState((s) => {
        const next = removeTab(s, id)
        if (next.tabs.length === 0) {
          setVisible(false)
        }
        return next
      })
    },
    []
  )

  const setActive = useCallback((id: number) => {
    setState((s) => ({ ...s, activeTabId: id }))
  }, [])

  const updateTitle = useCallback((id: number, title: string) => {
    setState((s) => updateTabTitle(s, id, title))
  }, [])

  return {
    visible,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    tabCount: state.tabs.length,
    toggle,
    close,
    openNewTab,
    removeTab: removeTabById,
    setActive,
    updateTitle
  }
}
