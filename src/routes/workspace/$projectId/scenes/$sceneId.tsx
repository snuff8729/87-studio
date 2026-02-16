import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft02Icon, Menu01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { GenerationProgress } from '@/components/workspace/generation-progress'
import { getScenePageContext, listProjectJobs } from '@/server/functions/workspace'
import { cancelJobs } from '@/server/functions/generation'
import { updateProjectScene } from '@/server/functions/project-scenes'
import { updateProject } from '@/server/functions/projects'
import { SceneDetail } from '@/components/workspace/scene-detail'
import { PromptPanel } from '@/components/workspace/prompt-panel'
import { ScenePlaceholderPanel } from '@/components/workspace/scene-placeholder-panel'

export const Route = createFileRoute('/workspace/$projectId/scenes/$sceneId')({
  loader: async ({ params }) => {
    const projectId = Number(params.projectId)
    const [context, activeJobs] = await Promise.all([
      getScenePageContext({ data: { projectId, sceneId: Number(params.sceneId) } }),
      listProjectJobs({ data: projectId }),
    ])
    return { ...context, activeJobs }
  },
  component: SceneDetailPage,
})

function SceneDetailPage() {
  const data = Route.useLoaderData()
  const params = Route.useParams()
  const router = useRouter()
  const projectId = Number(params.projectId)
  const sceneId = Number(params.sceneId)

  // ── Prompt state ──
  const [generalPrompt, setGeneralPrompt] = useState(data.project.generalPrompt ?? '')
  const [negativePrompt, setNegativePrompt] = useState(data.project.negativePrompt ?? '')

  useEffect(() => {
    setGeneralPrompt(data.project.generalPrompt ?? '')
    setNegativePrompt(data.project.negativePrompt ?? '')
  }, [data.project])

  // ── Scene placeholder state ──
  const [scenePlaceholders, setScenePlaceholders] = useState<Record<string, string>>(
    data.scenePlaceholders ? JSON.parse(data.scenePlaceholders) : {},
  )
  const [charOverrides, setCharOverrides] = useState(data.characterOverrides)

  useEffect(() => {
    setScenePlaceholders(data.scenePlaceholders ? JSON.parse(data.scenePlaceholders) : {})
    setCharOverrides(data.characterOverrides)
  }, [data.scenePlaceholders, data.characterOverrides])

  // ── Auto-save ──
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savedClearRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const saveProject = useCallback(
    async (fields: { generalPrompt?: string; negativePrompt?: string }) => {
      setSaveStatus('saving')
      try {
        await updateProject({ data: { id: projectId, ...fields } })
        setSaveStatus('saved')
        if (savedClearRef.current) clearTimeout(savedClearRef.current)
        savedClearRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
        router.invalidate()
      } catch {
        setSaveStatus('error')
        toast.error('Save failed')
      }
    },
    [projectId, router],
  )

  const debouncedSave = useCallback(
    (fields: { generalPrompt?: string; negativePrompt?: string }) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => saveProject(fields), 1000)
    },
    [saveProject],
  )

  function handleGeneralPromptChange(value: string) {
    setGeneralPrompt(value)
    debouncedSave({ generalPrompt: value })
  }

  function handleNegativePromptChange(value: string) {
    setNegativePrompt(value)
    debouncedSave({ negativePrompt: value })
  }

  function handlePlaceholdersChange() {
    router.invalidate()
  }

  // ── Thumbnail ──
  function handleThumbnailChange(imageId: number | null) {
    updateProjectScene({ data: { id: sceneId, thumbnailImageId: imageId } })
      .then(() => router.invalidate())
      .catch(() => toast.error('Failed to update thumbnail'))
  }

  function handleProjectThumbnailChange(imageId: number | null) {
    updateProject({ data: { id: projectId, thumbnailImageId: imageId } })
      .then(() => router.invalidate())
      .catch(() => toast.error('Failed to update project thumbnail'))
  }

  // ── Generation polling ──
  const [activeJobs, setActiveJobs] = useState(data.activeJobs)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (data.activeJobs.length > 0) {
      setActiveJobs(data.activeJobs)
    }
  }, [data.activeJobs])

  const pollingRef = useRef(false)
  useEffect(() => {
    if (activeJobs.length === 0) return
    let cancelled = false

    const interval = setInterval(async () => {
      if (cancelled || pollingRef.current) return
      pollingRef.current = true
      try {
        const jobs = await listProjectJobs({ data: projectId })
        if (cancelled) return
        setActiveJobs(jobs)
        setRefreshKey((k) => k + 1)
        if (jobs.length === 0) {
          router.invalidate()
        }
      } catch {
        // ignore poll errors
      } finally {
        pollingRef.current = false
      }
    }, 2000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [activeJobs.length > 0, projectId, router])

  async function handleCancelJobs() {
    const jobIds = activeJobs.map((j) => j.id)
    if (jobIds.length === 0) return
    await cancelJobs({ data: jobIds })
    setActiveJobs([])
    toast.success('Generation cancelled')
    router.invalidate()
  }

  // ── Mobile panel ──
  const [leftOpen, setLeftOpen] = useState(false)

  // Save status indicator text
  const saveIndicator =
    saveStatus === 'saving' ? 'Saving...' :
    saveStatus === 'saved' ? 'Saved' :
    saveStatus === 'error' ? 'Error' : null

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-border bg-background flex items-center px-3 shrink-0 gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={() => setLeftOpen(!leftOpen)}
        >
          <HugeiconsIcon icon={Menu01Icon} className="size-5" />
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link
            to="/workspace/$projectId"
            params={{ projectId: String(projectId) }}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} className="size-5" />
            <span className="hidden sm:inline">{data.project.name}</span>
          </Link>
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted-foreground">{data.packName}</div>
          <h1 className="text-base font-semibold truncate">{data.sceneName}</h1>
        </div>
        {saveIndicator && (
          <span className={`text-sm ${saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {saveIndicator}
          </span>
        )}
        {activeJobs.length > 0 && (
          <GenerationProgress
            jobs={activeJobs}
            batchTotal={activeJobs.reduce((sum, j) => sum + (j.totalCount ?? 0), 0)}
            onCancel={handleCancelJobs}
          />
        )}
      </header>

      {/* Content: 3-panel layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Panel — Prompt templates */}
        <aside
          className={`
            ${leftOpen ? 'translate-x-0' : '-translate-x-full'}
            fixed inset-y-12 left-0 z-30 w-72 bg-background border-r border-border
            transition-transform duration-200 ease-in-out
            lg:static lg:translate-x-0 lg:w-[280px] lg:shrink-0
            overflow-y-auto
          `}
        >
          <PromptPanel
            generalPrompt={generalPrompt}
            negativePrompt={negativePrompt}
            characters={data.characters}
            onGeneralPromptChange={handleGeneralPromptChange}
            onNegativePromptChange={handleNegativePromptChange}
            projectId={projectId}
          />
        </aside>

        {/* Center Panel — Placeholder values + prompt preview */}
        <div className="w-[320px] shrink-0 border-r border-border overflow-y-auto hidden md:block">
          <ScenePlaceholderPanel
            sceneId={sceneId}
            scenePlaceholders={scenePlaceholders}
            characterOverrides={charOverrides}
            generalPrompt={generalPrompt}
            negativePrompt={negativePrompt}
            characters={data.characters}
            onPlaceholdersChange={handlePlaceholdersChange}
          />
        </div>

        {/* Right — Image gallery */}
        <main className="flex-1 overflow-y-auto min-w-0">
          <SceneDetail
            sceneId={sceneId}
            characters={data.characters}
            generalPrompt={generalPrompt}
            projectId={projectId}
            thumbnailImageId={data.thumbnailImageId}
            onThumbnailChange={handleThumbnailChange}
            projectThumbnailImageId={data.projectThumbnailImageId}
            onProjectThumbnailChange={handleProjectThumbnailChange}
            refreshKey={refreshKey}
            hidePlaceholders
            sceneName={data.sceneName}
          />
        </main>
      </div>

      {/* Mobile backdrop */}
      {leftOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setLeftOpen(false)}
        />
      )}
    </div>
  )
}
