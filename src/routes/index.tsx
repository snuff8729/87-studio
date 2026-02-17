import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
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
import { listProjects, createProject, deleteProject } from '@/server/functions/projects'
import { listJobs } from '@/server/functions/generation'
import { getSetting } from '@/server/functions/settings'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  FolderOpenIcon,
  Add01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { useTranslation } from '@/lib/i18n'

export const Route = createFileRoute('/')({
  loader: async () => {
    const [projectList, jobs, apiKey] = await Promise.all([
      listProjects(),
      listJobs(),
      getSetting({ data: 'nai_api_key' }),
    ])
    return {
      projects: projectList,
      activeJobs: jobs.filter(
        (j) => j.status === 'running' || j.status === 'pending',
      ),
      hasApiKey: !!apiKey && apiKey.length > 0,
    }
  },
  component: ProjectSelectorPage,
})

function ProjectSelectorPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const { projects, hasApiKey } = data
  const [liveJobs, setLiveJobs] = useState(data.activeJobs)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const { t } = useTranslation()

  // Sync from loader when navigating back
  useEffect(() => {
    setLiveJobs(data.activeJobs)
  }, [data.activeJobs])

  // Poll active jobs for real-time progress
  const pollingRef = useRef(false)
  useEffect(() => {
    if (liveJobs.length === 0) return
    let cancelled = false

    const interval = setInterval(async () => {
      if (cancelled || pollingRef.current) return
      pollingRef.current = true
      try {
        const jobs = await listJobs()
        if (cancelled) return
        const active = jobs.filter(
          (j) => j.status === 'running' || j.status === 'pending',
        )
        setLiveJobs(active)
        if (active.length === 0) {
          router.invalidate()
        }
      } catch {
        // ignore poll errors
      } finally {
        pollingRef.current = false
      }
    }, 2000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [liveJobs.length > 0, router])

  async function handleCreate() {
    if (!name.trim()) {
      toast.error(t('dashboard.enterProjectName'))
      return
    }
    try {
      const project = await createProject({ data: { name: name.trim(), description: description.trim() || undefined } })
      setName('')
      setDescription('')
      setDialogOpen(false)
      toast.success(t('dashboard.projectCreated'))
      router.navigate({ to: '/workspace/$projectId', params: { projectId: String(project.id) } })
    } catch {
      toast.error(t('dashboard.createFailed'))
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
            <span className="text-base font-bold text-primary-foreground">87</span>
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
            <Link to="/settings">
              <HugeiconsIcon icon={Settings02Icon} className="size-5" />
              {t('nav.settings')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Active jobs notice */}
      {liveJobs.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {liveJobs.map((j) => (
            <Link
              key={j.id}
              to="/workspace/$projectId"
              params={{ projectId: String(j.projectId) }}
              className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 transition-colors hover:bg-primary/8"
            >
              <div className="size-2 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="text-base font-medium truncate">
                {j.projectName && j.projectSceneName
                  ? `${j.projectName} / ${j.projectSceneName}`
                  : `Job #${j.id}`}
              </span>
              <Badge variant="secondary" className="text-sm shrink-0">{j.status}</Badge>
              <div className="flex-1 min-w-16">
                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{
                      width: `${((j.completedCount ?? 0) / (j.totalCount ?? 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-sm text-muted-foreground tabular-nums shrink-0">
                {j.completedCount}/{j.totalCount}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Project list */}
      <div className="space-y-1">
        {projects.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 rounded-lg hover:bg-accent/50 transition-colors group"
          >
            <Link
              to="/workspace/$projectId"
              params={{ projectId: String(p.id) }}
              className="flex-1 flex items-center gap-3 px-3 py-3 min-w-0"
            >
              {/* Project thumbnail */}
              <div className="size-10 rounded-lg overflow-hidden bg-secondary/40 shrink-0 flex items-center justify-center">
                {p.thumbnailPath ? (
                  <img
                    src={`/api/thumbnails/${p.thumbnailPath.replace('data/thumbnails/', '')}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <HugeiconsIcon icon={FolderOpenIcon} className="size-5 text-muted-foreground/20" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-base font-medium group-hover:text-primary transition-colors truncate block">
                  {p.name}
                </span>
                {p.description && (
                  <span className="text-sm text-muted-foreground truncate block">{p.description}</span>
                )}
              </div>
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-5 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
            </Link>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 group-hover:opacity-100 text-destructive mr-2 shrink-0"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-5" />
                </Button>
              }
              title={t('dashboard.deleteProject')}
              description={t('dashboard.deleteProjectDesc', { name: p.name })}
              onConfirm={() => handleDelete(p.id)}
            />
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="rounded-xl border border-border border-dashed py-12 text-center">
          <HugeiconsIcon icon={FolderOpenIcon} className="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-base text-muted-foreground mb-1">{t('dashboard.noProjectsYet')}</p>
          <p className="text-sm text-muted-foreground mb-4">{t('dashboard.noProjectsDesc')}</p>
        </div>
      )}

      {/* Create project button */}
      <div className="mt-4">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <HugeiconsIcon icon={Add01Icon} className="size-5" />
              {t('dashboard.newProject')}
            </Button>
          </DialogTrigger>
          <DialogContent>
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
                <Label>{t('dashboard.descriptionOptional')}</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('dashboard.briefDescription')}
                  rows={2}
                />
              </div>
              <Button onClick={handleCreate} disabled={!name.trim()} className="w-full">
                {t('common.create')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
