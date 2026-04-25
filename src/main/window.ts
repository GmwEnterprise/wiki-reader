import { shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { getWindowShortcutAction } from './window-shortcuts'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 1200,
    minWidth: 800,
    minHeight: 600,
    title: 'Wiki Reader',
    show: false,
    autoHideMenuBar: true,
    icon,
    frame: false,
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('close', (e) => {
    e.preventDefault()
    win.webContents.send('window:before-close')
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
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
