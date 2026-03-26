import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowExpand01Icon,
  Copy01Icon,
  Delete02Icon,
  FolderOpenIcon,
  Image02Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import type { TranslationKeys } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Skeleton } from '@/components/ui/skeleton'
import { ExpandedTextareaDialog } from '@/components/common/expanded-textarea-dialog'
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
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-8 w-20" />
      </div>

      {/* Project list */}
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border p-3"
          >
            <Skeleton className="size-12 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* Create button */}
      <div className="mt-4">
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
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

function ProjectSelectorPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const { projects, hasApiKey } = data
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [descExpanded, setDescExpanded] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number
    name: string
  } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{
    id: number
    name: string
  } | null>(null)
  const [renameName, setRenameName] = useState('')
  const { t } = useTranslation()
  const onboarding = useOnboardingMaybe()

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

  async function handleDelete(id: number) {
    try {
      await deleteProject({ data: id })
      toast.success(t('dashboard.projectDeleted'))
      router.invalidate()
    } catch {
      toast.error(t('dashboard.deleteFailed'))
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-base font-bold text-primary-foreground">
              87
            </span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Studio</h1>
        </div>
        <div className="flex items-center gap-2">
          {!hasApiKey && (
            <Badge variant="secondary" className="text-sm">
              {t('dashboard.apiKeyNotSet')}
            </Badge>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/settings" search={{ imageDetail: undefined }}>
              <HugeiconsIcon icon={Settings02Icon} className="size-5" />
              {t('nav.settings')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Project list */}
      <div className="space-y-2">
        {projects.map((p) => (
          <div
            key={p.id}
            className="group relative rounded-xl border border-border hover:border-primary/30 transition-colors"
          >
            <Link
              to="/workspace/$projectId"
              params={{ projectId: String(p.id) }}
              search={{ imageDetail: undefined }}
              className="flex items-center gap-3 p-3 min-w-0"
              data-onboarding={`project-card-${p.id}`}
            >
              {/* Project thumbnail */}
              <div className="size-12 rounded-lg overflow-hidden bg-secondary/40 shrink-0 flex items-center justify-center">
                {p.thumbnailPath ? (
                  <img
                    src={`/api/thumbnails/${p.thumbnailPath.replace('data/thumbnails/', '')}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <HugeiconsIcon
                    icon={FolderOpenIcon}
                    className="size-5 text-muted-foreground/20"
                  />
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-medium group-hover:text-primary transition-colors truncate">
                    {p.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <HugeiconsIcon icon={Image02Icon} className="size-3.5" />
                    {p.imageCount > 0
                      ? t('dashboard.imageCount', { count: p.imageCount })
                      : t('dashboard.noImages')}
                  </span>
                  {p.lastActivityAt && (
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDate(p.lastActivityAt, t)}
                    </span>
                  )}
                </div>
              </div>

              {/* Spacer for menu button */}
              <div className="w-8 shrink-0" />
            </Link>

            {/* Context menu - positioned absolute to avoid interfering with the Link */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 text-muted-foreground"
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
                    <HugeiconsIcon icon={PencilEdit01Icon} className="size-4" />
                    {t('dashboard.renameProject')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDuplicate(p.id)}>
                    <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                    {t('dashboard.duplicateProject')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    {t('dashboard.deleteProject')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="rounded-xl border border-border border-dashed py-12 text-center">
          <HugeiconsIcon
            icon={FolderOpenIcon}
            className="size-10 text-muted-foreground/30 mx-auto mb-3"
          />
          <p className="text-base text-muted-foreground mb-1">
            {t('dashboard.noProjectsYet')}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {t('dashboard.noProjectsDesc')}
          </p>
        </div>
      )}

      {/* Create project button */}
      <div className="mt-4">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full"
              data-onboarding="new-project-btn"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-5" />
              {t('dashboard.newProject')}
            </Button>
          </DialogTrigger>
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
                    className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
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
      </div>

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
          if (deleteTarget) handleDelete(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
