import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
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
  const { projects, activeJobs, hasApiKey } = Route.useLoaderData()
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function handleCreate() {
    if (!name.trim()) {
      toast.error('Enter a project name')
      return
    }
    try {
      const project = await createProject({ data: { name: name.trim(), description: description.trim() || undefined } })
      setName('')
      setDescription('')
      setDialogOpen(false)
      toast.success('Project created')
      router.navigate({ to: '/workspace/$projectId', params: { projectId: String(project.id) } })
    } catch {
      toast.error('Failed to create project')
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteProject({ data: id })
      toast.success('Project deleted')
      router.invalidate()
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-sm font-bold text-primary-foreground">87</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Studio</h1>
        </div>
        <div className="flex items-center gap-2">
          {!hasApiKey && (
            <Badge variant="secondary" className="text-xs">
              API key not set
            </Badge>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/settings">
              <HugeiconsIcon icon={Settings02Icon} className="size-4" />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      {/* Active jobs notice */}
      {activeJobs.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {activeJobs.map((j) => (
            <Link
              key={j.id}
              to="/workspace/$projectId"
              params={{ projectId: String(j.projectId) }}
              className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 transition-colors hover:bg-primary/8"
            >
              <div className="size-2 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="text-sm font-medium truncate">
                {j.projectName && j.projectSceneName
                  ? `${j.projectName} / ${j.projectSceneName}`
                  : `Job #${j.id}`}
              </span>
              <Badge variant="secondary" className="text-xs shrink-0">{j.status}</Badge>
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
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
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
              className="flex-1 flex items-center justify-between px-3 py-3 min-w-0"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium group-hover:text-primary transition-colors truncate block">
                  {p.name}
                </span>
                {p.description && (
                  <span className="text-xs text-muted-foreground truncate block">{p.description}</span>
                )}
              </div>
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
            </Link>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 group-hover:opacity-100 text-destructive mr-2 shrink-0"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                </Button>
              }
              title="Delete Project"
              description={`Delete "${p.name}"? Generated images will be preserved on disk.`}
              onConfirm={() => handleDelete(p.id)}
            />
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="rounded-xl border border-border border-dashed py-12 text-center">
          <HugeiconsIcon icon={FolderOpenIcon} className="size-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No projects yet</p>
          <p className="text-xs text-muted-foreground mb-4">Create your first project to get started.</p>
        </div>
      )}

      {/* Create project button */}
      <div className="mt-4">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description..."
                  rows={2}
                />
              </div>
              <Button onClick={handleCreate} disabled={!name.trim()} className="w-full">
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
