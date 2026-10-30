import { useCallback, useEffect, useRef, useState } from 'react'

/** Modal surfaces that should swallow the shortcut while open. */
export const MODAL_SELECTOR = [
  '[aria-modal="true"]',
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="sheet-content"]',
].join(',')

const GENERATE_COOLDOWN_MS = 1000

export function isGenerateShortcut(e: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}): boolean {
  return (
    e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
  )
}

/**
 * Ctrl/Cmd+Enter → `onGenerate`, also while typing in prompt editors
 * (capture phase, so CodeMirror's Mod-Enter does not insert a line).
 * Ignored when `enabled` is false or a dialog is open.
 */
export function useGenerateShortcut(onGenerate: () => void, enabled: boolean) {
  const ref = useRef({ onGenerate, enabled })
  ref.current = { onGenerate, enabled }
  const lastRef = useRef(0)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!isGenerateShortcut(e) || e.isComposing) return
      if (document.querySelector(MODAL_SELECTOR)) return
      // Consume the key even when disabled so editors don't insert a newline.
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat || !ref.current.enabled) return
      // Same 1s cooldown as the Generate buttons
      const now = Date.now()
      if (now - lastRef.current < GENERATE_COOLDOWN_MS) return
      lastRef.current = now
      ref.current.onGenerate()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])
}

/**
 * Shared 1s Generate cooldown for the button and the shortcut: `trigger`
 * runs `onGenerate` unless cooling down, then starts the cooldown. Pass
 * `trigger` and `enabled && !cooldown` to `useGenerateShortcut` so a click
 * and a Ctrl/Cmd+Enter within 1s cannot queue two batches.
 */
export function useGenerateCooldown(onGenerate: () => void) {
  const [cooldown, setCooldown] = useState(false)
  const coolingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onGenerateRef = useRef(onGenerate)
  onGenerateRef.current = onGenerate

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const trigger = useCallback(() => {
    if (coolingRef.current) return
    coolingRef.current = true
    setCooldown(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      coolingRef.current = false
      setCooldown(false)
    }, GENERATE_COOLDOWN_MS)
    onGenerateRef.current()
  }, [])

  return { cooldown, trigger }
}
