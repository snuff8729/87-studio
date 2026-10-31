import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, InformationCircleIcon } from '@hugeicons/core-free-icons'
import { useDataset } from './use-data-files'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { formatBytes } from '@/lib/data-manifest'

const DISMISS_KEY = '87studio-data-hint-dismissed'

/** Dashboard: one dismissible line pointing at Settings > Data. */
export function DataHintLine() {
  const { t } = useTranslation()
  const d = useDataset('danbooru')
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])
  if (dismissed || !d || d.installedVersion != null) return null
  return (
    <div
      className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
      data-data-hint
    >
      <HugeiconsIcon
        icon={InformationCircleIcon}
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 text-muted-foreground">
        {t('data.dashboardHint', { size: formatBytes(d.size) })}
      </span>
      <Button size="sm" variant="outline" asChild>
        <Link
          to="/settings"
          search={{ imageDetail: undefined }}
          hash="settings-data"
          data-data-hint-open
        >
          {t('data.dashboardAction')}
        </Link>
      </Button>
      <button
        type="button"
        aria-label={t('data.dismiss')}
        title={t('data.dismiss')}
        className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          setDismissed(true)
          try {
            localStorage.setItem(DISMISS_KEY, '1')
          } catch {
            /* ignore */
          }
        }}
        data-data-hint-dismiss
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </button>
    </div>
  )
}
