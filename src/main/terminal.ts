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
}

// 当前多终端功能只覆盖单窗口场景；Phase 7 多窗口接入时，key 需要改为 windowId + terminalId。
const ptyInstances = new Map<number, PtyEntry>()
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

export function createTerminal(
  win: BrowserWindow,
  cwd: string | null,
  id: number
): { error?: string; processName?: string } | null {
  if (!pty) {
    return { error: '终端不可用：node-pty 模块加载失败' }
  }
  if (ptyInstances.has(id)) {
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

  ptyProcess.onData((data: string) => {
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:data', id, data)
    }
  })

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    const current = ptyInstances.get(id)
    if (current?.process !== ptyProcess) return

    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', id, exitCode)
    }
    ptyInstances.delete(id)
  })

  ptyInstances.set(id, { process: ptyProcess, windowId: win.id })
  ensureWindowCleanup(win)

  const processName = getTerminalProcessName(shell)
  return { processName }
}

export function terminalWrite(id: number, data: string): boolean {
  const entry = ptyInstances.get(id)
  if (!entry) return false
  try {
    entry.process.write(data)
    return true
  } catch {
    return false
  }
}

export function terminalResize(id: number, cols: number, rows: number): void {
  const entry = ptyInstances.get(id)
  if (entry) {
    try {
      entry.process.resize(cols, rows)
    } catch {
      // pty may have already exited
    }
  }
}

export function terminalKill(id: number): void {
  const entry = ptyInstances.get(id)
  if (entry) {
    try {
      entry.process.kill()
    } catch {
      // already dead
    }
    ptyInstances.delete(id)
  }
}

export function killWindowTerminals(windowId: number): void {
  const ids: number[] = []
  for (const [id, entry] of ptyInstances) {
    if (entry.windowId === windowId) {
      try {
        entry.process.kill()
      } catch {
        // already dead
      }
      ids.push(id)
    }
  }
  ids.forEach((id) => ptyInstances.delete(id))
}

export function killAllTerminals(): void {
  for (const [, entry] of ptyInstances) {
    try {
      entry.process.kill()
    } catch {
      // already dead
    }
  }
  ptyInstances.clear()
}
