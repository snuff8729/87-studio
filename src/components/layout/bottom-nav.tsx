import { Link, useRouterState } from '@tanstack/react-router'
import {
  FileSearchIcon,
  Home03Icon,
  Image02Icon,
  MagicWand01Icon,
  Package01Icon,
  Settings02Icon,
  TimeQuarter02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { TranslationKeys } from '@/lib/i18n'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', key: 'nav.projects' as TranslationKeys, icon: Home03Icon },
  {
    to: '/generate',
    key: 'nav.generate' as TranslationKeys,
    icon: MagicWand01Icon,
  },
  {
    to: '/queue',
    key: 'nav.queue' as TranslationKeys,
    icon: TimeQuarter02Icon,
  },
  { to: '/gallery', key: 'nav.gallery' as TranslationKeys, icon: Image02Icon },
  {
    to: '/metadata',
    key: 'nav.metadata' as TranslationKeys,
    icon: FileSearchIcon,
  },
  {
    to: '/bundles',
    key: 'nav.bundles' as TranslationKeys,
    icon: Package01Icon,
  },
  {
    to: '/settings',
    key: 'nav.settings' as TranslationKeys,
    icon: Settings02Icon,
  },
] as const

export function BottomNav() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const { t } = useTranslation()

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive =
            item.to === '/'
              ? currentPath === '/'
              : currentPath.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              search={{ imageDetail: undefined }}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <HugeiconsIcon icon={item.icon} className="size-5" />
              {t(item.key)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
