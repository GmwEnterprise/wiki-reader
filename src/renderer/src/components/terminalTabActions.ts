export interface TerminalTab {
  id: number
  title: string
}

export interface TabState {
  tabs: TerminalTab[]
  activeTabId: number | null
}

let nextId = 1

export function resetNextId(): void {
  nextId = 1
}

export function generateId(): number {
  return nextId++
}

export function addTab(state: TabState, id?: number): TabState {
  if (state.tabs.length >= MAX_TABS) {
    return state
  }

  const tabId = id ?? generateId()
  const title = `终端 ${tabId}`
  return {
    tabs: [...state.tabs, { id: tabId, title }],
    activeTabId: tabId
  }
}

export function ensureInitialTab(state: TabState, id?: number): TabState {
  if (state.tabs.length > 0) {
    return state
  }

  return addTab(state, id)
}

export function removeTab(state: TabState, idToRemove: number): TabState {
  const tabs = state.tabs.filter((t) => t.id !== idToRemove)
  if (tabs.length === 0) {
    return { tabs, activeTabId: null }
  }
  if (state.activeTabId !== idToRemove) {
    return { tabs, activeTabId: state.activeTabId }
  }
  const oldIndex = state.tabs.findIndex((t) => t.id === idToRemove)
  const newIndex = Math.min(oldIndex, tabs.length - 1)
  return { tabs, activeTabId: tabs[newIndex].id }
}

export function updateTabTitle(state: TabState, id: number, title: string): TabState {
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t))
  }
}

export const MAX_TABS = 10
