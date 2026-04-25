import { describe, expect, it, beforeEach } from 'vitest'
import {
  addTab,
  ensureInitialTab,
  removeTab,
  updateTabTitle,
  resetNextId,
  MAX_TABS,
  type TabState
} from '../../src/renderer/src/components/terminalTabActions'

beforeEach(() => {
  resetNextId()
})

describe('terminalTabActions', () => {
  describe('addTab', () => {
    it('从空状态添加第一个标签', () => {
      const state: TabState = { tabs: [], activeTabId: null }
      const next = addTab(state)
      expect(next.tabs).toHaveLength(1)
      expect(next.tabs[0]).toEqual({ id: 1, title: '终端 1' })
      expect(next.activeTabId).toBe(1)
    })

    it('使用传入 ID 创建标签，避免状态 updater 重复执行时跳号', () => {
      const state: TabState = { tabs: [], activeTabId: null }
      const first = addTab(state, 1)
      const second = addTab(state, 1)
      expect(first).toEqual(second)
      expect(second.tabs[0]).toEqual({ id: 1, title: '终端 1' })
    })

    it('连续添加多个标签，ID 自增', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = addTab(state)
      state = addTab(state)
      expect(state.tabs).toHaveLength(3)
      expect(state.tabs.map((t) => t.id)).toEqual([1, 2, 3])
      expect(state.activeTabId).toBe(3)
    })

    it('达到最大标签数后不再继续添加', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      for (let i = 0; i < MAX_TABS + 2; i++) {
        state = addTab(state)
      }
      expect(state.tabs).toHaveLength(MAX_TABS)
      expect(state.activeTabId).toBe(MAX_TABS)
    })
  })

  describe('ensureInitialTab', () => {
    it('空状态创建一个初始标签', () => {
      const state: TabState = { tabs: [], activeTabId: null }
      const next = ensureInitialTab(state)
      expect(next.tabs).toHaveLength(1)
      expect(next.activeTabId).toBe(1)
    })

    it('已有标签时不再创建新标签', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = ensureInitialTab(state)
      state = ensureInitialTab(state, 2)
      expect(state.tabs).toHaveLength(1)
      expect(state.activeTabId).toBe(1)
    })
  })

  describe('removeTab', () => {
    it('删除唯一标签后列表为空，activeTabId 为 null', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = removeTab(state, 1)
      expect(state.tabs).toEqual([])
      expect(state.activeTabId).toBeNull()
    })

    it('删除非活跃标签不影响 activeTabId', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = addTab(state)
      state = addTab(state)
      state = { ...state, activeTabId: 2 }
      const next = removeTab(state, 1)
      expect(next.activeTabId).toBe(2)
      expect(next.tabs).toHaveLength(2)
    })

    it('删除活跃标签时切换到右侧相邻标签', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = addTab(state)
      state = addTab(state)
      state = { ...state, activeTabId: 2 }
      const next = removeTab(state, 2)
      expect(next.activeTabId).toBe(3)
    })

    it('删除最后一个活跃标签时切换到左侧相邻标签', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      state = addTab(state)
      state = addTab(state)
      const next = removeTab(state, 3)
      expect(next.activeTabId).toBe(2)
    })
  })

  describe('updateTabTitle', () => {
    it('更新指定标签标题', () => {
      let state: TabState = { tabs: [], activeTabId: null }
      state = addTab(state)
      const next = updateTabTitle(state, 1, 'bash')
      expect(next.tabs[0].title).toBe('bash')
    })
  })

  it('MAX_TABS 为 10', () => {
    expect(MAX_TABS).toBe(10)
  })
})
