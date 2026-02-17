import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import {
  Home03Icon,
  Image02Icon,
  Settings02Icon,
  FileSearchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

const navItems = [
  { to: '/', label: 'Projects', icon: Home03Icon },
  { to: '/gallery', label: 'Gallery', icon: Image02Icon },
  { to: '/inspect', label: 'Inspect', icon: FileSearchIcon },
  { to: '/settings', label: 'Settings', icon: Settings02Icon },
] as const

export function BottomNav() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm" role="navigation" aria-label="Main navigation">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive =
            item.to === '/' ? currentPath === '/' : currentPath.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <HugeiconsIcon icon={item.icon} className="size-5" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
