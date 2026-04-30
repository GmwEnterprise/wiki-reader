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

type BoundsMap = Record<string, WindowBounds>

const STORAGE_FILE = join(app.getPath('userData'), 'window-bounds.json')

function loadBoundsMap(): BoundsMap {
  if (!existsSync(STORAGE_FILE)) return {}
  try {
    const data = readFileSync(STORAGE_FILE, 'utf-8')
    const parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as BoundsMap
  } catch {
    return {}
  }
}

function saveBoundsMap(map: BoundsMap): void {
  try {
    writeFileSync(STORAGE_FILE, JSON.stringify(map, null, 2), 'utf-8')
  } catch {
    // 写入失败不阻塞主流程
  }
}

export function loadWindowBounds(folderPath: string): WindowBounds | null {
  const map = loadBoundsMap()
  const bounds = map[folderPath]
  if (bounds && typeof bounds.width === 'number' && typeof bounds.height === 'number') {
    return bounds
  }
  return null
}

export function saveWindowBounds(folderPath: string, bounds: WindowBounds): void {
  const map = loadBoundsMap()
  map[folderPath] = bounds
  saveBoundsMap(map)
}
