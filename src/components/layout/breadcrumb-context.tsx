import * as React from 'react'
import { useRouterState } from '@tanstack/react-router'

export type BreadcrumbEntry = { label: string; to?: string }

type BreadcrumbState = {
  pathname: string
  items: Array<BreadcrumbEntry>
} | null

type BreadcrumbContextValue = {
  state: BreadcrumbState
  setState: React.Dispatch<React.SetStateAction<BreadcrumbState>>
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
  const [state, setState] = React.useState<BreadcrumbState>(null)
  const value = React.useMemo(() => ({ state, setState }), [state])
  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

/**
 * Sets the header breadcrumb for the current page. Items are tied to the
 * pathname they were set on, so they reset automatically on route change,
 * and are cleared when the calling component unmounts.
 */
export function useBreadcrumb(items: Array<BreadcrumbEntry>): void {
  const { setState } = useBreadcrumbContext()
  const pathname = usePathname()
  const serialized = JSON.stringify(items)

  React.useEffect(() => {
    const entry: BreadcrumbState = {
      pathname,
      items: JSON.parse(serialized) as Array<BreadcrumbEntry>,
    }
    setState(entry)
    return () => setState((prev) => (prev === entry ? null : prev))
  }, [pathname, serialized, setState])
}

/** Breadcrumb items set by the current page, or null when none were set. */
export function useBreadcrumbItems(): Array<BreadcrumbEntry> | null {
  const { state } = useBreadcrumbContext()
  const pathname = usePathname()
  if (!state || state.pathname !== pathname) return null
  return state.items
}
