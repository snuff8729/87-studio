import { useCallback, useEffect, useState } from 'react'

export const EDITOR_TAB_KEY_PREFIX = '87studio-editor-tab:'
export const EDITOR_LAYOUT_KEY_PREFIX = '87studio-editor-layout:'

export const PANEL_LEFT = 'left'
export const PANEL_CENTER = 'center'
export const PANEL_RIGHT = 'right'

/** Panel sizes as percentages of the shell width. */
export type EditorLayout = {
  [PANEL_LEFT]: number
  [PANEL_CENTER]: number
  [PANEL_RIGHT]: number
}

export const LAYOUT_DEFAULT: EditorLayout = { left: 24, center: 66, right: 10 }
export const LAYOUT_LIMITS = {
  left: { min: 18, max: 40 },
  center: { min: 30 },
  right: { min: 7, max: 30 },
} as const

/** Tolerance for floating point drift in sizes reported by the library. */
const EPSILON = 0.5

export function defaultEditorLayout(rightCollapsed = false): EditorLayout {
  if (!rightCollapsed) return { ...LAYOUT_DEFAULT }
  return {
    left: LAYOUT_DEFAULT.left,
    center: LAYOUT_DEFAULT.center + LAYOUT_DEFAULT.right,
    right: 0,
  }
}

function isCollapsedSize(size: number): boolean {
  return size < EPSILON
}

function sideValid(size: number, min: number, max: number): boolean {
  return (
    isCollapsedSize(size) || (size >= min - EPSILON && size <= max + EPSILON)
  )
}

/**
 * Parses a persisted layout. Returns `null` for anything that is not a
 * well-formed layout satisfying the panel constraints, so callers fall back
 * to defaults.
 */
export function parseEditorLayout(raw: string | null): EditorLayout | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  const { left, center, right } = obj
  if (
    typeof left !== 'number' ||
    typeof center !== 'number' ||
    typeof right !== 'number' ||
    !Number.isFinite(left) ||
    !Number.isFinite(center) ||
    !Number.isFinite(right)
  ) {
    return null
  }
  if (Math.abs(left + center + right - 100) > 1) return null
  if (!sideValid(left, LAYOUT_LIMITS.left.min, LAYOUT_LIMITS.left.max)) {
    return null
  }
  if (!sideValid(right, LAYOUT_LIMITS.right.min, LAYOUT_LIMITS.right.max)) {
    return null
  }
  if (center < LAYOUT_LIMITS.center.min - EPSILON) return null
  return {
    left: isCollapsedSize(left) ? 0 : left,
    center,
    right: isCollapsedSize(right) ? 0 : right,
  }
}

export function isPanelCollapsed(size: number | undefined): boolean {
  return size !== undefined && isCollapsedSize(size)
}

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode, quota, disabled) — ignore.
  }
}

/**
 * Active tab persisted per shell under `87studio-editor-tab:<id>`.
 * SSR-safe: the first tab is used until storage is read after mount.
 * Unknown stored ids (or an active id that disappeared from `tabIds`)
 * resolve to the first tab.
 */
export function usePersistedTab(
  id: string,
  tabIds: Array<string>,
): [string, (t: string) => void] {
  const first = tabIds.length > 0 ? tabIds[0] : ''
  const [active, setActive] = useState<string>(first)
  const tabKey = tabIds.join('\u0000')

  useEffect(() => {
    const stored = readStorage(EDITOR_TAB_KEY_PREFIX + id)
    if (stored !== null && tabKey.split('\u0000').includes(stored)) {
      setActive(stored)
    }
  }, [id, tabKey])

  const setTab = useCallback(
    (t: string) => {
      setActive(t)
      writeStorage(EDITOR_TAB_KEY_PREFIX + id, t)
    },
    [id],
  )

  return [tabIds.includes(active) ? active : first, setTab]
}
