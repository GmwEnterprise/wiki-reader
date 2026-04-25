export type WindowShortcutInput = {
  type: string
  code: string
  control?: boolean
  meta?: boolean
  alt?: boolean
  shift?: boolean
}

export type WindowShortcutAction =
  | 'none'
  | 'prevent-default'
  | 'toggle-devtools'
  | 'new-window'
  | 'open-folder'
  | 'toggle-mode'

export function getWindowShortcutAction(
  input: WindowShortcutInput,
  isDev: boolean
): WindowShortcutAction {
  if (input.type !== 'keyDown') return 'none'

  if (input.code === 'KeyO' && (input.control || input.meta) && !input.shift && !input.alt) {
    return 'open-folder'
  }

  if (input.code === 'KeyN' && (input.control || input.meta) && input.shift && !input.alt) {
    return 'new-window'
  }

  if (input.code === 'Slash' && (input.control || input.meta) && !input.shift && !input.alt) {
    return 'toggle-mode'
  }

  if (input.code === 'F12') return 'toggle-devtools'

  if (input.code === 'KeyI' && ((input.alt && input.meta) || (input.control && input.shift))) {
    return 'toggle-devtools'
  }

  if (!isDev && input.code === 'KeyR' && (input.control || input.meta)) {
    return 'prevent-default'
  }

  if (input.code === 'Minus' && (input.control || input.meta)) {
    return 'prevent-default'
  }

  if (input.code === 'Equal' && input.shift && (input.control || input.meta)) {
    return 'prevent-default'
  }

  return 'none'
}
