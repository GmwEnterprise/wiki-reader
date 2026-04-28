import { shell, screen, BrowserWindow } from 'electron'
import { join, basename } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getWindowShortcutAction } from './window-shortcuts'
import { getInitialOpenPathArg } from '../preload/initial-open-path'
import { loadWindowBounds, saveWindowBounds } from './window-bounds'

export function createMainWindow(initialPath?: string): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

  const defaultWidth = Math.min(Math.round(screenWidth * 0.75), 1600)
  const defaultHeight = Math.min(Math.round(screenHeight * 0.8), 1000)

  const savedBounds = loadWindowBounds()

  const win = new BrowserWindow({
    width: savedBounds?.width ?? defaultWidth,
    height: savedBounds?.height ?? defaultHeight,
    minWidth: 800,
    minHeight: 600,
    title: initialPath ? `${basename(initialPath)} - Wiki Reader` : 'Wiki Reader',
    show: false,
    autoHideMenuBar: true,
    icon,
    frame: false,
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: initialPath ? getInitialOpenPathArg(initialPath) : []
    }
  })

  if (savedBounds?.x != null && savedBounds?.y != null) {
    const displays = screen.getAllDisplays()
    const isOnScreen = displays.some((d) => {
      const { x, y, width, height } = d.workArea
      return (
        savedBounds.x! >= x &&
        savedBounds.x! < x + width &&
        savedBounds.y! >= y &&
        savedBounds.y! < y + height
      )
    })
    if (isOnScreen) {
      win.setPosition(savedBounds.x!, savedBounds.y!)
    }
  }

  if (savedBounds?.isMaximized) {
    win.maximize()
  }

  const persistBounds = (): void => {
    if (win.isDestroyed()) return
    const [width, height] = win.getSize()
    const [x, y] = win.getPosition()
    saveWindowBounds({
      x,
      y,
      width,
      height,
      isMaximized: win.isMaximized()
    })
  }

  win.on('resize', persistBounds)
  win.on('move', persistBounds)
  win.on('maximize', persistBounds)
  win.on('unmaximize', persistBounds)

  win.on('ready-to-show', () => {
    win.show()
  })

  const CLOSE_TIMEOUT = 3000

  win.on('close', (e) => {
    e.preventDefault()
    win.webContents.send('window:before-close')

    const timer = setTimeout(() => {
      if (!win.isDestroyed()) {
        win.destroy()
      }
    }, CLOSE_TIMEOUT)

    win.once('closed', () => {
      clearTimeout(timer)
    })
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.webContents.on('before-input-event', (event, input) => {
    const action = getWindowShortcutAction(input, is.dev)

    if (action === 'prevent-default') {
      event.preventDefault()
      return
    }

    if (action === 'toggle-devtools') {
      event.preventDefault()

      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools()
      } else {
        win.webContents.openDevTools({ mode: 'bottom' })
      }
    }

    if (action === 'open-folder') {
      event.preventDefault()
      win.webContents.send('menu:openFolder')
      return
    }

    if (action === 'new-window') {
      event.preventDefault()
      createMainWindow()
      return
    }

    if (action === 'toggle-mode') {
      event.preventDefault()
      win.webContents.send('menu:toggleMode')
      return
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
