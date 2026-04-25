import { useState, useCallback } from 'react'

export function useTerminal(): { visible: boolean; toggle: () => void; hide: () => void } {
  const [visible, setVisible] = useState(false)

  const toggle = useCallback(() => {
    setVisible((prev) => !prev)
  }, [])

  const hide = useCallback(() => {
    setVisible(false)
  }, [])

  return { visible, toggle, hide }
}
