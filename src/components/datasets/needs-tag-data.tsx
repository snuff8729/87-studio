import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { useDataActions, useDataset } from './use-data-files'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { formatBytes } from '@/lib/data-manifest'
import { cn } from '@/lib/utils'

/** Shown where tag data is required but the Danbooru DB is not installed. */
export function NeedsTagData({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const d = useDataset('danbooru')
  const { install } = useDataActions()
  const downloading = d?.state === 'downloading'
  return (
    <div
      className={cn('flex flex-col items-start gap-3 p-4 text-sm', className)}
      data-needs-tag-data
    >
      <div className="space-y-1">
        <p className="font-medium">{t('data.needTitle')}</p>
        <p className="text-xs text-muted-foreground">
          {t('data.needBody', { size: formatBytes(d?.size ?? 0) })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!d || downloading || install.isPending}
          onClick={() => install.mutate('danbooru')}
          data-needs-install
        >
          {downloading ? (
            <>
              <HugeiconsIcon
                icon={Loading03Icon}
                className="size-3.5 animate-spin"
              />
              {t('data.needDownloading', { pct: d.pct ?? 0 })}
            </>
          ) : (
            t('data.needInstall')
          )}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link
            to="/settings"
            search={{ imageDetail: undefined }}
            hash="settings-data"
            onClick={onNavigate}
            data-needs-settings
          >
            {t('data.needOpenSettings')}
          </Link>
        </Button>
      </div>
      {d?.state === 'error' && (
        <p className="text-xs text-destructive">{d.error}</p>
      )}
    </div>
  )
}
