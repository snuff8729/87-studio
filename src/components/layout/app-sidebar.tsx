import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
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
import { getAppInfo } from '@/server/functions/settings'

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
  const { isMobile, setOpenMobile } = useSidebar()
  const label = t(item.key)
  const hasBadge = badge != null && badge > 0
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={hasBadge ? `${label} (${badge})` : label}
      >
        <Link
          to={item.to}
          search={{ imageDetail: undefined }}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => {
            if (isMobile) setOpenMobile(false)
          }}
        >
          <HugeiconsIcon icon={item.icon} />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {hasBadge && (
        <>
          {/* Expanded: standard badge (hidden by the primitive in icon mode) */}
          <SidebarMenuBadge>{badge}</SidebarMenuBadge>
          {/* Icon mode: compact count pinned to the icon's top-right corner */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-1 -right-1 hidden h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums group-data-[collapsible=icon]:flex"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        </>
      )}
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { t } = useTranslation()
  const { state, isMobile } = useSidebar()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const activeTo = getActiveNavItem(pathname)?.to
  const { data: queueSummary } = useQueueSummary()
  const pendingImages = queueSummary?.globalStats.totalPendingImages ?? 0
  const { data: appInfo } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => getAppInfo(),
    staleTime: Infinity,
  })

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

      <SidebarContent role="navigation" aria-label={t('nav.mainNavigation')}>
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
        {appInfo?.naiMock && (
          <div
            data-testid="mock-badge"
            title="NAI_MOCK=1: no real NovelAI requests, images are fake"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-center text-[10px] font-bold tracking-widest text-amber-400 group-data-[collapsible=icon]:hidden"
          >
            MOCK
          </div>
        )}
        {(isMobile || state !== 'collapsed') && <QueueStatusWidget />}
        <SidebarMenu>{renderGroup('footer')}</SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
