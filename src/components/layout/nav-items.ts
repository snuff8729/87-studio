import {
  BookmarkCheck01Icon,
  FileSearchIcon,
  Home03Icon,
  Image02Icon,
  MagicWand01Icon,
  Package01Icon,
  Settings02Icon,
  TimeQuarter02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import type { TranslationKeys } from '@/lib/i18n'

export type NavItem = {
  to:
    | '/'
    | '/generate'
    | '/queue'
    | '/gallery'
    | '/bundles'
    | '/characters'
    | '/tags'
    | '/metadata'
    | '/settings'
  key: TranslationKeys
  icon: IconSvgElement
  group: 'create' | 'library' | 'footer'
}

export const navItems: ReadonlyArray<NavItem> = [
  { to: '/', key: 'nav.projects', icon: Home03Icon, group: 'create' },
  {
    to: '/generate',
    key: 'nav.generate',
    icon: MagicWand01Icon,
    group: 'create',
  },
  { to: '/queue', key: 'nav.queue', icon: TimeQuarter02Icon, group: 'create' },
  { to: '/gallery', key: 'nav.gallery', icon: Image02Icon, group: 'library' },
  { to: '/bundles', key: 'nav.bundles', icon: Package01Icon, group: 'library' },
  {
    to: '/characters',
    key: 'library.nav',
    icon: UserGroupIcon,
    group: 'library',
  },
  { to: '/tags', key: 'nav.tags', icon: BookmarkCheck01Icon, group: 'library' },
  {
    to: '/metadata',
    key: 'nav.metadata',
    icon: FileSearchIcon,
    group: 'library',
  },
  {
    to: '/settings',
    key: 'nav.settings',
    icon: Settings02Icon,
    group: 'footer',
  },
]

function matchesPath(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(to + '/')
}

export function getActiveNavItem(pathname: string): NavItem | undefined {
  return navItems.find((item) => matchesPath(pathname, item.to))
}

export function isEditorRoute(pathname: string): boolean {
  return (
    matchesPath(pathname, '/generate') || pathname.startsWith('/workspace/')
  )
}

export function shouldAutoCollapse(prev: string | null, next: string): boolean {
  return isEditorRoute(next) && !(prev !== null && isEditorRoute(prev))
}
