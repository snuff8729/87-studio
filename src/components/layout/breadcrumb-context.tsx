import * as React from 'react'
import { createPortal } from 'react-dom'
import { useRouterState } from '@tanstack/react-router'

export type BreadcrumbEntry = { label: string; to?: string }

type HeaderState = {
  pathname: string
  items: Array<BreadcrumbEntry> | null
  count: number | null
} | null

type BreadcrumbContextValue = {
  state: HeaderState
  setState: React.Dispatch<React.SetStateAction<HeaderState>>
  actionsEl: HTMLElement | null
  setActionsEl: (el: HTMLElement | null) => void
  selecting: boolean
  setSelecting: (selecting: boolean) => void
}

const BreadcrumbContext = React.createContext<BreadcrumbContextValue | null>(
  null,
)

function usePathname() {
  return useRouterState({ select: (s) => s.location.pathname })
}

function useBreadcrumbContext() {
  const ctx = React.useContext(BreadcrumbContext)
  if (!ctx) {
    throw new Error(
      'Breadcrumb hooks must be used within a BreadcrumbProvider.',
    )
  }
  return ctx
}

export function BreadcrumbProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [state, setState] = React.useState<HeaderState>(null)
  const [actionsEl, setActionsEl] = React.useState<HTMLElement | null>(null)
  const [selecting, setSelecting] = React.useState(false)
  const value = React.useMemo(
    () => ({
      state,
      setState,
      actionsEl,
      setActionsEl,
      selecting,
      setSelecting,
    }),
    [state, actionsEl, selecting],
  )
  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

/**
 * Sets the header breadcrumb and optional muted count for the current page.
 * Values are tied to the pathname they were set on, so they reset
 * automatically on route change, and are cleared when the calling component
 * unmounts. Omit `items` to keep the default nav label.
 */
export function usePageHeader({
  items,
  count,
}: {
  items?: Array<BreadcrumbEntry>
  count?: number | null
}): void {
  const { setState } = useBreadcrumbContext()
  const pathname = usePathname()
  const serialized = JSON.stringify(items ?? null)
  const countValue = count ?? null

  React.useEffect(() => {
    const entry: HeaderState = {
      pathname,
      items: JSON.parse(serialized) as Array<BreadcrumbEntry> | null,
      count: countValue,
    }
    setState(entry)
    return () => setState((prev) => (prev === entry ? null : prev))
  }, [pathname, serialized, countValue, setState])
}

/** Breadcrumb-only shorthand for `usePageHeader`. */
export function useBreadcrumb(items: Array<BreadcrumbEntry>): void {
  usePageHeader({ items })
}

/** Header state set by the current page, or null when none was set. */
export function usePageHeaderState(): {
  items: Array<BreadcrumbEntry> | null
  count: number | null
} | null {
  const { state } = useBreadcrumbContext()
  const pathname = usePathname()
  if (!state || state.pathname !== pathname) return null
  return state
}

/** Breadcrumb items set by the current page, or null when none were set. */
export function useBreadcrumbItems(): Array<BreadcrumbEntry> | null {
  return usePageHeaderState()?.items ?? null
}

/** Header internals: portal target ref and selection flag. */
export function useHeaderSlot() {
  const { setActionsEl, selecting } = useBreadcrumbContext()
  return { setActionsEl, selecting }
}

/**
 * Renders its children into the right side of the app header. With
 * `selecting` the header switches to the selection style (children are then
 * expected to be a selection header).
 */
export function HeaderActions({
  children,
  selecting = false,
}: {
  children: React.ReactNode
  selecting?: boolean
}) {
  const { actionsEl, setSelecting } = useBreadcrumbContext()

  React.useEffect(() => {
    setSelecting(selecting)
    return () => setSelecting(false)
  }, [selecting, setSelecting])

  if (!actionsEl) return null
  return createPortal(children, actionsEl)
}
