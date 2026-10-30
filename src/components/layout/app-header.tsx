import { Fragment } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { getActiveNavItem } from './nav-items'
import { useBreadcrumbItems } from './breadcrumb-context'
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

export function AppHeader() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const pageItems = useBreadcrumbItems()
  const activeItem = getActiveNavItem(pathname)

  const items: Array<BreadcrumbEntry> =
    pageItems ?? (activeItem ? [{ label: t(activeItem.key) }] : [])

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-vertical:h-4 data-vertical:self-center"
      />
      <Breadcrumb>
        <BreadcrumbList>
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
    </header>
  )
}
