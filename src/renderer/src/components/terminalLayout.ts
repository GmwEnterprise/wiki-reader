export const TERMINAL_MIN_HEIGHT = 100
export const TERMINAL_MAX_HEIGHT = 600

export type TerminalTheme = {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  scrollbarSliderBackground: string
  scrollbarSliderHoverBackground: string
  scrollbarSliderActiveBackground: string
}

export function createTerminalTheme(dark: boolean): TerminalTheme {
  return dark
    ? {
        background: '#1e1e20',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: 'rgba(74, 144, 217, 0.3)',
        scrollbarSliderBackground: 'rgba(255, 255, 255, 0.18)',
        scrollbarSliderHoverBackground: 'rgba(255, 255, 255, 0.32)',
        scrollbarSliderActiveBackground: 'rgba(255, 255, 255, 0.32)'
      }
    : {
        background: '#ffffff',
        foreground: '#2c2c2c',
        cursor: '#383838',
        selectionBackground: 'rgba(74, 144, 217, 0.25)',
        scrollbarSliderBackground: 'rgba(0, 0, 0, 0.12)',
        scrollbarSliderHoverBackground: 'rgba(0, 0, 0, 0.22)',
        scrollbarSliderActiveBackground: 'rgba(0, 0, 0, 0.22)'
      }
}

type FitAddonLike = {
  fit: () => void
}

type TerminalLike = {
  cols: number
  rows: number
}

export function calculateTerminalPanelHeight(
  startHeight: number,
  startY: number,
  currentY: number
): number {
  const delta = startY - currentY
  return Math.max(TERMINAL_MIN_HEIGHT, Math.min(TERMINAL_MAX_HEIGHT, startHeight + delta))
}

export function fitAndResizeTerminal(
  fitAddon: FitAddonLike | null,
  terminal: TerminalLike | null,
  resize: (cols: number, rows: number) => void
): void {
  if (!fitAddon || !terminal) return

  fitAddon.fit()
  resize(terminal.cols, terminal.rows)
}
