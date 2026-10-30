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
import {
  HeaderActions,
  usePageHeader,
} from '@/components/layout/breadcrumb-context'
import { useTranslation } from '@/lib/i18n'
import { HeaderButton } from '@/components/layout/header-button'
import { listImages } from '@/server/functions/gallery'
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

function SortableBatchRow({
  batch,
  onCancel,
  queuePaused,
}: SortableBatchRowProps) {
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
  const isPaused =
    queuePaused && (batch.status === 'running' || batch.status === 'pending')

  const barColor = isPaused
    ? 'bg-muted-foreground/40'
    : isRunning
      ? 'bg-primary'
      : 'bg-muted-foreground/40'

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
            aria-label={t('queue.cancelBatch')}
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
        title={t('queue.cancelBatch')}
        description={t('queue.cancelBatchConfirm')}
        actionLabel={t('queue.cancelBatch')}
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
            {t('queue.promptGeneral')}
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
            {t('queue.promptNegative')}
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
            to="/workspace/$projectId"
            params={{
              projectId: String(job.projectId),
            }}
            search={{ scene: job.projectSceneId, imageDetail: undefined }}
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
            to="/workspace/$projectId"
            params={{
              projectId: String(job.projectId),
            }}
            search={{ scene: job.projectSceneId, imageDetail: undefined }}
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
              ? t('queue.completed')
              : isFailed
                ? t('queue.failed')
                : t('queue.cancelled')}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isFailed && (
            <button
              onClick={() => onRetry(batch.id)}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded text-xs flex items-center gap-1"
              title={t('queue.retryBatch')}
            >
              <HugeiconsIcon
                icon={ArrowReloadHorizontalIcon}
                className="size-4"
              />
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

// ---- NowGeneratingCard ----

function NowGeneratingCard({
  batch,
  queueStopped,
  onCancel,
}: {
  batch: BatchData
  queueStopped: 'paused' | 'error' | null | undefined
  onCancel: (batchId: number) => void
}) {
  const { t } = useTranslation()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const isPaused = queueStopped === 'paused'
  const isError = queueStopped === 'error'

  const { data: jobs } = useQuery({
    queryKey: ['batch-jobs', batch.id],
    queryFn: () => getBatchJobs({ data: batch.id }),
    refetchInterval: 2000,
  })
  const reorderJobsMutation = useMutation({
    mutationFn: (jobIds: Array<number>) =>
      reorderBatchJobsFn({ data: { batchId: batch.id, jobIds } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['batch-jobs', batch.id] }),
  })
  function handleJobDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !jobs) return
    const oldIndex = jobs.findIndex((j) => j.id === active.id)
    const newIndex = jobs.findIndex((j) => j.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorderJobsMutation.mutate(
      arrayMove(jobs, oldIndex, newIndex).map((j) => j.id),
    )
  }
  const job = jobs?.find((j) => j.status === 'running') ?? jobs?.at(0)

  // Latest image of the running scene (or of Quick Generate) as a live preview
  const { data: latest } = useQuery({
    queryKey: [
      'queue-latest-image',
      job?.projectSceneId ?? null,
      batch.projectId,
      batch.completedImages,
    ],
    queryFn: () =>
      listImages({
        data: {
          page: 1,
          limit: 1,
          projectSceneId: job?.projectSceneId ?? undefined,
          projectId: job?.projectSceneId
            ? undefined
            : (batch.projectId ?? undefined),
          quickGenerate: batch.projectId === null ? true : undefined,
        },
      }),
    enabled: batch.completedImages > 0,
  })
  const thumb = latest?.at(0)?.thumbnailPath ?? null

  const label =
    job?.projectName && job.sceneName
      ? `${job.projectName} · ${job.sceneName}`
      : (batch.label ?? `Batch #${batch.id}`)
  const pct =
    batch.totalImages > 0
      ? (batch.completedImages / batch.totalImages) * 100
      : 0
  const barClass =
    isPaused || isError
      ? isError
        ? 'bg-destructive'
        : 'bg-muted-foreground/40'
      : 'bg-brand-gradient'

  return (
    <div
      data-now-generating
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-4 p-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary sm:size-24">
          {thumb ? (
            <img
              src={`/api/thumbnails/${thumb.replace('data/thumbnails/', '')}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <HugeiconsIcon
              icon={TimeQuarter02Icon}
              className="size-7 text-muted-foreground/30"
            />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            {isPaused || isError ? (
              <span
                className={`inline-block size-2 shrink-0 rounded-full ${isError ? 'bg-destructive' : 'bg-muted-foreground/40'}`}
              />
            ) : (
              <span className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-primary" />
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {isError
                ? t('queue.error')
                : isPaused
                  ? t('queue.paused')
                  : t('queue.nowGenerating')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="truncate text-base font-medium">{label}</span>
            {batch.projectId && (
              <Link
                to="/workspace/$projectId"
                params={{ projectId: String(batch.projectId) }}
                search={
                  job?.projectSceneId
                    ? { scene: job.projectSceneId, imageDetail: undefined }
                    : { imageDetail: undefined }
                }
                className="shrink-0 text-muted-foreground/40 transition-colors hover:text-primary"
              >
                <HugeiconsIcon icon={ArrowUpRight} className="size-3.5" />
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {batch.completedImages}/{batch.totalImages}
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
          data-now-generating-expand
        >
          <HugeiconsIcon
            icon={expanded ? ChevronUpIcon : ChevronDownIcon}
            className="size-4"
          />
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => setCancelOpen(true)}
          aria-label={t('queue.cancelBatch')}
          title={t('queue.cancelBatch')}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      </div>
      {expanded && jobs && jobs.length > 0 && (
        <div className="space-y-1 border-t border-border bg-muted/30 px-3 py-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleJobDragEnd}
          >
            <SortableContext
              items={jobs.map((j) => j.id)}
              strategy={verticalListSortingStrategy}
            >
              {jobs.map((j) => (
                <SortableJobRow key={j.id} job={j} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('queue.cancelBatch')}
        description={t('queue.cancelBatchConfirm')}
        actionLabel={t('queue.cancelBatch')}
        onConfirm={() => onCancel(batch.id)}
        variant="destructive"
      />
    </div>
  )
}

// ---- QueuePage ----

function QueuePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [historyOpen, setHistoryOpen] = useState(false)

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

  // The running batch is shown in the "now generating" card, the rest below
  const currentBatch = activeBatches.find((b) => b.status === 'running')
  const pendingBatches = activeBatches.filter((b) => b.id !== currentBatch?.id)

  const handleBatchDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = pendingBatches.findIndex((b) => b.id === active.id)
      const newIndex = pendingBatches.findIndex((b) => b.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const newOrder = arrayMove(pendingBatches, oldIndex, newIndex)
      const ids = newOrder.map((b) => b.id)
      reorderMutation.mutate(currentBatch ? [currentBatch.id, ...ids] : ids)
    },
    [pendingBatches, currentBatch, reorderMutation],
  )

  const isPaused = summary?.queueStopped === 'paused'
  const isError = summary?.queueStopped === 'error'

  const totalPendingImages = activeBatches.reduce(
    (sum, b) => sum + (b.totalImages - b.completedImages),
    0,
  )

  const avgMs = summary?.globalStats.avgImageDurationMs ?? null
  const etaMs =
    avgMs != null && totalPendingImages > 0 ? totalPendingImages * avgMs : null

  const isEmpty = activeBatches.length === 0 && !loadingActive

  usePageHeader({ count: activeBatches.length })

  return (
    <div className="space-y-6">
      {!isEmpty && (
        <HeaderActions>
          <div className="ml-auto" />
          {isPaused || isError ? (
            <HeaderButton
              variant="secondary"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              aria-label={t('queue.resume')}
              data-queue-resume
            >
              <HugeiconsIcon icon={PlayIcon} className="size-4" />
              <span className="hidden sm:inline">{t('queue.resume')}</span>
            </HeaderButton>
          ) : (
            <HeaderButton
              variant="secondary"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              aria-label={t('queue.pause')}
              data-queue-pause
            >
              <HugeiconsIcon icon={PauseIcon} className="size-4" />
              <span className="hidden sm:inline">{t('queue.pause')}</span>
            </HeaderButton>
          )}
        </HeaderActions>
      )}

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center space-y-4 py-24 text-center">
          <HugeiconsIcon
            icon={TimeQuarter02Icon}
            className="size-12 text-muted-foreground/30"
          />
          <div>
            <p className="text-base font-medium text-foreground">
              {t('queue.empty')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('queue.emptyDescription')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/" search={{ imageDetail: undefined }}>
                {t('queue.goToWorkspace')}
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/generate" search={{ imageDetail: undefined }}>
                {t('queue.goToGenerate')}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {t('queue.batchesCount', {
                count: String(activeBatches.length),
              })}
            </span>
            <span className="text-muted-foreground/40">&middot;</span>
            <span>
              {t('queue.imagesRemaining', {
                count: String(totalPendingImages),
              })}
            </span>
            {etaMs != null && !isPaused && (
              <>
                <span className="text-muted-foreground/40">&middot;</span>
                <span>{t('queue.eta', { time: formatDuration(etaMs) })}</span>
              </>
            )}
          </div>

          {currentBatch && (
            <NowGeneratingCard
              batch={currentBatch}
              queueStopped={summary?.queueStopped}
              onCancel={(id) => cancelBatchMutation.mutate(id)}
            />
          )}

          {pendingBatches.length > 0 && (
            <div className="space-y-2" data-pending-batches>
              <h2 className="text-sm font-medium text-muted-foreground">
                {t('queue.pending')}{' '}
                <span className="tabular-nums">({pendingBatches.length})</span>
              </h2>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleBatchDragEnd}
              >
                <SortableContext
                  items={pendingBatches.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {pendingBatches.map((batch) => (
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
            </div>
          )}
        </>
      )}

      {/* Recent history (collapsed by default) */}
      {recentBatches.length > 0 && (
        <div className="space-y-2" data-queue-history>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon
              icon={historyOpen ? ChevronUpIcon : ChevronDownIcon}
              className="size-4"
            />
            {t('queue.recentHistory')}
            <span className="tabular-nums">({recentBatches.length})</span>
          </button>
          {historyOpen && (
            <div className="space-y-2">
              {recentBatches.map((batch) => (
                <RecentBatchRow
                  key={batch.id}
                  batch={batch}
                  onRetry={(id) => retryBatchMutation.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
