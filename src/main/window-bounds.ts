import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

export type WindowBounds = {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

const STORAGE_FILE = join(app.getPath('userData'), 'window-bounds.json')

export function loadWindowBounds(): WindowBounds | null {
  if (!existsSync(STORAGE_FILE)) return null
  try {
    const data = readFileSync(STORAGE_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed.width !== 'number' || typeof parsed.height !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function saveWindowBounds(bounds: WindowBounds): void {
  try {
    writeFileSync(STORAGE_FILE, JSON.stringify(bounds, null, 2), 'utf-8')
  } catch {
    // 写入失败不阻塞主流程
  }
}
