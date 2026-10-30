import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Coins01Icon } from '@hugeicons/core-free-icons'
import type { NaiAccountSummary } from '@/server/services/nai-account'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useSidebar } from '@/components/ui/sidebar'
import { useQueueSummary } from '@/components/queue/queue-status-widget'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { getNaiAccount } from '@/server/functions/settings'

export const NAI_ACCOUNT_KEY = ['nai-account'] as const

/** Account summary for the saved key (null = no key / fetch failed). */
export function useNaiAccount() {
  return useQuery({
    queryKey: NAI_ACCOUNT_KEY,
    queryFn: () => getNaiAccount(),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: false,
  })
}

/** Refresh the account when generation progress changes (Anlas were spent). */
function useInvalidateOnProgress() {
  const queryClient = useQueryClient()
  const { data: summary } = useQueueSummary()
  const completed = summary?.globalStats.completedImages
  const pending = summary?.globalStats.totalPendingImages
  const prev = useRef<{ c?: number; p?: number } | null>(null)
  useEffect(() => {
    if (summary == null) return
    const last = prev.current
    prev.current = { c: completed, p: pending }
    if (!last) return
    if (last.c !== completed || (last.p ?? 0) > 0 !== (pending ?? 0) > 0) {
      void queryClient.invalidateQueries({ queryKey: NAI_ACCOUNT_KEY })
    }
  }, [summary, completed, pending, queryClient])
}

export function useAccountFormatters() {
  const { t, locale } = useTranslation()
  const fmt = (n: number) => n.toLocaleString(locale)
  const tierLabel = (a: NaiAccountSummary) => {
    if (a.opus) return t('account.tierOpus')
    switch (a.tier) {
      case 0:
        return t('account.tierPaper')
      case 1:
        return t('account.tierTablet')
      case 2:
        return t('account.tierScroll')
      case 3:
        return t('account.tierOpus')
      default:
        return t('account.tierUnknown', { n: a.tier })
    }
  }
  const duration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return h > 0
      ? t('account.hm', { h, m })
      : t('account.m', { m: Math.max(1, m) })
  }
  return { fmt, tierLabel, duration }
}

/** Multi-line summary used in the sidebar tooltip. */
function AccountTooltipBody({ account }: { account: NaiAccountSummary }) {
  const { t } = useTranslation()
  const { fmt, tierLabel, duration } = useAccountFormatters()
  return (
    <div className="space-y-0.5 tabular-nums">
      <div className="font-medium">
        {t('account.anlasTotal', { total: fmt(account.anlas.total) })}
      </div>
      <div className="opacity-80">
        {t('account.monthly', { n: fmt(account.anlas.fixed) })} ·{' '}
        {t('account.purchased', { n: fmt(account.anlas.purchased) })}
      </div>
      {account.usage && (
        <>
          <div>{t('account.usage', { percent: account.usage.percent })}</div>
          {account.usage.secondsUntilNextPercent != null && (
            <div className="opacity-80">
              {t('account.nextPercent', {
                time: duration(account.usage.secondsUntilNextPercent),
              })}
            </div>
          )}
        </>
      )}
      <div className="opacity-80">
        {t('account.tier', { tier: tierLabel(account) })}
      </div>
    </div>
  )
}

/** Compact sidebar row: coin icon + Anlas + V5 usage (icon only when collapsed). */
export function SidebarAccountRow() {
  const { data: account } = useNaiAccount()
  const { fmt } = useAccountFormatters()
  const { isMobile, setOpenMobile } = useSidebar()
  useInvalidateOnProgress()
  if (!account) return null
  const negative = account.usage?.isNegative === true
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/settings"
          search={{ imageDetail: undefined }}
          data-testid="nai-account"
          onClick={() => {
            if (isMobile) setOpenMobile(false)
          }}
          className="flex h-8 items-center gap-2 overflow-hidden rounded-md px-2 text-xs text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2"
        >
          <HugeiconsIcon
            icon={Coins01Icon}
            className="size-4 shrink-0 text-primary"
          />
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap tabular-nums group-data-[collapsible=icon]:hidden">
            <span className="font-medium">{fmt(account.anlas.total)}</span>
            {account.usage && (
              <>
                <span className="text-muted-foreground">·</span>
                <span
                  className={cn(
                    negative ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  V5 {account.usage.percent}%
                </span>
              </>
            )}
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" hidden={isMobile}>
        <AccountTooltipBody account={account} />
      </TooltipContent>
    </Tooltip>
  )
}

/** Detail block for the Settings API key card. */
export function AccountSummary({ account }: { account: NaiAccountSummary }) {
  const { t } = useTranslation()
  const { fmt, tierLabel, duration } = useAccountFormatters()
  const negative = account.usage?.isNegative === true
  return (
    <div
      data-testid="account-summary"
      className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm tabular-nums"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-medium">
          {t('account.tier', { tier: tierLabel(account) })}
        </span>
        <span>
          {t('account.anlasTotal', { total: fmt(account.anlas.total) })}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {t('account.monthly', { n: fmt(account.anlas.fixed) })} ·{' '}
        {t('account.purchased', { n: fmt(account.anlas.purchased) })}
      </div>
      {account.usage && (
        <div
          className={cn(
            'text-xs',
            negative ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {t('account.usage', { percent: account.usage.percent })}
          {account.usage.secondsUntilNextPercent != null &&
            ` · ${t('account.nextPercent', { time: duration(account.usage.secondsUntilNextPercent) })}`}
        </div>
      )}
      {!account.opus && (
        <div className="text-xs text-amber-400">
          {t('account.spendWarning')}
        </div>
      )}
    </div>
  )
}
