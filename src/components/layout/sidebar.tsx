import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import {
  Home03Icon,
  Image02Icon,
  Settings02Icon,
  FileSearchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from '@/lib/i18n'
import type { TranslationKeys } from '@/lib/i18n'

const navItems = [
  { to: '/', key: 'nav.projects' as TranslationKeys, icon: Home03Icon },
  { to: '/gallery', key: 'nav.gallery' as TranslationKeys, icon: Image02Icon },
  { to: '/inspect', key: 'nav.inspect' as TranslationKeys, icon: FileSearchIcon },
  { to: '/settings', key: 'nav.settings' as TranslationKeys, icon: Settings02Icon },
] as const

export function Sidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const { t } = useTranslation()

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-56 flex-col border-r border-border bg-background">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="size-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">87</span>
        </div>
        <span className="font-semibold text-foreground tracking-tight">Studio</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 pt-2" role="navigation" aria-label="Main navigation">
        {navItems.map((item) => {
          const isActive =
            item.to === '/' ? currentPath === '/' : currentPath.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-base transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <HugeiconsIcon icon={item.icon} className="size-5" />
              {t(item.key)}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
