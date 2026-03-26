import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTranslation } from '@/lib/i18n'
import {
  fetchQueueSummary,
  listQueueBatches,
} from '@/server/functions/queue'
import {
  pauseGeneration,
  resumeGeneration,
  dismissGenerationError,
} from '@/server/functions/generation'

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function formatRate(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

interface BatchInfo {
  id: number
  label: string | null
  status: string | null
  totalImages: number
  completedImages: number
}

export function GenerationProgress() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  // Self-polling state
  const [batches, setBatches] = useState<BatchInfo[]>([])
  const [summary, setSummary] = useState<Awaited<
    ReturnType<typeof fetchQueueSummary>
  > | null>(null)

  useEffect(() => {
    let active = true
    async function poll() {
      if (!active) return
      try {
        const [sum, batchList] = await Promise.all([
          fetchQueueSummary(),
          listQueueBatches(),
        ])
        if (!active) return
        setSummary(sum)
        setBatches(batchList)
      } catch {
        /* ignore */
      }
    }
    poll()
    const id = setInterval(poll, 2000)

    // Immediate refresh when a new batch is enqueued
    function onQueueUpdated() {
      poll()
    }
    window.addEventListener('queue-updated', onQueueUpdated)

    return () => {
      active = false
      clearInterval(id)
      window.removeEventListener('queue-updated', onQueueUpdated)
    }
  }, [])

  const totalImages = summary?.globalStats.totalImages ?? 0
  const completedImages = summary?.globalStats.completedImages ?? 0
  const totalPending = summary?.globalStats.totalPendingImages ?? 0
  const hasQueue = totalPending > 0 || (summary?.processing ?? false)

  const isPaused = summary?.queueStopped === 'paused'
  const isError = summary?.queueStopped === 'error'
  const isStopped = isPaused || isError

  // Elapsed timer
  useEffect(() => {
    if (!hasQueue) {
      startRef.current = null
      setElapsed(0)
      return
    }
    const serverStart = summary?.globalStats.sessionTiming?.startedAt
    if (serverStart) {
      startRef.current = serverStart
    } else if (startRef.current == null) {
      startRef.current = Date.now()
    }
    if (isStopped) {
      setElapsed(Date.now() - (startRef.current ?? Date.now()))
      return
    }
    const tick = () => setElapsed(Date.now() - (startRef.current ?? Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [hasQueue, summary?.globalStats.sessionTiming?.startedAt, isStopped])

  if (!hasQueue && batches.length === 0) return null

  const total = totalImages
  const completed = completedImages
  const remaining = totalPending
  const pct = total > 0 ? (completed / total) * 100 : 0

  const avgMs = summary?.globalStats.avgImageDurationMs ?? null
  const etaMs = avgMs != null && remaining > 0 ? remaining * avgMs : null

  const barColor = isError
    ? 'bg-destructive'
    : isPaused
      ? 'bg-muted-foreground/40'
      : 'bg-primary'

  const statusLabel = isError
    ? t('generation.error')
    : isPaused
      ? t('generation.paused')
      : null

  const withClose = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  async function handlePause() {
    await pauseGeneration()
  }
  async function handleResume() {
    await resumeGeneration()
  }
  async function handleDismissError() {
    await dismissGenerationError()
  }

  return (
    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="min-w-0 max-w-[200px] sm:max-w-[260px] flex items-center gap-1.5 sm:gap-2 h-8 px-1.5 sm:px-2 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer"
          >
            {/* Progress bar */}
            <div className="flex-1 min-w-8 sm:min-w-12 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-500 ease-out`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Compact stats */}
            <span className="text-xs text-muted-foreground tabular-nums shrink-0 flex items-center gap-1">
              {statusLabel && (
                <>
                  <span
                    className={
                      isError
                        ? 'text-destructive font-medium'
                        : 'text-muted-foreground font-medium'
                    }
                  >
                    {statusLabel}
                  </span>
                  <span className="text-muted-foreground/50 hidden sm:inline">
                    &middot;
                  </span>
                </>
              )}
              <span className={statusLabel ? 'hidden sm:inline' : ''}>
                {completed}/{total}
              </span>
              {!isStopped && (
                <span className="hidden sm:contents">
                  <span className="text-muted-foreground/50">&middot;</span>
                  {etaMs != null ? (
                    <>
                      <span>
                        {formatRate(avgMs!)}
                        {t('generation.perImg')}
                      </span>
                      <span className="text-muted-foreground/50">&middot;</span>
                      <span>~{formatDuration(etaMs)}</span>
                    </>
                  ) : (
                    <span>{formatElapsed(elapsed)}</span>
                  )}
                </span>
              )}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" className="w-72 p-0">
          <div className="p-3 space-y-2">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                {t('generation.progress')}
                {isPaused && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted-foreground/40/15 text-muted-foreground">
                    {t('generation.paused')}
                  </span>
                )}
                {isError && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive">
                    {t('generation.error')}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {completed}/{total}
              </span>
            </div>

            {/* Overall bar */}
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all duration-500 ease-out`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Timing row */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
              <span>
                {t('generation.elapsed')} {formatElapsed(elapsed)}
              </span>
              {avgMs != null && (
                <>
                  <span className="text-muted-foreground/30">&middot;</span>
                  <span>
                    {formatRate(avgMs)}
                    {t('generation.perImg')}
                  </span>
                </>
              )}
              {etaMs != null && !isStopped && (
                <>
                  <span className="text-muted-foreground/30">&middot;</span>
                  <span>
                    ~{formatDuration(etaMs)} {t('generation.left')}
                  </span>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 pt-1">
              {!isStopped ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={withClose(handlePause)}
                  >
                    <HugeiconsIcon icon={PauseIcon} className="size-4" />
                    {t('generation.pause')}
                  </Button>
                </>
              ) : isError ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={withClose(handleResume)}
                  >
                    <HugeiconsIcon icon={PlayIcon} className="size-4" />
                    {t('generation.retry')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={withClose(handleDismissError)}
                  >
                    <HugeiconsIcon icon={NextIcon} className="size-4" />
                    {t('generation.skip')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={withClose(handleResume)}
                >
                  <HugeiconsIcon icon={PlayIcon} className="size-4" />
                  {t('generation.resume')}
                </Button>
              )}
            </div>
          </div>

          {/* Link to full queue */}
          <div className="px-3 pb-1">
            <Link
              to="/queue"
              search={{ imageDetail: undefined }}
              className="text-xs text-primary hover:underline"
              onClick={() => setOpen(false)}
            >
              {t('queue.viewFullQueue' as any)}
            </Link>
          </div>

          {/* Per-batch list */}
          <div className="border-t border-border max-h-52 overflow-y-auto">
            {batches.map((batch) => {
              const isRunning = batch.status === 'running'
              const batchPct =
                batch.totalImages > 0
                  ? (batch.completedImages / batch.totalImages) * 100
                  : 0

              return (
                <div key={batch.id} className="px-3 py-1.5">
                  <div
                    className={`flex items-center gap-2 ${
                      isRunning ? 'bg-primary/5' : ''
                    }`}
                  >
                    {isRunning ? (
                      <span className="size-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                    )}
                    <span
                      className={`text-xs truncate flex-1 min-w-0 ${
                        isRunning
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {batch.label ?? `Batch #${batch.id}`}
                    </span>
                    <div className="w-16 h-1 rounded-full bg-secondary overflow-hidden shrink-0">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${batchPct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-10 text-right">
                      {batch.completedImages}/{batch.totalImages}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* External action buttons — hidden on mobile, visible on sm+ */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {!isStopped ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handlePause}
            className="text-muted-foreground hover:text-foreground shrink-0"
            title="Pause"
          >
            <HugeiconsIcon icon={PauseIcon} className="size-5" />
          </Button>
        ) : isError ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleResume}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Resume (retry)"
            >
              <HugeiconsIcon icon={PlayIcon} className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDismissError}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Skip"
            >
              <HugeiconsIcon icon={NextIcon} className="size-5" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleResume}
            className="text-muted-foreground hover:text-foreground shrink-0"
            title="Resume"
          >
            <HugeiconsIcon icon={PlayIcon} className="size-5" />
          </Button>
        )}
      </div>
    </div>
  )
}
