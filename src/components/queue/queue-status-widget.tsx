import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from '@/lib/i18n'
import { fetchQueueSummary } from '@/server/functions/queue'

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

export function QueueStatusWidget() {
  const { t } = useTranslation()

  const { data: summary } = useQuery({
    queryKey: ['queue-summary'],
    queryFn: () => fetchQueueSummary(),
    refetchInterval: 2000,
  })

  if (!summary) return null

  const { globalStats, queueStopped } = summary
  const totalPendingImages = globalStats.totalPendingImages

  if (totalPendingImages === 0) return null

  const totalImages = globalStats.totalImages
  const completedImages = globalStats.completedImages
  const etaMs = globalStats.etaMs

  const pct = totalImages > 0 ? (completedImages / totalImages) * 100 : 0

  const isPaused = queueStopped === 'paused'
  const isError = queueStopped === 'error'

  const barColor = isError
    ? 'bg-destructive'
    : isPaused
      ? 'bg-muted-foreground/40'
      : 'bg-primary'

  const textColor = isError
    ? 'text-destructive'
    : isPaused
      ? 'text-muted-foreground'
      : 'text-primary'

  return (
    <Link
      to="/queue"
      search={{ imageDetail: undefined }}
      className="block px-3 py-2.5 rounded-lg hover:bg-accent transition-colors group"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`text-xs font-medium ${textColor}`}>
          {isPaused
            ? t('queue.paused' as any)
            : isError
              ? t('queue.error' as any)
              : t('queue.title' as any)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {completedImages}/{totalImages}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {etaMs != null && !isPaused && !isError && (
        <p className="text-[11px] text-muted-foreground mt-1">
          {t('queue.eta' as any, { time: formatDuration(etaMs) })}
        </p>
      )}
    </Link>
  )
}
