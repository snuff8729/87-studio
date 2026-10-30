import { useEffect, useRef } from 'react'
import { MODAL_SELECTOR } from '@/components/editor-shell/use-generate-shortcut'

/**
 * Cmd+K on macOS, Ctrl+K elsewhere. macOS Ctrl+K stays with CodeMirror
 * (emacs-style deleteToLineEnd).
 */
export function isScenePaletteShortcut(
  e: {
    key: string
    ctrlKey: boolean
    metaKey: boolean
    altKey: boolean
    shiftKey: boolean
  },
  isMac: boolean,
): boolean {
  if (e.key.toLowerCase() !== 'k' || e.altKey || e.shiftKey) return false
  return isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
}

/**
 * Ctrl/Cmd+K → `onOpen`, also while typing in prompt editors (capture
 * phase). Ignored while a dialog / sheet is open.
 */
export function useScenePaletteShortcut(onOpen: () => void, enabled: boolean) {
  const ref = useRef({ onOpen, enabled })
  ref.current = { onOpen, enabled }

  useEffect(() => {
    const isMac = detectMac()
    function onKeyDown(e: KeyboardEvent) {
      if (!ref.current.enabled || e.isComposing) return
      if (!isScenePaletteShortcut(e, isMac)) return
      if (document.querySelector(MODAL_SELECTOR)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      ref.current.onOpen()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}
