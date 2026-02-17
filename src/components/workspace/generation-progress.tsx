import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, PauseIcon, PlayIcon, NextIcon } from '@hugeicons/core-free-icons'

interface GenerationProgressProps {
  jobs: Array<{
    id: number
    sceneName: string | null
    status: string | null
    totalCount: number | null
    completedCount: number | null
    errorMessage?: string | null
  }>
  batchTotal: number
  batchTiming: {
    startedAt: number
    totalImages: number
    completedImages: number
    avgImageDurationMs: number | null
  } | null
  queueStopped: 'error' | 'paused' | null
  onCancel: () => void
  onPause: () => void
  onResume: () => void
  onDismissError: () => void
}

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

export function GenerationProgress({ jobs, batchTotal, batchTiming, queueStopped, onCancel, onPause, onResume, onDismissError }: GenerationProgressProps) {
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  // Elapsed timer — use server startedAt so it survives page refresh/navigation
  const hasJobs = jobs.length > 0
  const isPaused = queueStopped === 'paused'
  const isError = queueStopped === 'error'
  const isStopped = isPaused || isError

  useEffect(() => {
    if (!hasJobs) {
      startRef.current = null
      setElapsed(0)
      return
    }
    if (batchTiming?.startedAt) {
      startRef.current = batchTiming.startedAt
    } else if (startRef.current == null) {
      startRef.current = Date.now()
    }
    // Don't tick when stopped
    if (isStopped) {
      setElapsed(Date.now() - startRef.current!)
      return
    }
    const tick = () => setElapsed(Date.now() - startRef.current!)
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [hasJobs, batchTiming?.startedAt, isStopped])

  if (jobs.length === 0) return null

  // Prefer server-side batch data (survives page refresh), fall back to client-side calculation
  const total = batchTiming?.totalImages ?? batchTotal
  const completed = batchTiming?.completedImages
    ?? Math.max(0, batchTotal - jobs.reduce((sum, j) => sum + ((j.totalCount ?? 0) - (j.completedCount ?? 0)), 0))
  const remaining = total - completed
  const pct = total > 0 ? (completed / total) * 100 : 0

  const avgMs = batchTiming?.avgImageDurationMs ?? null
  const etaMs = avgMs != null && remaining > 0 ? remaining * avgMs : null

  // Bar color based on state
  const barColor = isError
    ? 'bg-destructive'
    : isPaused
      ? 'bg-amber-500'
      : 'bg-primary'

  // Status label for compact bar
  const statusLabel = isError ? 'Error' : isPaused ? 'Paused' : null

  // Action handler that also closes popover
  const withClose = (fn: () => void) => () => { setOpen(false); fn() }

  return (
    <div className="flex items-center gap-1 sm:gap-1.5 max-w-[200px] sm:max-w-[280px] w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 h-8 px-1.5 sm:px-2 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer"
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
                  <span className={isError ? 'text-destructive font-medium' : 'text-amber-500 font-medium'}>
                    {statusLabel}
                  </span>
                  <span className="text-muted-foreground/50 hidden sm:inline">&middot;</span>
                </>
              )}
              <span className={statusLabel ? 'hidden sm:inline' : ''}>{completed}/{total}</span>
              {!isStopped && (
                <span className="hidden sm:contents">
                  <span className="text-muted-foreground/50">&middot;</span>
                  {etaMs != null ? (
                    <>
                      <span>{formatRate(avgMs!)}/img</span>
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
                Generation Progress
                {isPaused && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-500">
                    Paused
                  </span>
                )}
                {isError && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive">
                    Error
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
              <span>Elapsed {formatElapsed(elapsed)}</span>
              {avgMs != null && (
                <>
                  <span className="text-muted-foreground/30">&middot;</span>
                  <span>{formatRate(avgMs)}/img</span>
                </>
              )}
              {etaMs != null && !isStopped && (
                <>
                  <span className="text-muted-foreground/30">&middot;</span>
                  <span>~{formatDuration(etaMs)} left</span>
                </>
              )}
            </div>

            {/* Action buttons inside popover (accessible on all screen sizes) */}
            <div className="flex items-center gap-1.5 pt-1">
              {!isStopped ? (
                <>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={withClose(onPause)}>
                    <HugeiconsIcon icon={PauseIcon} className="size-4" />
                    Pause
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={withClose(onCancel)}>
                    <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                    Cancel
                  </Button>
                </>
              ) : isError ? (
                <>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={withClose(onResume)}>
                    <HugeiconsIcon icon={PlayIcon} className="size-4" />
                    Retry
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={withClose(onDismissError)}>
                    <HugeiconsIcon icon={NextIcon} className="size-4" />
                    Skip
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={withClose(onCancel)}>
                    <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={withClose(onResume)}>
                    <HugeiconsIcon icon={PlayIcon} className="size-4" />
                    Resume
                  </Button>
                  <Button variant="secondary" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={withClose(onCancel)}>
                    <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Per-scene list */}
          <div className="border-t border-border max-h-52 overflow-y-auto">
            {jobs.map((job) => {
              const isRunning = job.status === 'running'
              const isFailed = job.status === 'failed'
              const jobCompleted = job.completedCount ?? 0
              const jobTotal = job.totalCount ?? 0
              const jobPct = jobTotal > 0 ? (jobCompleted / jobTotal) * 100 : 0

              return (
                <div key={job.id} className="px-3 py-1.5">
                  <div
                    className={`flex items-center gap-2 ${
                      isRunning ? 'bg-primary/5' : isFailed ? 'bg-destructive/5' : ''
                    }`}
                  >
                    {isFailed ? (
                      <span className="size-1.5 rounded-full bg-destructive shrink-0" />
                    ) : isRunning ? (
                      <span className="size-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                    )}
                    <span className={`text-xs truncate flex-1 min-w-0 ${
                      isFailed ? 'text-destructive' : isRunning ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      {job.sceneName ?? 'Scene'}
                    </span>
                    <div className="w-16 h-1 rounded-full bg-secondary overflow-hidden shrink-0">
                      <div
                        className={`h-full rounded-full ${isFailed ? 'bg-destructive' : 'bg-primary'} transition-all duration-300`}
                        style={{ width: `${jobPct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-10 text-right">
                      {jobCompleted}/{jobTotal}
                    </span>
                  </div>
                  {isFailed && job.errorMessage && (
                    <p className="text-[11px] text-destructive/80 mt-0.5 ml-3.5 line-clamp-2">
                      {job.errorMessage}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* External action buttons — hidden on mobile, visible on sm+ */}
      <div className="hidden sm:flex items-center gap-1">
        {!isStopped ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onPause}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Pause"
            >
              <HugeiconsIcon icon={PauseIcon} className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCancel}
              className="text-muted-foreground hover:text-destructive shrink-0"
              title="Cancel"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
            </Button>
          </>
        ) : isError ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onResume}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Resume (retry)"
            >
              <HugeiconsIcon icon={PlayIcon} className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDismissError}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Skip"
            >
              <HugeiconsIcon icon={NextIcon} className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCancel}
              className="text-muted-foreground hover:text-destructive shrink-0"
              title="Cancel all"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onResume}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Resume"
            >
              <HugeiconsIcon icon={PlayIcon} className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCancel}
              className="text-muted-foreground hover:text-destructive shrink-0"
              title="Cancel all"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
