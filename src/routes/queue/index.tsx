import { Link, createFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  ArrowReloadHorizontalIcon,
  ArrowUpRight,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  DragDropVerticalIcon,
  PauseIcon,
  PlayIcon,
  TimeQuarter02Icon,
} from '@hugeicons/core-free-icons'
import type { DragEndEvent } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useTranslation } from '@/lib/i18n'
import {
  cancelBatch,
  fetchQueueSummary,
  getBatchJobs,
  getJobPrompts,
  listQueueBatches,
  listRecentBatches,
  reorderBatchJobsFn,
  reorderQueueBatches,
  retryBatch,
} from '@/server/functions/queue'
import {
  pauseGeneration,
  resumeGeneration,
} from '@/server/functions/generation'

export const Route = createFileRoute('/queue/')({
  component: QueuePage,
})

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`
}

// ---- SortableBatchRow ----

interface BatchData {
  id: number
  projectId: number | null
  label: string | null
  queueOrder: number | null
  status: string | null
  createdAt: string | null
  jobCount: number
  totalImages: number
  completedImages: number
}

interface SortableBatchRowProps {
  batch: BatchData
  onCancel: (batchId: number) => void
  onRetry: (batchId: number) => void
  queuePaused: boolean
}

function SortableBatchRow({ batch, onCancel, queuePaused }: SortableBatchRowProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: batch.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const { data: jobs } = useQuery({
    queryKey: ['batch-jobs', batch.id],
    queryFn: () => getBatchJobs({ data: batch.id }),
    enabled: expanded,
    refetchInterval: expanded ? 2000 : false,
  })

  const reorderJobsMutation = useMutation({
    mutationFn: (jobIds: Array<number>) =>
      reorderBatchJobsFn({ data: { batchId: batch.id, jobIds } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['batch-jobs', batch.id] }),
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleJobDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !jobs) return
    const oldIndex = jobs.findIndex((j) => j.id === active.id)
    const newIndex = jobs.findIndex((j) => j.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newOrder = arrayMove(jobs, oldIndex, newIndex)
    reorderJobsMutation.mutate(newOrder.map((j) => j.id))
  }

  const pct =
    batch.totalImages > 0
      ? (batch.completedImages / batch.totalImages) * 100
      : 0
  const isRunning = batch.status === 'running' && !queuePaused
  const isPaused = queuePaused && (batch.status === 'running' || batch.status === 'pending')

  const barColor = isPaused ? 'bg-muted-foreground/40' : isRunning ? 'bg-primary' : 'bg-muted-foreground/40'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-border rounded-lg bg-card overflow-hidden"
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0 touch-none"
          aria-label="Drag to reorder"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" />
        </button>

        {/* Status indicator */}
        <div className="shrink-0">
          {isPaused ? (
            <span className="size-2 rounded-full bg-muted-foreground/40 inline-block" />
          ) : isRunning ? (
            <span className="size-2 rounded-full bg-primary animate-pulse inline-block" />
          ) : (
            <span className="size-2 rounded-full bg-muted-foreground/40 inline-block" />
          )}
        </div>

        {/* Label + progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-sm font-medium text-foreground truncate">
                {batch.label ?? `Batch #${batch.id}`}
              </span>
              {batch.projectId && (
                <Link
                  to="/workspace/$projectId"
                  params={{ projectId: String(batch.projectId) }}
                  search={{ imageDetail: undefined }}
                  className="text-muted-foreground/40 hover:text-primary shrink-0 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HugeiconsIcon icon={ArrowUpRight} className="size-3.5" />
                </Link>
              )}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {batch.completedImages}/{batch.totalImages}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor} transition-all duration-500`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <HugeiconsIcon
              icon={expanded ? ChevronUpIcon : ChevronDownIcon}
              className="size-4"
            />
          </button>
          <button
            onClick={() => setCancelDialogOpen(true)}
            className="p-1 text-muted-foreground hover:text-destructive rounded"
            aria-label={t('queue.cancelBatch' as any)}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </button>
        </div>
      </div>

      {/* Expanded jobs */}
      {expanded && jobs && jobs.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-3 py-2 space-y-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleJobDragEnd}
          >
            <SortableContext
              items={jobs.map((j) => j.id)}
              strategy={verticalListSortingStrategy}
            >
              {jobs.map((job) => (
                <SortableJobRow key={job.id} job={job} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title={t('queue.cancelBatch' as any)}
        description={t('queue.cancelBatchConfirm' as any)}
        actionLabel={t('common.delete' as any)}
        onConfirm={() => onCancel(batch.id)}
        variant="destructive"
      />
    </div>
  )
}

// ---- SortableJobRow ----

interface JobData {
  id: number
  batchId: number | null
  queueOrder: number | null
  projectId: number | null
  projectSceneId: number | null
  sourceSceneId: number | null
  totalCount: number | null
  completedCount: number | null
  status: string | null
  errorMessage: string | null
  createdAt: string | null
  projectName: string | null
  sceneName: string | null
}

// ---- JobPromptDisplay ----

function JobPromptDisplay({ jobId }: { jobId: number }) {
  const { t } = useTranslation()
  const { data: prompts, isLoading } = useQuery({
    queryKey: ['job-prompts', jobId],
    queryFn: () => getJobPrompts({ data: jobId }),
  })

  if (isLoading) {
    return (
      <div className="text-[11px] text-muted-foreground py-1 pl-5">
        Loading...
      </div>
    )
  }

  if (!prompts) return null

  return (
    <div className="space-y-1.5 py-1.5 pl-5 pr-2">
      {prompts.generalPrompt && (
        <div>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {t('queue.promptGeneral' as any)}
          </span>
          <p className="text-[11px] text-foreground/80 whitespace-pre-wrap break-all leading-relaxed mt-0.5">
            {prompts.generalPrompt}
          </p>
        </div>
      )}
      {prompts.characterPrompts?.map((char) => (
        <div key={char.characterId}>
          {char.prompt && (
            <div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {t('queue.promptCharacter' as any, { name: char.name })}
              </span>
              <p className="text-[11px] text-foreground/80 whitespace-pre-wrap break-all leading-relaxed mt-0.5">
                {char.prompt}
              </p>
            </div>
          )}
          {char.negative && (
            <div className="mt-1">
              <span className="text-[10px] font-medium text-destructive/60 uppercase tracking-wide">
                {t('queue.promptCharacterNegative' as any, { name: char.name })}
              </span>
              <p className="text-[11px] text-destructive/50 whitespace-pre-wrap break-all leading-relaxed mt-0.5">
                {char.negative}
              </p>
            </div>
          )}
        </div>
      ))}
      {prompts.negativePrompt && (
        <div>
          <span className="text-[10px] font-medium text-destructive/60 uppercase tracking-wide">
            {t('queue.promptNegative' as any)}
          </span>
          <p className="text-[11px] text-destructive/50 whitespace-pre-wrap break-all leading-relaxed mt-0.5">
            {prompts.negativePrompt}
          </p>
        </div>
      )}
    </div>
  )
}

function SortableJobRow({ job }: { job: JobData }) {
  const [showPrompts, setShowPrompts] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: job.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isRunning = job.status === 'running'
  const isFailed = job.status === 'failed'
  const completed = job.completedCount ?? 0
  const total = job.totalCount ?? 0
  const pct = total > 0 ? (completed / total) * 100 : 0

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 py-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 touch-none"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} className="size-3.5" />
        </button>

        {isFailed ? (
          <span className="size-1.5 rounded-full bg-destructive shrink-0 inline-block" />
        ) : isRunning ? (
          <span className="size-1.5 rounded-full bg-primary animate-pulse shrink-0 inline-block" />
        ) : (
          <span className="size-1.5 rounded-full bg-muted-foreground/30 shrink-0 inline-block" />
        )}

        <button
          onClick={() => setShowPrompts((v) => !v)}
          className={`text-xs truncate flex-1 min-w-0 text-left hover:underline ${
            isFailed
              ? 'text-destructive'
              : isRunning
                ? 'text-foreground'
                : 'text-muted-foreground'
          }`}
        >
          {job.sceneName ?? `Job #${job.id}`}
        </button>

        {job.projectId && job.projectSceneId && (
          <Link
            to="/workspace/$projectId/scenes/$sceneId"
            params={{ projectId: String(job.projectId), sceneId: String(job.projectSceneId) }}
            search={{ imageDetail: undefined }}
            className="text-muted-foreground/40 hover:text-primary shrink-0 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <HugeiconsIcon icon={ArrowUpRight} className="size-3" />
          </Link>
        )}

        <div className="w-16 h-1 rounded-full bg-secondary overflow-hidden shrink-0">
          <div
            className={`h-full rounded-full ${isFailed ? 'bg-destructive' : 'bg-primary'} transition-all duration-300`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-10 text-right">
          {completed}/{total}
        </span>
      </div>
      {showPrompts && <JobPromptDisplay jobId={job.id} />}
    </div>
  )
}

// ---- RecentJobRow ----

function RecentJobRow({ job }: { job: JobData }) {
  const [showPrompts, setShowPrompts] = useState(false)

  const isJobRunning = job.status === 'running'
  const isJobFailed = job.status === 'failed'
  const isJobCompleted = job.status === 'completed'
  const completed = job.completedCount ?? 0
  const total = job.totalCount ?? 0
  const pct = total > 0 ? (completed / total) * 100 : 0
  const statusColor = isJobFailed
    ? 'bg-destructive'
    : isJobRunning
      ? 'bg-primary animate-pulse'
      : isJobCompleted
        ? 'bg-green-500'
        : 'bg-muted-foreground/30'

  return (
    <div>
      <div className="flex items-center gap-2 py-1 pl-1">
        <span
          className={`size-1.5 rounded-full shrink-0 inline-block ${statusColor}`}
        />
        <button
          onClick={() => setShowPrompts((v) => !v)}
          className="text-xs truncate flex-1 min-w-0 text-left hover:underline"
        >
          {job.sceneName ?? `Job #${job.id}`}
        </button>
        {job.projectId && job.projectSceneId && (
          <Link
            to="/workspace/$projectId/scenes/$sceneId"
            params={{ projectId: String(job.projectId), sceneId: String(job.projectSceneId) }}
            search={{ imageDetail: undefined }}
            className="text-muted-foreground/40 hover:text-primary shrink-0 transition-colors"
          >
            <HugeiconsIcon icon={ArrowUpRight} className="size-3" />
          </Link>
        )}
        <div className="w-16 h-1 rounded-full bg-secondary overflow-hidden shrink-0">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-10 text-right">
          {completed}/{total}
        </span>
      </div>
      {job.status === 'failed' && job.errorMessage && (
        <p className="text-[11px] text-destructive/80 pl-3.5 line-clamp-2">
          {job.errorMessage}
        </p>
      )}
      {showPrompts && <JobPromptDisplay jobId={job.id} />}
    </div>
  )
}

// ---- RecentBatchRow ----

interface RecentBatchData {
  id: number
  projectId: number | null
  label: string | null
  status: string | null
  createdAt: string | null
  jobCount: number
  totalImages: number
  completedImages: number
}

function RecentBatchRow({
  batch,
  onRetry,
}: {
  batch: RecentBatchData
  onRetry: (batchId: number) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const { data: jobs } = useQuery({
    queryKey: ['batch-jobs', batch.id],
    queryFn: () => getBatchJobs({ data: batch.id }),
    enabled: expanded,
  })

  const isCompleted = batch.status === 'completed'
  const isFailed = batch.status === 'failed'

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="shrink-0">
          {isCompleted ? (
            <HugeiconsIcon
              icon={CheckmarkCircle01Icon}
              className="size-4 text-green-500"
            />
          ) : isFailed ? (
            <HugeiconsIcon
              icon={AlertCircleIcon}
              className="size-4 text-destructive"
            />
          ) : (
            <HugeiconsIcon
              icon={Cancel01Icon}
              className="size-4 text-muted-foreground"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm text-foreground truncate">
              {batch.label ?? `Batch #${batch.id}`}
            </span>
            {batch.projectId && (
              <Link
                to="/workspace/$projectId"
                params={{ projectId: String(batch.projectId) }}
                search={{ imageDetail: undefined }}
                className="text-muted-foreground/40 hover:text-primary shrink-0 transition-colors"
              >
                <HugeiconsIcon icon={ArrowUpRight} className="size-3.5" />
              </Link>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {batch.completedImages}/{batch.totalImages}
            {' · '}
            {isCompleted
              ? t('queue.completed' as any)
              : isFailed
                ? t('queue.failed' as any)
                : t('queue.cancelled' as any)}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isFailed && (
            <button
              onClick={() => onRetry(batch.id)}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded text-xs flex items-center gap-1"
              title={t('queue.retryBatch' as any)}
            >
              <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-4" />
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 text-muted-foreground hover:text-foreground rounded"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <HugeiconsIcon
              icon={expanded ? ChevronUpIcon : ChevronDownIcon}
              className="size-4"
            />
          </button>
        </div>
      </div>

      {/* Expanded jobs */}
      {expanded && jobs && jobs.length > 0 && (
        <div className="border-t border-border bg-muted/30 px-3 py-2 space-y-0.5">
          {jobs.map((job) => (
            <RecentJobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- QueuePage ----

function QueuePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const { data: summary } = useQuery({
    queryKey: ['queue-summary'],
    queryFn: () => fetchQueueSummary(),
    refetchInterval: 2000,
  })

  const { data: activeBatches = [], isLoading: loadingActive } = useQuery({
    queryKey: ['queue-batches'],
    queryFn: () => listQueueBatches(),
    refetchInterval: 2000,
  })

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['recent-batches'],
    queryFn: () => listRecentBatches(),
    refetchInterval: 2000,
  })

  const reorderMutation = useMutation({
    mutationFn: (batchIds: Array<number>) =>
      reorderQueueBatches({ data: { batchIds } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['queue-batches'] }),
  })

  const cancelBatchMutation = useMutation({
    mutationFn: (batchId: number) => cancelBatch({ data: batchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-batches'] })
      queryClient.invalidateQueries({ queryKey: ['recent-batches'] })
    },
  })

  const retryBatchMutation = useMutation({
    mutationFn: (batchId: number) => retryBatch({ data: batchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-batches'] })
      queryClient.invalidateQueries({ queryKey: ['recent-batches'] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: () => pauseGeneration(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['queue-summary'] }),
  })

  const resumeMutation = useMutation({
    mutationFn: () => resumeGeneration(),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['queue-summary'] }),
  })

  const handleBatchDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = activeBatches.findIndex((b) => b.id === active.id)
      const newIndex = activeBatches.findIndex((b) => b.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const newOrder = arrayMove(activeBatches, oldIndex, newIndex)
      reorderMutation.mutate(newOrder.map((b) => b.id))
    },
    [activeBatches, reorderMutation],
  )

  const isPaused = summary?.queueStopped === 'paused'
  const isError = summary?.queueStopped === 'error'

  const totalPendingImages = activeBatches.reduce(
    (sum, b) => sum + (b.totalImages - b.completedImages),
    0,
  )
  const totalImages = activeBatches.reduce((sum, b) => sum + b.totalImages, 0)
  const completedImages = activeBatches.reduce(
    (sum, b) => sum + b.completedImages,
    0,
  )
  const overallPct = totalImages > 0 ? (completedImages / totalImages) * 100 : 0

  const avgMs = summary?.globalStats?.avgImageDurationMs ?? null
  const etaMs =
    avgMs != null && totalPendingImages > 0 ? totalPendingImages * avgMs : null

  const isEmpty = activeBatches.length === 0 && !loadingActive

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <HugeiconsIcon
                icon={TimeQuarter02Icon}
                className="size-5 text-primary"
              />
              {t('queue.title' as any)}
            </h1>
            {!isEmpty && (
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {t('queue.batchesCount' as any, {
                    count: String(activeBatches.length),
                  })}
                </span>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>
                  {t('queue.imagesRemaining' as any, {
                    count: String(totalPendingImages),
                  })}
                </span>
                {etaMs != null && !isPaused && (
                  <>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span>
                      {t('queue.eta' as any, { time: formatDuration(etaMs) })}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Pause / Resume */}
          {!isEmpty && (
            <div className="flex items-center gap-2 shrink-0">
              {isPaused || isError ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending}
                >
                  <HugeiconsIcon icon={PlayIcon} className="size-4" />
                  {t('queue.resume' as any)}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => pauseMutation.mutate()}
                  disabled={pauseMutation.isPending}
                >
                  <HugeiconsIcon icon={PauseIcon} className="size-4" />
                  {t('queue.pause' as any)}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Overall progress bar */}
        {!isEmpty && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isError
                    ? 'bg-destructive'
                    : isPaused
                      ? 'bg-muted-foreground/40'
                      : 'bg-primary'
                }`}
                style={{ width: `${overallPct}%` }}
              />
            </div>
            {(isPaused || isError) && (
              <p
                className={`text-xs font-medium ${isError ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {isError ? t('queue.error' as any) : t('queue.paused' as any)}
              </p>
            )}
          </div>
        )}

        {/* Empty state */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <HugeiconsIcon
              icon={TimeQuarter02Icon}
              className="size-12 text-muted-foreground/30"
            />
            <div>
              <p className="text-base font-medium text-foreground">
                {t('queue.empty' as any)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('queue.emptyDescription' as any)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" asChild>
                <Link to="/" search={{ imageDetail: undefined }}>
                  {t('queue.goToWorkspace' as any)}
                </Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link to="/generate" search={{ imageDetail: undefined }}>
                  {t('queue.goToGenerate' as any)}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          /* Active batch list */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleBatchDragEnd}
          >
            <SortableContext
              items={activeBatches.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {activeBatches.map((batch) => (
                  <SortableBatchRow
                    key={batch.id}
                    batch={batch}
                    onCancel={(id) => cancelBatchMutation.mutate(id)}
                    onRetry={(id) => retryBatchMutation.mutate(id)}
                    queuePaused={isPaused}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Recent history */}
        {recentBatches.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('queue.recentHistory' as any)}
            </h2>
            <div className="space-y-2">
              {recentBatches.map((batch) => (
                <RecentBatchRow
                  key={batch.id}
                  batch={batch}
                  onRetry={(id) => retryBatchMutation.mutate(id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
