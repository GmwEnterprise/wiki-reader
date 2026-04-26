# Critical Performance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four critical performance risks identified in `docs/performance-review/critical-risks.md` with minimal, focused changes.

**Architecture:** Add bounded buffering and ownership checks at the terminal boundary, keep editor text in CodeMirror during active editing, and debounce workspace structure refreshes. The renderer keeps React state to metadata during hot paths and synchronizes full text only at save/preview boundaries.

**Tech Stack:** Electron IPC, React, TypeScript, CodeMirror 6, xterm.js, chokidar, Vitest.

---

## File Structure

- Modify `src/main/terminal.ts`: terminal composite keys, per-terminal output buffering, cleanup helpers.
- Modify `src/main/ipc-handlers.ts`: derive `windowId` from IPC sender for terminal operations and preserve workspace watcher callback behavior.
- Modify `src/main/workspace.ts`: debounce watcher events and emit only structure-changing events.
- Modify `src/renderer/src/components/TerminalInstance.tsx`: bounded xterm write queue.
- Modify `src/renderer/src/components/SourceEditor.tsx`: expose current editor content by ref and report dirty metadata only.
- Modify `src/renderer/src/hooks/useDocument.ts`: separate dirty marking, content synchronization, and saving explicit content.
- Modify `src/renderer/src/hooks/useWorkspace.ts`: scan sequence guard for latest-result-only updates.
- Modify `src/renderer/src/App.tsx`: own the editor ref and synchronize content before save/preview/file switches.
- Add or update unit tests if existing seams allow pure tests without Electron/native runtime. Runtime validation remains on Windows host because project instructions prohibit WSL2 `pnpm` execution.

## Task 1: Terminal Composite Keys

**Files:**
- Modify: `src/main/terminal.ts`
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Change terminal keying helpers in `src/main/terminal.ts`**

Add a composite key helper and change `ptyInstances` to use string keys:

```ts
function getTerminalKey(windowId: number, terminalId: number): string {
  return `${windowId}:${terminalId}`
}

const ptyInstances = new Map<string, PtyEntry>()
```

- [ ] **Step 2: Update `createTerminal` signature and lookups**

Change the signature to:

```ts
export function createTerminal(
  win: BrowserWindow,
  cwd: string | null,
  id: number
): { error?: string; processName?: string } | null
```

Inside the function, compute:

```ts
const windowId = win.id
const key = getTerminalKey(windowId, id)
if (ptyInstances.has(key)) {
  return null
}
```

Use `key` for `ptyInstances.get`, `set`, and `delete` in the `onExit` handler:

```ts
const current = ptyInstances.get(key)
if (current?.process !== ptyProcess) return
ptyInstances.delete(key)
```

- [ ] **Step 3: Update write, resize, kill signatures**

Change signatures to include `windowId`:

```ts
export function terminalWrite(windowId: number, id: number, data: string): boolean
export function terminalResize(windowId: number, id: number, cols: number, rows: number): void
export function terminalKill(windowId: number, id: number): void
```

Each function should lookup `ptyInstances.get(getTerminalKey(windowId, id))` and only act on that entry.

- [ ] **Step 4: Update `killWindowTerminals` deletion**

Collect string keys instead of numeric IDs:

```ts
const keys: string[] = []
for (const [key, entry] of ptyInstances) {
  if (entry.windowId === windowId) {
    try {
      entry.process.kill()
    } catch {
      // already dead
    }
    keys.push(key)
  }
}
keys.forEach((key) => ptyInstances.delete(key))
```

- [ ] **Step 5: Update terminal IPC handlers in `src/main/ipc-handlers.ts`**

For `terminal:write`, `terminal:resize`, and `terminal:kill`, get the owning window from `event.sender` and pass `win.id`:

```ts
ipcMain.handle('terminal:write', (event, id: number, data: string) => {
  if (typeof id !== 'number' || typeof data !== 'string') return false
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return false
  return terminalWrite(win.id, id, data)
})
```

Use the same pattern for resize and kill.

- [ ] **Step 6: Verify manually on Windows host**

Run: `pnpm build`

Expected: TypeScript build completes. Then run `pnpm dev`, open two windows, create terminal tab 1 in both, and confirm commands in one window do not affect the other.

## Task 2: Main-Process Terminal Output Buffering

**Files:**
- Modify: `src/main/terminal.ts`

- [ ] **Step 1: Add constants and entry fields**

Add near the top of `terminal.ts`:

```ts
const TERMINAL_FLUSH_DELAY_MS = 32
const TERMINAL_BUFFER_LIMIT = 2 * 1024 * 1024
const TERMINAL_TRUNCATED_MESSAGE = '\r\n[输出过快，已截断部分内容]\r\n'
```

Extend `PtyEntry`:

```ts
interface PtyEntry {
  process: IPty
  windowId: number
  terminalId: number
  buffer: string
  flushTimer: ReturnType<typeof setTimeout> | null
  truncated: boolean
}
```

- [ ] **Step 2: Add cleanup helper**

Add:

```ts
function clearTerminalFlush(entry: PtyEntry): void {
  if (entry.flushTimer) {
    clearTimeout(entry.flushTimer)
    entry.flushTimer = null
  }
  entry.buffer = ''
  entry.truncated = false
}
```

- [ ] **Step 3: Add bounded append and flush helpers**

Add:

```ts
function appendTerminalOutput(entry: PtyEntry, data: string): void {
  entry.buffer += data
  if (entry.buffer.length > TERMINAL_BUFFER_LIMIT) {
    entry.buffer = entry.buffer.slice(entry.buffer.length - TERMINAL_BUFFER_LIMIT)
    if (!entry.truncated) {
      entry.buffer = TERMINAL_TRUNCATED_MESSAGE + entry.buffer
      entry.truncated = true
    }
  }
}

function flushTerminalOutput(win: BrowserWindow, entry: PtyEntry): void {
  entry.flushTimer = null
  if (!entry.buffer || win.isDestroyed()) return
  const data = entry.buffer
  entry.buffer = ''
  entry.truncated = false
  win.webContents.send('terminal:data', entry.terminalId, data)
}

function scheduleTerminalFlush(win: BrowserWindow, entry: PtyEntry): void {
  if (entry.flushTimer) return
  entry.flushTimer = setTimeout(() => {
    flushTerminalOutput(win, entry)
  }, TERMINAL_FLUSH_DELAY_MS)
}
```

- [ ] **Step 4: Replace direct `onData` send**

After creating the `PtyEntry`, store it before registering `onData` or close over the entry:

```ts
const entry: PtyEntry = {
  process: ptyProcess,
  windowId,
  terminalId: id,
  buffer: '',
  flushTimer: null,
  truncated: false
}
ptyInstances.set(key, entry)

ptyProcess.onData((data: string) => {
  const current = ptyInstances.get(key)
  if (current !== entry || win.isDestroyed()) return
  appendTerminalOutput(entry, data)
  scheduleTerminalFlush(win, entry)
})
```

- [ ] **Step 5: Flush and clean on exit/kill**

Before sending `terminal:exit`, call `flushTerminalOutput(win, entry)` so final output is not lost. In `terminalKill`, `killWindowTerminals`, and `killAllTerminals`, call `clearTerminalFlush(entry)` before deleting or clearing entries.

- [ ] **Step 6: Verify manually on Windows host**

Run: `pnpm build`

Expected: build succeeds. In `pnpm dev`, run a continuous output command and confirm the terminal still updates in batches and remains responsive.

## Task 3: Renderer xterm Write Queue

**Files:**
- Modify: `src/renderer/src/components/TerminalInstance.tsx`

- [ ] **Step 1: Add queue constants and refs**

Add near imports:

```ts
const TERMINAL_WRITE_QUEUE_LIMIT = 2 * 1024 * 1024
const TERMINAL_TRUNCATED_MESSAGE = '\r\n[输出过快，已截断部分内容]\r\n'
```

Inside the component, add refs:

```ts
const writeQueueRef = useRef<string[]>([])
const writeQueueSizeRef = useRef(0)
const writingRef = useRef(false)
const writeTruncatedRef = useRef(false)
```

- [ ] **Step 2: Add queue cleanup and pump functions**

Add callbacks:

```ts
const clearWriteQueue = useCallback(() => {
  writeQueueRef.current = []
  writeQueueSizeRef.current = 0
  writingRef.current = false
  writeTruncatedRef.current = false
}, [])

const pumpWriteQueue = useCallback(() => {
  const xterm = xtermRef.current
  if (!xterm || writingRef.current) return
  const next = writeQueueRef.current.shift()
  if (next === undefined) return
  writeQueueSizeRef.current -= next.length
  writingRef.current = true
  xterm.write(next, () => {
    writingRef.current = false
    pumpWriteQueue()
  })
}, [])
```

- [ ] **Step 3: Add enqueue function**

Add:

```ts
const enqueueWrite = useCallback(
  (data: string) => {
    writeQueueRef.current.push(data)
    writeQueueSizeRef.current += data.length
    while (writeQueueSizeRef.current > TERMINAL_WRITE_QUEUE_LIMIT && writeQueueRef.current.length > 0) {
      const removed = writeQueueRef.current.shift() ?? ''
      writeQueueSizeRef.current -= removed.length
      if (!writeTruncatedRef.current) {
        writeQueueRef.current.unshift(TERMINAL_TRUNCATED_MESSAGE)
        writeQueueSizeRef.current += TERMINAL_TRUNCATED_MESSAGE.length
        writeTruncatedRef.current = true
      }
    }
    pumpWriteQueue()
  },
  [pumpWriteQueue]
)
```

- [ ] **Step 4: Use the queue for terminal data**

Replace `xterm.write(data)` in `onTerminalData` with:

```ts
enqueueWrite(data)
```

Add `enqueueWrite` to the effect dependency list.

- [ ] **Step 5: Clear queue on destroy and unmount**

Call `clearWriteQueue()` in `destroyTerminal` and in the unmount cleanup before `cleanupListeners()`. Add `clearWriteQueue` to relevant dependency arrays.

- [ ] **Step 6: Verify manually on Windows host**

Run: `pnpm build`

Expected: build succeeds. In `pnpm dev`, open three terminal tabs with continuous output and confirm switching/closing remains responsive.

## Task 4: Editor Dirty-Only Input Path

**Files:**
- Modify: `src/renderer/src/components/SourceEditor.tsx`
- Modify: `src/renderer/src/hooks/useDocument.ts`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Export editor handle from `SourceEditor.tsx`**

Change imports:

```ts
import { forwardRef, useRef, useEffect, useImperativeHandle } from 'react'
```

Add type:

```ts
export type SourceEditorHandle = {
  getContent: () => string
}
```

Change props:

```ts
type SourceEditorProps = {
  content: string
  onDirty: () => void
  onSave: () => void
  onEscape: () => void
  darkMode?: boolean
}
```

- [ ] **Step 2: Wrap SourceEditor in `forwardRef`**

Change the component declaration to:

```ts
const SourceEditor = forwardRef<SourceEditorHandle, SourceEditorProps>(
  function SourceEditor({ content, onDirty, onSave, onEscape, darkMode = false }, ref) {
```

Before the mount effect, add:

```ts
useImperativeHandle(ref, () => ({
  getContent: () => viewRef.current?.state.doc.toString() ?? content
}), [content])
```

End the file with:

```ts
export default SourceEditor
```

- [ ] **Step 3: Replace update listener behavior**

Rename `onChangeRef` to `onDirtyRef` and replace the update listener body with:

```ts
EditorView.updateListener.of((update) => {
  if (update.docChanged) {
    onDirtyRef.current()
  }
})
```

Do not call `update.state.doc.toString()` from this listener.

- [ ] **Step 4: Update `useDocument.ts` API**

Replace `updateContent` with:

```ts
const markDirty = useCallback(() => {
  setDoc((prev) => (prev.dirty ? prev : { ...prev, dirty: true }))
  cancelAutoSave()
  autoSaveTimerRef.current = setTimeout(() => {
    saveCurrentDoc(docRef.current.content)
  }, AUTO_SAVE_DELAY)
}, [saveCurrentDoc, cancelAutoSave])
```

Change `saveCurrentDoc` to accept optional explicit content:

```ts
const saveCurrentDoc = useCallback(
  async (contentOverride?: string) => {
    const current = docRef.current
    if (!current.file || !workspaceRootPath || !current.dirty) return
    const savedContent = contentOverride ?? current.content
    const result = await window.api.saveFile(workspaceRootPath, current.file.relativePath, savedContent)
    if (result.success) {
      setDoc((prev) => ({
        ...prev,
        content: savedContent,
        originalContent: savedContent,
        dirty: false
      }))
    }
  },
  [workspaceRootPath]
)
```

Add:

```ts
const syncContent = useCallback((content: string) => {
  setDoc((prev) => ({ ...prev, content, dirty: content !== prev.originalContent }))
}, [])

const flushSave = useCallback(
  async (contentOverride?: string) => {
    cancelAutoSave()
    await saveCurrentDoc(contentOverride)
  },
  [saveCurrentDoc, cancelAutoSave]
)
```

Return `{ doc, loadContent, markDirty, syncContent, flushSave, setMode, reset }`.

- [ ] **Step 5: Update `App.tsx` to own editor ref**

Change import:

```ts
import SourceEditor, { type SourceEditorHandle } from './components/SourceEditor'
```

Change hook destructuring:

```ts
const { doc, loadContent, markDirty, syncContent, flushSave, setMode, reset } = useDocument(
  workspace?.rootPath ?? null
)
```

Add ref:

```ts
const sourceEditorRef = useRef<SourceEditorHandle | null>(null)
```

Add helper:

```ts
const getCurrentEditorContent = useCallback(() => {
  return doc.mode === 'source' ? sourceEditorRef.current?.getContent() : undefined
}, [doc.mode])
```

- [ ] **Step 6: Save and preview with explicit editor content**

Replace `flushSave()` calls in App with `flushSave(getCurrentEditorContent())` where saving may happen while source mode is active.

Before switching to preview from menu, context menu, or Escape, do:

```ts
const currentContent = sourceEditorRef.current?.getContent()
if (currentContent !== undefined) {
  syncContent(currentContent)
}
setMode('preview')
```

Pass props to `SourceEditor`:

```tsx
<SourceEditor
  ref={sourceEditorRef}
  content={doc.content}
  onDirty={markDirty}
  onSave={() => flushSave(sourceEditorRef.current?.getContent())}
  onEscape={() => {
    if (contentBodyRef.current) {
      scrollPositionRef.current = contentBodyRef.current.scrollTop
    }
    const currentContent = sourceEditorRef.current?.getContent()
    if (currentContent !== undefined) {
      syncContent(currentContent)
    }
    setMode('preview')
  }}
  darkMode={theme === 'dark'}
/>
```

- [ ] **Step 7: Verify manually on Windows host**

Run: `pnpm build`

Expected: build succeeds. In `pnpm dev`, edit a large document in source mode, save, switch preview, and confirm preview and disk content include the latest edits.

## Task 5: Workspace Watcher Debounce and Scan Ordering

**Files:**
- Modify: `src/main/workspace.ts`
- Modify: `src/renderer/src/hooks/useWorkspace.ts`

- [ ] **Step 1: Add watcher debounce state**

In `workspace.ts`, add:

```ts
const WATCH_DEBOUNCE_MS = 500

interface WatchState {
  watcher: FSWatcher
  timer: ReturnType<typeof setTimeout> | null
  structureChanged: boolean
}

const watchers = new Map<string, WatchState>()
```

Replace the existing `const watchers = new Map<string, FSWatcher>()`.

- [ ] **Step 2: Debounce structure-changing watcher events**

Change `watchWorkspace` to close any existing watcher for the same root, then create a `WatchState`:

```ts
export function watchWorkspace(rootPath: string, onChange: () => void): void {
  unwatchWorkspace(rootPath)

  const watcher = chokidar.watch('**/*.md', {
    cwd: rootPath,
    ignored: ['**/node_modules/**', '**/.git/**', '**/.*'],
    ignoreInitial: true
  })

  const state: WatchState = { watcher, timer: null, structureChanged: false }

  const scheduleChange = (structureChanged: boolean): void => {
    state.structureChanged = state.structureChanged || structureChanged
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      state.timer = null
      if (state.structureChanged) {
        state.structureChanged = false
        onChange()
      }
    }, WATCH_DEBOUNCE_MS)
  }

  watcher.on('add', () => scheduleChange(true))
  watcher.on('unlink', () => scheduleChange(true))
  watcher.on('change', () => scheduleChange(false))

  watchers.set(rootPath, state)
}
```

- [ ] **Step 3: Update unwatch cleanup**

Change `unwatchWorkspace`:

```ts
export function unwatchWorkspace(rootPath: string): void {
  const state = watchers.get(rootPath)
  if (state) {
    if (state.timer) clearTimeout(state.timer)
    state.watcher.close()
    watchers.delete(rootPath)
  }
}
```

- [ ] **Step 4: Add scan sequence guard in `useWorkspace.ts`**

Change import to include `useRef`:

```ts
import { useState, useCallback, useEffect, useRef } from 'react'
```

Add:

```ts
const scanSeqRef = useRef(0)
```

Change `refreshFiles`:

```ts
const refreshFiles = useCallback(async (rootPath: string) => {
  const seq = ++scanSeqRef.current
  const scannedFiles = await window.api.scanFiles(rootPath)
  if (seq === scanSeqRef.current) {
    setFiles(scannedFiles)
  }
}, [])
```

Use `await refreshFiles(result.rootPath)` in `openFolder` and `openRecentFolder` instead of manually scanning and setting files.

- [ ] **Step 5: Verify manually on Windows host**

Run: `pnpm build`

Expected: build succeeds. In `pnpm dev`, batch-add Markdown files and confirm the tree refreshes once after debounce. Save the current Markdown file and confirm the file tree does not repeatedly rebuild.

## Task 6: Final Verification

**Files:**
- Review: `docs/performance-review/critical-risks.md`

- [ ] **Step 1: Static review**

Check each risk maps to code changes:

- Risk 1 maps to `src/main/terminal.ts` and `TerminalInstance.tsx`.
- Risk 2 maps to `src/main/terminal.ts` and `ipc-handlers.ts`.
- Risk 3 maps to `SourceEditor.tsx`, `useDocument.ts`, and `App.tsx`.
- Risk 4 maps to `workspace.ts` and `useWorkspace.ts`.

- [ ] **Step 2: Windows host verification commands**

Run in Windows terminal:

```bash
pnpm test
pnpm build
pnpm dev
```

Expected: tests pass, build passes, app launches.

- [ ] **Step 3: Manual performance scenarios**

Validate:

- Two windows can each run terminal ID 1 independently.
- Three terminal tabs with continuous output remain responsive.
- Source editing a large document does not trigger preview render on each keystroke.
- Save and preview sync preserve latest content.
- Batch file add/delete produces a debounced file tree refresh.

- [ ] **Step 4: Commit if requested by user**

Only if the user explicitly asks for a commit, run git status/diff/log first and commit the relevant files with a conventional message such as:

```bash
git add docs/superpowers/specs/2026-04-26-critical-performance-fixes-design.md docs/superpowers/plans/2026-04-26-critical-performance-fixes.md src/main/terminal.ts src/main/ipc-handlers.ts src/main/workspace.ts src/renderer/src/components/TerminalInstance.tsx src/renderer/src/components/SourceEditor.tsx src/renderer/src/hooks/useDocument.ts src/renderer/src/hooks/useWorkspace.ts src/renderer/src/App.tsx
git commit -m "fix: address critical performance risks"
```

## Self-Review

- Spec coverage: all four severe risks are covered by Tasks 1 through 5, with final verification in Task 6.
- Placeholder scan: no TBD/TODO placeholders remain; each task names exact files and concrete code shapes.
- Type consistency: terminal IDs remain numeric at IPC/preload/renderer boundaries; only main-process storage keys become strings. `SourceEditorHandle`, `markDirty`, `syncContent`, and `flushSave(contentOverride?)` are consistently referenced.
