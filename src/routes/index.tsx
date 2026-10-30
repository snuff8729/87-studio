import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowExpand01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Delete02Icon,
  FileSearchIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import type { TranslationKeys } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DeleteFilesOption } from '@/components/workspace/delete-files-option'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  updateProject,
} from '@/server/functions/projects'
import { getSetting } from '@/server/functions/settings'
import { getBatchJobs, listQueueBatches } from '@/server/functions/queue'
import { Skeleton } from '@/components/ui/skeleton'
import { ExpandedTextareaDialog } from '@/components/common/expanded-textarea-dialog'
import {
  HeaderActions,
  usePageHeader,
} from '@/components/layout/breadcrumb-context'
import { HeaderButton } from '@/components/layout/header-button'
import { useQueueSummary } from '@/components/queue/queue-status-widget'
import { useTranslation } from '@/lib/i18n'
import { useOnboardingMaybe } from '@/lib/onboarding'

type TFn = (
  key: TranslationKeys,
  params?: Record<string, string | number>,
) => string

function formatRelativeDate(dateStr: string, t: TFn): string {
  const date = new Date(dateStr + 'Z')
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return t('dashboard.justNow')
  if (diffMin < 60) return t('dashboard.minutesAgo', { count: diffMin })
  if (diffHr < 24) return t('dashboard.hoursAgo', { count: diffHr })
  if (diffDay < 30) return t('dashboard.daysAgo', { count: diffDay })

  return date.toLocaleDateString()
}

function PendingComponent() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-border"
        >
          <Skeleton className="aspect-[3/2] w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  )
}

export const Route = createFileRoute('/')({
  loader: async () => {
    const [projectList, apiKey] = await Promise.all([
      listProjects(),
      getSetting({ data: 'nai_api_key' }),
    ])
    return {
      projects: projectList,
      hasApiKey: !!apiKey && apiKey.length > 0,
    }
  },
  component: ProjectSelectorPage,
  pendingComponent: PendingComponent,
})

/** One-row strip shown only while the queue has pending or running work. */
function RunningStrip() {
  const { t } = useTranslation()
  const { data: summary } = useQueueSummary()
  const active = (summary?.globalStats.totalPendingImages ?? 0) > 0
  const { data: batches = [] } = useQuery({
    queryKey: ['queue-batches'],
    queryFn: () => listQueueBatches(),
    refetchInterval: 2000,
    enabled: active,
  })

  const current = batches.find((b) => b.status === 'running') ?? batches.at(0)
  const { data: jobs } = useQuery({
    queryKey: ['batch-jobs', current?.id],
    queryFn: () => getBatchJobs({ data: current?.id ?? 0 }),
    refetchInterval: 2000,
    enabled: active && !!current,
  })
  const job = jobs?.find((j) => j.status === 'running') ?? jobs?.at(0)
  const label =
    job?.projectName && job.sceneName
      ? `${job.projectName} · ${job.sceneName}`
      : current?.label

  if (!summary || !active) return null
  const { totalImages, completedImages } = summary.globalStats
  const pct = totalImages > 0 ? (completedImages / totalImages) * 100 : 0

  return (
    <Link
      to="/queue"
      search={{ imageDetail: undefined }}
      data-running-strip
      className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/30"
    >
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{t('dashboard.generatingNow')}</span>
        {label && <span className="text-muted-foreground"> · {label}</span>}
      </span>
      <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-secondary sm:block">
        <div
          className="h-full rounded-full bg-brand-gradient transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {completedImages}/{totalImages}
      </span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        className="size-4 text-muted-foreground"
        aria-label={t('dashboard.viewQueue')}
      />
    </Link>
  )
}

function ProjectSelectorPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const { projects, hasApiKey } = data
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [descExpanded, setDescExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number
    name: string
    imageCount: number
  } | null>(null)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{
    id: number
    name: string
  } | null>(null)
  const [renameName, setRenameName] = useState('')
  const { t } = useTranslation()
  const onboarding = useOnboardingMaybe()

  usePageHeader({ count: projects.length })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(q))
  }, [projects, search])

  async function handleCreate() {
    if (!name.trim()) {
      toast.error(t('dashboard.enterProjectName'))
      return
    }
    try {
      const project = await createProject({
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
        },
      })
      setName('')
      setDescription('')
      setDialogOpen(false)
      toast.success(t('dashboard.projectCreated'))
      window.dispatchEvent(
        new CustomEvent('onboarding:project-created', {
          detail: { projectId: project.id },
        }),
      )
      // During onboarding step 2, don't auto-navigate - let step 3 highlight the card
      if (onboarding?.state.active && onboarding.state.step === 2) {
        router.invalidate()
        return
      }
      router.navigate({
        to: '/workspace/$projectId',
        params: { projectId: String(project.id) },
        search: { imageDetail: undefined },
      })
    } catch {
      toast.error(t('dashboard.createFailed'))
    }
  }

  async function handleRename() {
    if (!renameTarget || !renameName.trim()) return
    try {
      await updateProject({
        data: { id: renameTarget.id, name: renameName.trim() },
      })
      toast.success(t('dashboard.projectRenamed'))
      setRenameTarget(null)
      router.invalidate()
    } catch {
      toast.error(t('dashboard.renameFailed'))
    }
  }

  async function handleDuplicate(id: number) {
    try {
      await duplicateProject({ data: id })
      toast.success(t('dashboard.projectDuplicated'))
      router.invalidate()
    } catch {
      toast.error(t('dashboard.duplicateFailed'))
    }
  }

  async function handleDelete(id: number, deleteFiles: boolean) {
    try {
      await deleteProject({ data: { id, deleteFiles } })
      toast.success(t('dashboard.projectDeleted'))
      router.invalidate()
    } catch {
      toast.error(t('dashboard.deleteFailed'))
    }
  }

  return (
    <div>
      <HeaderActions>
        {projects.length > 0 && (
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('dashboard.searchPlaceholder')}
              aria-label={t('dashboard.searchPlaceholder')}
              data-project-search
              className="h-8 pl-7 text-[13px]"
            />
          </div>
        )}
        <HeaderButton
          className={projects.length === 0 ? 'ml-auto' : undefined}
          onClick={() => setDialogOpen(true)}
          data-onboarding="new-project-btn"
          aria-label={t('dashboard.newProject')}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          <span className="hidden sm:inline">{t('dashboard.newProject')}</span>
        </HeaderButton>
      </HeaderActions>

      <RunningStrip />

      {!hasApiKey && (
        <Link
          to="/settings"
          search={{ imageDetail: undefined }}
          className="mb-4 flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('dashboard.apiKeyNotSet')}
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Link>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <HugeiconsIcon
            icon={FolderOpenIcon}
            className="mx-auto mb-3 size-10 text-muted-foreground/30"
          />
          <p className="mb-1 text-base text-muted-foreground">
            {t('dashboard.noProjectsYet')}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {t('dashboard.noProjectsDesc')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              {t('dashboard.newProject')}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/metadata" search={{ imageDetail: undefined }}>
                <HugeiconsIcon icon={FileSearchIcon} className="size-4" />
                {t('dashboard.importFromMetadata')}
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('dashboard.noMatches')}
            </p>
          )}
          <div
            data-project-grid
            className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4"
          >
            {filtered.map((p) => (
              <div
                key={p.id}
                data-project-card
                className="group relative overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/30"
              >
                <Link
                  to="/workspace/$projectId"
                  params={{ projectId: String(p.id) }}
                  search={{ imageDetail: undefined }}
                  className="block min-w-0"
                  data-onboarding={`project-card-${p.id}`}
                >
                  <div className="flex aspect-[3/2] items-center justify-center overflow-hidden bg-secondary/40">
                    {p.thumbnailPath ? (
                      <img
                        src={`/api/thumbnails/${p.thumbnailPath.replace('data/thumbnails/', '')}`}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <HugeiconsIcon
                        icon={FolderOpenIcon}
                        className="size-8 text-muted-foreground/20"
                      />
                    )}
                  </div>
                  <div className="min-w-0 p-3 pr-10">
                    <div className="truncate text-base font-medium transition-colors group-hover:text-primary">
                      {p.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t('dashboard.sceneCount', { count: p.sceneCount })} ·{' '}
                      {p.imageCount > 0
                        ? t('dashboard.imageCount', { count: p.imageCount })
                        : t('dashboard.noImages')}
                      {' · '}
                      {formatRelativeDate(
                        p.lastActivityAt ?? p.updatedAt ?? p.createdAt ?? '',
                        t,
                      )}
                    </div>
                  </div>
                </Link>

                <div className="absolute right-2 bottom-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        aria-label={p.name}
                      >
                        <HugeiconsIcon
                          icon={MoreHorizontalIcon}
                          className="size-5"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget({ id: p.id, name: p.name })
                          setRenameName(p.name)
                        }}
                      >
                        <HugeiconsIcon
                          icon={PencilEdit01Icon}
                          className="size-4"
                        />
                        {t('dashboard.renameProject')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(p.id)}>
                        <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                        {t('dashboard.duplicateProject')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          setDeleteFiles(false)
                          setDeleteTarget({
                            id: p.id,
                            name: p.name,
                            imageCount: p.imageCount,
                          })
                        }}
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                        {t('dashboard.deleteProject')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              data-new-project-card
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-6" />
              {t('dashboard.newProject')}
            </button>
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-onboarding="create-project-dialog">
          <DialogHeader>
            <DialogTitle>{t('dashboard.newProject')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.name')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('dashboard.projectName')}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('dashboard.descriptionOptional')}</Label>
                <button
                  type="button"
                  onClick={() => setDescExpanded(true)}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  title={t('workspace.expandEditor')}
                >
                  <HugeiconsIcon
                    icon={ArrowExpand01Icon}
                    className="size-3.5"
                  />
                </button>
              </div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('dashboard.briefDescription')}
                rows={2}
              />
              <ExpandedTextareaDialog
                open={descExpanded}
                onOpenChange={setDescExpanded}
                title={t('dashboard.descriptionOptional')}
                value={description}
                onChange={setDescription}
                placeholder={t('dashboard.briefDescription')}
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="w-full"
            >
              {t('common.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.renameProject')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder={t('dashboard.projectName')}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
            />
            <Button
              onClick={handleRename}
              disabled={!renameName.trim()}
              className="w-full"
            >
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('dashboard.deleteProject')}
        description={t('dashboard.deleteProjectDesc', {
          name: deleteTarget?.name ?? '',
        })}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget.id, deleteFiles)
          setDeleteTarget(null)
        }}
      >
        <DeleteFilesOption
          imageCount={deleteTarget?.imageCount ?? 0}
          checked={deleteFiles}
          onCheckedChange={setDeleteFiles}
        />
      </ConfirmDialog>
    </div>
  )
}
