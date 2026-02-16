import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'

interface GenerationProgressProps {
  jobs: Array<{
    id: number
    sceneName: string | null
    status: string | null
    totalCount: number | null
    completedCount: number | null
  }>
  batchTotal: number
  onCancel: () => void
}

export function GenerationProgress({ jobs, batchTotal, onCancel }: GenerationProgressProps) {
  if (jobs.length === 0) return null

  // Compute completed from batchTotal - remaining work in active jobs
  const remaining = jobs.reduce(
    (sum, j) => sum + ((j.totalCount ?? 0) - (j.completedCount ?? 0)),
    0,
  )
  const completed = Math.max(0, batchTotal - remaining)
  const pct = batchTotal > 0 ? (completed / batchTotal) * 100 : 0

  return (
    <div className="flex items-center gap-2 max-w-sm w-full">
      <div className="flex-1 min-w-0">
        {/* Per-scene status chips */}
        <div className="flex items-center gap-1.5 mb-0.5 overflow-x-auto">
          {jobs.map((job) => {
            const isRunning = job.status === 'running'
            return (
              <span
                key={job.id}
                className={`inline-flex items-center gap-1 text-[10px] shrink-0 ${
                  isRunning ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {isRunning && (
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                )}
                <span className="truncate max-w-[80px]">{job.sceneName ?? 'Scene'}</span>
                <span className="tabular-nums">
                  {job.completedCount ?? 0}/{job.totalCount ?? 0}
                </span>
              </span>
            )
          })}
        </div>
        {/* Overall progress bar */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {completed}/{batchTotal}
          </span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onCancel}
        className="text-muted-foreground hover:text-destructive shrink-0"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
      </Button>
    </div>
  )
}
