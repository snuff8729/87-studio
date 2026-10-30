import { Fragment } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { getActiveNavItem } from './nav-items'
import { useHeaderSlot, usePageHeaderState } from './breadcrumb-context'
import type { BreadcrumbEntry } from './breadcrumb-context'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function AppHeader() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const pageState = usePageHeaderState()
  const { setActionsEl, selecting } = useHeaderSlot()
  const pageItems = pageState?.items ?? null
  const count = pageState?.count ?? null
  const activeItem = getActiveNavItem(pathname)

  const items: Array<BreadcrumbEntry> =
    pageItems ?? (activeItem ? [{ label: t(activeItem.key) }] : [])

  return (
    <header
      data-app-header
      className={cn(
        'sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b px-3',
        selecting ? 'bg-primary/10' : 'bg-background',
      )}
    >
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-vertical:h-4 data-vertical:self-center"
      />
      <Breadcrumb className={cn('min-w-0', selecting && 'hidden')}>
        <BreadcrumbList className="flex-nowrap">
          {items.map((item, i) => {
            const isLast = i === items.length - 1
            return (
              <Fragment key={`${i}-${item.label}`}>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  ) : item.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={item.to} search={{ imageDetail: undefined }}>
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <span>{item.label}</span>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {count !== null && !selecting && (
        <span
          data-header-count
          className="text-sm text-muted-foreground tabular-nums"
        >
          {count}
        </span>
      )}
      <div
        ref={setActionsEl}
        data-header-actions
        className={cn(
          'ml-auto flex min-w-0 items-center gap-1.5',
          selecting && 'flex-1',
        )}
      />
    </header>
  )
}
