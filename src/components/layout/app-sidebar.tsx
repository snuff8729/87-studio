import { Link, useRouterState } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { getActiveNavItem, navItems } from './nav-items'
import type { NavItem } from './nav-items'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  QueueStatusWidget,
  useQueueSummary,
} from '@/components/queue/queue-status-widget'
import { useTranslation } from '@/lib/i18n'

function NavMenuItem({
  item,
  isActive,
  badge,
}: {
  item: NavItem
  isActive: boolean
  badge?: number
}) {
  const { t } = useTranslation()
  const label = t(item.key)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
        <Link
          to={item.to}
          search={{ imageDetail: undefined }}
          aria-current={isActive ? 'page' : undefined}
        >
          <HugeiconsIcon icon={item.icon} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {badge != null && badge > 0 && (
        <SidebarMenuBadge>{badge}</SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { t } = useTranslation()
  const { state } = useSidebar()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const activeTo = getActiveNavItem(pathname)?.to
  const { data: queueSummary } = useQueueSummary()
  const pendingImages = queueSummary?.globalStats.totalPendingImages ?? 0

  const renderGroup = (group: NavItem['group']) =>
    navItems
      .filter((item) => item.group === group)
      .map((item) => (
        <NavMenuItem
          key={item.to}
          item={item}
          isActive={activeTo === item.to}
          badge={item.to === '/queue' ? pendingImages : undefined}
        />
      ))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="87 Studio">
              <Link to="/" search={{ imageDetail: undefined }}>
                <div className="bg-brand-gradient flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg">
                  <span className="text-xs font-bold text-white">87</span>
                </div>
                <span className="truncate font-semibold tracking-tight">
                  87 Studio
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.groupCreate')}</SidebarGroupLabel>
          <SidebarMenu>{renderGroup('create')}</SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.groupLibrary')}</SidebarGroupLabel>
          <SidebarMenu>{renderGroup('library')}</SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {state !== 'collapsed' && <QueueStatusWidget />}
        <SidebarMenu>{renderGroup('footer')}</SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
