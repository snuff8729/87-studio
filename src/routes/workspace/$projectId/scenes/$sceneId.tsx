import { createFileRoute, Link, useRouter, useNavigate } from '@tanstack/react-router'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft02Icon, Menu01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { GenerationProgress } from '@/components/workspace/generation-progress'
import { getScenePageContext, listProjectJobs } from '@/server/functions/workspace'
import { cancelJobs, pauseGeneration, resumeGeneration, dismissGenerationError } from '@/server/functions/generation'
import { updateProjectScene } from '@/server/functions/project-scenes'
import { updateProject } from '@/server/functions/projects'
import { extractPlaceholders } from '@/lib/placeholder'
import { useStableArray } from '@/lib/utils'
import { SceneDetail } from '@/components/workspace/scene-detail'
import { PromptPanel } from '@/components/workspace/prompt-panel'
import { ScenePlaceholderPanel } from '@/components/workspace/scene-placeholder-panel'
import { Skeleton } from '@/components/ui/skeleton'

function PendingComponent() {
  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-border bg-background flex items-center px-3 shrink-0 gap-2">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-4 w-24" />
        <div className="h-4 w-px bg-border" />
        <div className="min-w-0 flex-1 space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left — Prompts */}
        <aside className="hidden lg:block w-[280px] shrink-0 border-r border-border p-3 space-y-3">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-4 w-20 mt-4 mb-2" />
          <Skeleton className="h-16 w-full rounded-md" />
        </aside>

        {/* Center — Placeholders */}
        <div className="hidden md:block w-[320px] shrink-0 border-r border-border p-3 space-y-3">
          <Skeleton className="h-5 w-28 mb-3" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          ))}
        </div>

        {/* Right — Image grid */}
        <main className="flex-1 min-w-0 p-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="w-full aspect-square rounded-lg" />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}

const VALID_IMAGE_SORT = ['newest', 'tournament_winrate', 'tournament_wins'] as const
type ImageSortBy = (typeof VALID_IMAGE_SORT)[number]

type SceneDetailSearch = {
  imageSort?: ImageSortBy
}

export const Route = createFileRoute('/workspace/$projectId/scenes/$sceneId')({
  validateSearch: (search: Record<string, unknown>): SceneDetailSearch => ({
    imageSort: VALID_IMAGE_SORT.includes(search.imageSort as ImageSortBy) && search.imageSort !== 'newest'
      ? (search.imageSort as ImageSortBy)
      : undefined,
  }),
  loader: async ({ params }) => {
    const projectId = Number(params.projectId)
    const [context, jobsResult] = await Promise.all([
      getScenePageContext({ data: { projectId, sceneId: Number(params.sceneId) } }),
      listProjectJobs({ data: projectId }),
    ])
    return { ...context, activeJobs: jobsResult.jobs, batchTiming: jobsResult.batchTiming, queueStatus: jobsResult.queueStatus }
  },
  component: SceneDetailPage,
  pendingComponent: PendingComponent,
})

function SceneDetailPage() {
  const data = Route.useLoaderData()
  const params = Route.useParams()
  const router = useRouter()
  const { t } = useTranslation()
  const projectId = Number(params.projectId)
  const sceneId = Number(params.sceneId)

  // ── Prompt state ──
  const [generalPrompt, setGeneralPrompt] = useState(data.project.generalPrompt ?? '')
  const [negativePrompt, setNegativePrompt] = useState(data.project.negativePrompt ?? '')

  useEffect(() => {
    setGeneralPrompt(data.project.generalPrompt ?? '')
    setNegativePrompt(data.project.negativePrompt ?? '')
  }, [data.project])

  // ── Stable placeholder key arrays ──
  const rawGeneralKeys = useMemo(
    () => [...new Set([...extractPlaceholders(generalPrompt), ...extractPlaceholders(negativePrompt)])],
    [generalPrompt, negativePrompt],
  )
  const stableGeneralKeys = useStableArray(rawGeneralKeys)

  const characterPlaceholderKeys = useMemo(
    () => data.characters.map((char) => ({
      characterId: char.id,
      characterName: char.name,
      keys: [...new Set([...extractPlaceholders(char.charPrompt), ...extractPlaceholders(char.charNegative)])],
    })),
    [data.characters],
  )

  // ── Stable getPrompts callback for PlaceholderEditor preview (ref-based, no re-renders) ──
  const promptsRef = useRef({ generalPrompt, negativePrompt })
  promptsRef.current = { generalPrompt, negativePrompt }
  const getPrompts = useCallback(() => promptsRef.current, [])

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
        toast.error(t('common.saveFailed'))
      }
    },
    [projectId, router, t],
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
      .catch(() => toast.error(t('imageDetail.setSceneThumbFailed')))
  }

  function handleProjectThumbnailChange(imageId: number | null) {
    updateProject({ data: { id: projectId, thumbnailImageId: imageId } })
      .then(() => router.invalidate())
      .catch(() => toast.error(t('imageDetail.setProjectThumbFailed')))
  }

  // ── Generation polling ──
  const [activeJobs, setActiveJobs] = useState(data.activeJobs)
  const [batchTimingData, setBatchTimingData] = useState<{
    startedAt: number
    totalImages: number
    completedImages: number
    avgImageDurationMs: number | null
  } | null>(data.batchTiming)
  const [refreshKey, setRefreshKey] = useState(0)
  const [queueStopped, setQueueStopped] = useState<'error' | 'paused' | null>(
    data.queueStatus?.queueStopped ?? null,
  )

  useEffect(() => {
    const stopped = data.queueStatus?.queueStopped ?? null
    if (data.activeJobs.length > 0 || stopped) {
      setActiveJobs(data.activeJobs)
      setQueueStopped(stopped)
    }
  }, [data.activeJobs, data.queueStatus])

  const pollingRef = useRef(false)
  const hasActiveJobs = activeJobs.length > 0
  useEffect(() => {
    if (!hasActiveJobs || queueStopped) return
    let cancelled = false

    const interval = setInterval(async () => {
      if (cancelled || pollingRef.current) return
      pollingRef.current = true
      try {
        const { jobs, batchTiming, queueStatus } = await listProjectJobs({ data: projectId })
        if (cancelled) return
        setActiveJobs(jobs)
        setBatchTimingData(batchTiming)
        setRefreshKey((k) => k + 1)

        // Detect queue stop
        if (queueStatus?.queueStopped) {
          setQueueStopped(queueStatus.queueStopped)
          if (queueStatus.queueStopped === 'error') {
            const failedJob = jobs.find((j) => j.status === 'failed')
            if (failedJob?.errorMessage) {
              toast.error(failedJob.errorMessage)
            }
          }
          return
        }

        if (jobs.length === 0 && !queueStatus?.queueStopped) {
          setQueueStopped(null)
          setBatchTimingData(null)
          router.invalidate()
        }
      } catch {
        // ignore poll errors
      } finally {
        pollingRef.current = false
      }
    }, 2000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [hasActiveJobs, queueStopped, projectId, router])

  async function handleCancelJobs() {
    const jobIds = activeJobs.map((j) => j.id)
    if (jobIds.length === 0) return
    await cancelJobs({ data: jobIds })
    setActiveJobs([])
    setBatchTimingData(null)
    setQueueStopped(null)
    toast.success(t('generation.cancelled'))
    router.invalidate()
  }

  async function handlePause() {
    await pauseGeneration()
    setQueueStopped('paused')
  }

  async function handleResume() {
    setQueueStopped(null)
    await resumeGeneration()
  }

  async function handleDismissError() {
    setQueueStopped(null)
    await dismissGenerationError()
    const { jobs, batchTiming } = await listProjectJobs({ data: projectId })
    setActiveJobs(jobs)
    setBatchTimingData(batchTiming)
    if (jobs.length === 0) {
      setBatchTimingData(null)
      router.invalidate()
    }
  }

  // ── URL search params ──
  const searchParams = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const imageSortBy = searchParams.imageSort ?? 'newest'
  const setImageSortBy = useCallback((sort: ImageSortBy) => {
    navigate({ search: (prev) => ({ ...prev, imageSort: sort === 'newest' ? undefined : sort }) })
  }, [navigate])

  // ── Mobile panel ──
  const [leftOpen, setLeftOpen] = useState(false)

  // Save status indicator text
  const saveIndicator =
    saveStatus === 'saving' ? t('common.saving') :
    saveStatus === 'saved' ? t('common.saved') :
    saveStatus === 'error' ? t('common.saveFailed') : null

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
        {(activeJobs.length > 0 || queueStopped) && (
          <GenerationProgress
            jobs={activeJobs}
            batchTotal={activeJobs.reduce((sum, j) => sum + (j.totalCount ?? 0), 0)}
            batchTiming={batchTimingData}
            queueStopped={queueStopped}
            onCancel={handleCancelJobs}
            onPause={handlePause}
            onResume={handleResume}
            onDismissError={handleDismissError}
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
            generalPlaceholderKeys={stableGeneralKeys}
            characterPlaceholderKeys={characterPlaceholderKeys}
            characters={data.characters}
            onPlaceholdersChange={handlePlaceholdersChange}
            getPrompts={getPrompts}
          />
        </div>

        {/* Right — Image gallery */}
        <main className="flex-1 overflow-y-auto min-w-0">
          <SceneDetail
            sceneId={sceneId}
            characters={data.characters}
            generalPlaceholderKeys={stableGeneralKeys}
            projectId={projectId}
            thumbnailImageId={data.thumbnailImageId}
            onThumbnailChange={handleThumbnailChange}
            projectThumbnailImageId={data.projectThumbnailImageId}
            onProjectThumbnailChange={handleProjectThumbnailChange}
            refreshKey={refreshKey}
            hidePlaceholders
            sceneName={data.sceneName}
            sortBy={imageSortBy}
            onSortByChange={setImageSortBy}
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
