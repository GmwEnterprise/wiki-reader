import { describe, expect, it, vi } from 'vitest'

type ExitListener = (event: { exitCode: number }) => void

interface MockPtyProcess {
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
  onData: (listener: (data: string) => void) => void
  onExit: (listener: ExitListener) => void
  triggerExit: (exitCode: number) => void
}

function createMockPtyProcess(): MockPtyProcess {
  let exitListener: ExitListener | null = null
  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn((listener: ExitListener) => {
      exitListener = listener
    }),
    triggerExit: (exitCode: number) => {
      exitListener?.({ exitCode })
    }
  }
}

describe('terminal pty lifecycle', () => {
  it('忽略已被同 id 新实例替换的旧 pty exit 事件', () => {
    const sent: unknown[][] = []
    const oldPty = createMockPtyProcess()
    const newPty = createMockPtyProcess()
    const ptyInstances = new Map<number, { process: MockPtyProcess; windowId: number }>()
    const win = {
      id: 1,
      isDestroyed: () => false,
      webContents: {
        send: (...args: unknown[]) => sent.push(args)
      }
    }

    function registerExit(id: number, ptyProcess: MockPtyProcess): void {
      ptyProcess.onExit(({ exitCode }) => {
        const current = ptyInstances.get(id)
        if (current?.process !== ptyProcess) return

        if (!win.isDestroyed()) {
          win.webContents.send('terminal:exit', id, exitCode)
        }
        ptyInstances.delete(id)
      })
      ptyInstances.set(id, { process: ptyProcess, windowId: win.id })
    }

    registerExit(1, oldPty)
    ptyInstances.delete(1)
    registerExit(1, newPty)

    oldPty.triggerExit(0)

    expect(sent).toEqual([])
    expect(ptyInstances.get(1)?.process).toBe(newPty)

    newPty.triggerExit(0)

    expect(sent).toEqual([['terminal:exit', 1, 0]])
    expect(ptyInstances.has(1)).toBe(false)
  })
})
