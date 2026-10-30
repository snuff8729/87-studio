import * as React from 'react'
import { useRouterState } from '@tanstack/react-router'
import { shouldAutoCollapse } from './nav-items'
import { useSidebar } from '@/components/ui/sidebar'

/** Must match MOBILE_BREAKPOINT in hooks/use-mobile.ts */
const MOBILE_BREAKPOINT = 768

/**
 * Collapses the desktop sidebar once when entering an editor route and closes
 * the mobile sheet on every navigation.
 */
export function SidebarRouteSync(): null {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { setOpen, isMobile, setOpenMobile } = useSidebar()
  const prevRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const prev = prevRef.current
    // Guard: only act when the pathname actually changed (other deps change
    // identity whenever the sidebar toggles).
    if (prev === pathname) return
    prevRef.current = pathname
    // useIsMobile reports false until its own effect runs (after this one on
    // first mount), so also check the viewport directly.
    const mobile = isMobile || window.innerWidth < MOBILE_BREAKPOINT
    if (mobile) {
      setOpenMobile(false)
    } else if (shouldAutoCollapse(prev, pathname)) {
      setOpen(false)
    }
  }, [pathname, setOpen, isMobile, setOpenMobile])

  return null
}
