import os from 'os'
import fs from 'fs'
import path from 'path'
import { BrowserWindow } from 'electron'

interface IPty {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(listener: (data: string) => void): void
  onExit(listener: (e: { exitCode: number }) => void): void
}

let pty: { spawn: (file: string, args: string[], options: any) => IPty } | null
try {
  pty = require('node-pty')
} catch {
  pty = null
}

interface PtyEntry {
  process: IPty
  windowId: number
  terminalId: number
  buffer: string
  flushTimer: ReturnType<typeof setTimeout> | null
  truncated: boolean
  closed: boolean
}

const TERMINAL_FLUSH_DELAY_MS = 32
const TERMINAL_BUFFER_LIMIT = 2 * 1024 * 1024
const TERMINAL_TRUNCATED_MESSAGE = '\r\n[输出过快，已截断部分内容]\r\n'

export function getTerminalKey(windowId: number, terminalId: number): string {
  return `${windowId}:${terminalId}`
}

const ptyInstances = new Map<string, PtyEntry>()
const windowCleanupRegistered = new Set<number>()

function isValidCwd(cwd: string): boolean {
  try {
    const resolved = path.resolve(cwd)
    const stat = fs.statSync(resolved)
    return stat.isDirectory()
  } catch {
    return false
  }
}

export function resolveTerminalCwd(cwd: string | null): string {
  return cwd && isValidCwd(cwd) ? path.resolve(cwd) : os.homedir()
}

function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

export function getTerminalProcessName(shell: string): string {
  return path.basename(shell)
}

function ensureWindowCleanup(win: BrowserWindow): void {
  const windowId = win.id
  if (windowCleanupRegistered.has(windowId)) return
  windowCleanupRegistered.add(windowId)
  win.once('closed', () => {
    killWindowTerminals(windowId)
    windowCleanupRegistered.delete(windowId)
  })
}

function clearTerminalFlush(entry: PtyEntry): void {
  if (entry.flushTimer) {
    clearTimeout(entry.flushTimer)
    entry.flushTimer = null
  }
  entry.buffer = ''
  entry.truncated = false
}

function appendTerminalOutput(entry: PtyEntry, data: string): void {
  entry.buffer += data
  if (entry.buffer.length <= TERMINAL_BUFFER_LIMIT) return

  const tailLimit = Math.max(0, TERMINAL_BUFFER_LIMIT - TERMINAL_TRUNCATED_MESSAGE.length)
  entry.buffer = entry.buffer.slice(-tailLimit)

  if (!entry.truncated) {
    entry.truncated = true
  }
  entry.buffer = TERMINAL_TRUNCATED_MESSAGE + entry.buffer
}

function flushTerminalOutput(win: BrowserWindow, entry: PtyEntry): void {
  if (entry.flushTimer) {
    clearTimeout(entry.flushTimer)
    entry.flushTimer = null
  }
  if (!entry.buffer) {
    entry.truncated = false
    return
  }

  const data = entry.buffer
  entry.buffer = ''
  entry.truncated = false

  if (!entry.closed && !win.isDestroyed()) {
    win.webContents.send('terminal:data', entry.terminalId, data)
  }
}

function scheduleTerminalFlush(win: BrowserWindow, entry: PtyEntry): void {
  if (entry.flushTimer) return
  entry.flushTimer = setTimeout(() => {
    flushTerminalOutput(win, entry)
  }, TERMINAL_FLUSH_DELAY_MS)
}

export function createTerminal(
  win: BrowserWindow,
  cwd: string | null,
  id: number
): { error?: string; processName?: string } | null {
  if (!pty) {
    return { error: '终端不可用：node-pty 模块加载失败' }
  }

  const windowId = win.id
  const key = getTerminalKey(windowId, id)
  if (ptyInstances.has(key)) {
    return null
  }

  const shell = getDefaultShell()
  const terminalCwd = resolveTerminalCwd(cwd)
  let ptyProcess: IPty
  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: terminalCwd,
      env: { ...process.env } as Record<string, string>
    })
  } catch (err: any) {
    return { error: `终端启动失败: ${err.message}` }
  }

  const entry: PtyEntry = {
    process: ptyProcess,
    windowId,
    terminalId: id,
    buffer: '',
    flushTimer: null,
    truncated: false,
    closed: false
  }
  ptyInstances.set(key, entry)

  ptyProcess.onData((data: string) => {
    const current = ptyInstances.get(key)
    if (current?.process !== ptyProcess || current.closed || win.isDestroyed()) return

    appendTerminalOutput(current, data)
    scheduleTerminalFlush(win, current)
  })

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    const current = ptyInstances.get(key)
    if (current?.process !== ptyProcess) return

    flushTerminalOutput(win, current)
    current.closed = true
    clearTerminalFlush(current)
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', id, exitCode)
    }
    ptyInstances.delete(key)
  })

  ensureWindowCleanup(win)

  const processName = getTerminalProcessName(shell)
  return { processName }
}

export function terminalWrite(windowId: number, id: number, data: string): boolean {
  const entry = ptyInstances.get(getTerminalKey(windowId, id))
  if (!entry) return false
  try {
    entry.process.write(data)
    return true
  } catch {
    return false
  }
}

export function terminalResize(windowId: number, id: number, cols: number, rows: number): void {
  const entry = ptyInstances.get(getTerminalKey(windowId, id))
  if (entry) {
    try {
      entry.process.resize(cols, rows)
    } catch {
      // pty may have already exited
    }
  }
}

export function terminalKill(windowId: number, id: number): void {
  const key = getTerminalKey(windowId, id)
  const entry = ptyInstances.get(key)
  if (entry) {
    entry.closed = true
    clearTerminalFlush(entry)
    try {
      entry.process.kill()
    } catch {
      // already dead
    }
    ptyInstances.delete(key)
  }
}

export function killWindowTerminals(windowId: number): void {
  const keys: string[] = []
  for (const [key, entry] of ptyInstances) {
    if (entry.windowId === windowId) {
      entry.closed = true
      clearTerminalFlush(entry)
      try {
        entry.process.kill()
      } catch {
        // already dead
      }
      keys.push(key)
    }
  }
  keys.forEach((key) => ptyInstances.delete(key))
}

export function killAllTerminals(): void {
  for (const [, entry] of ptyInstances) {
    entry.closed = true
    clearTerminalFlush(entry)
    try {
      entry.process.kill()
    } catch {
      // already dead
    }
  }
  ptyInstances.clear()
}
