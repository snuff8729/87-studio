import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { extractPlaceholders } from '@/lib/placeholder'
import { useStableArray } from '@/lib/utils'
import { toast } from 'sonner'
import { getWorkspaceData, listProjectJobs, getRecentImages, getSceneImageCounts } from '@/server/functions/workspace'
import { updateProject } from '@/server/functions/projects'
import { createGenerationJob, cancelJobs, pauseGeneration, resumeGeneration, dismissGenerationError } from '@/server/functions/generation'
import { getSetting } from '@/server/functions/settings'
import {
  addProjectScene,
  deleteProjectScene,
  renameProjectScene,
  getAllCharacterOverrides,
} from '@/server/functions/project-scenes'
import { WorkspaceLayout } from '@/components/workspace/workspace-layout'
import { WorkspaceHeader } from '@/components/workspace/workspace-header'
import { BottomToolbar } from '@/components/workspace/bottom-toolbar'
import { PromptPanel } from '@/components/workspace/prompt-panel'
import { ScenePanel } from '@/components/workspace/scene-panel'
import { HistoryPanel } from '@/components/workspace/history-panel'
import { ParameterPopover } from '@/components/workspace/parameter-popover'
import { ScenePackDialog } from '@/components/workspace/scene-pack-dialog'
import { GenerationProgress } from '@/components/workspace/generation-progress'

export const Route = createFileRoute('/workspace/$projectId/')({
  loader: async ({ params }) => {
    const projectId = Number(params.projectId)
    return getWorkspaceData({ data: projectId })
  },
  component: WorkspacePage,
})

function WorkspacePage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const projectId = data.project.id

  // ── Prompt state ──
  const [generalPrompt, setGeneralPrompt] = useState(data.project.generalPrompt ?? '')
  const [negativePrompt, setNegativePrompt] = useState(data.project.negativePrompt ?? '')
  const [params, setParams] = useState<Record<string, unknown>>(
    JSON.parse(data.project.parameters || '{}'),
  )

  // Sync when loader data changes
  useEffect(() => {
    setGeneralPrompt(data.project.generalPrompt ?? '')
    setNegativePrompt(data.project.negativePrompt ?? '')
    setParams(JSON.parse(data.project.parameters || '{}'))
  }, [data.project])

  // ── Stable placeholder key arrays (only change when actual keys change, not on every keystroke) ──
  const rawGeneralKeys = useMemo(
    () => [...new Set([...extractPlaceholders(generalPrompt), ...extractPlaceholders(negativePrompt)])],
    [generalPrompt, negativePrompt],
  )
  const stableGeneralKeys = useStableArray(rawGeneralKeys)

  // ── Stable getPrompts callback for PlaceholderEditor preview (ref-based, no re-renders) ──
  const promptsRef = useRef({ generalPrompt, negativePrompt })
  promptsRef.current = { generalPrompt, negativePrompt }
  const getPrompts = useCallback(() => promptsRef.current, [])

  const characterPlaceholderKeys = useMemo(
    () => data.characters.map((char) => ({
      characterId: char.id,
      characterName: char.name,
      keys: [...new Set([...extractPlaceholders(char.charPrompt), ...extractPlaceholders(char.charNegative)])],
    })),
    [data.characters],
  )

  // ── Auto-save ──
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savedClearRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const saveProject = useCallback(
    async (fields: {
      generalPrompt?: string
      negativePrompt?: string
      parameters?: string
    }) => {
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
    (fields: { generalPrompt?: string; negativePrompt?: string; parameters?: string }) => {
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

  function handleParamsChange(newParams: Record<string, unknown>) {
    setParams(newParams)
    debouncedSave({ parameters: JSON.stringify(newParams) })
  }

  // ── Live images (updated incrementally during generation) ──
  const [liveImages, setLiveImages] = useState(data.recentImages)
  useEffect(() => {
    setLiveImages(data.recentImages)
  }, [data.recentImages])

  // ── Thumbnail optimistic state ──
  const [thumbnailOverrides, setThumbnailOverrides] = useState<
    Record<number, { imageId: number | null; thumbnailPath: string | null }>
  >({})

  useEffect(() => {
    setThumbnailOverrides({})
  }, [data.scenePacks])

  // ── Live scene image counts (polled during generation) ──
  const [liveSceneCounts, setLiveSceneCounts] = useState<Record<number, number>>({})

  useEffect(() => {
    setLiveSceneCounts({})
  }, [data.scenePacks])

  // Latest thumbnail per scene from liveImages
  const liveLatestThumbs = useMemo(() => {
    const thumbs: Record<number, string | null> = {}
    for (const img of liveImages) {
      const sid = img.projectSceneId
      if (sid == null || sid in thumbs) continue
      thumbs[sid] = img.thumbnailPath
    }
    return thumbs
  }, [liveImages])

  // Merge optimistic thumbnail overrides + live counts into scene packs
  const scenePacks = useMemo(() => data.scenePacks.map((pack) => ({
    ...pack,
    scenes: pack.scenes.map((scene) => {
      const override = thumbnailOverrides[scene.id]

      return {
        ...scene,
        recentImageCount: liveSceneCounts[scene.id] ?? scene.recentImageCount,
        thumbnailImageId: override ? override.imageId : scene.thumbnailImageId,
        thumbnailPath: override
          ? override.thumbnailPath
          : scene.thumbnailImageId
            ? scene.thumbnailPath
            : (liveLatestThumbs[scene.id] ?? scene.thumbnailPath),
      }
    }),
  })), [data.scenePacks, thumbnailOverrides, liveSceneCounts, liveLatestThumbs])

  // ── Character overrides (loaded for matrix view) ──
  const [characterOverrides, setCharacterOverrides] = useState<
    Record<number, Array<{ projectSceneId: number; characterId: number; placeholders: string }>>
  >({})

  const loadCharacterOverrides = useCallback(async () => {
    const allSceneIds = data.scenePacks.flatMap((p) => p.scenes.map((s) => s.id))
    if (allSceneIds.length === 0 || data.characters.length === 0) {
      setCharacterOverrides({})
      return
    }
    try {
      const overrides = await getAllCharacterOverrides({ data: allSceneIds })
      const grouped: Record<number, Array<{ projectSceneId: number; characterId: number; placeholders: string }>> = {}
      for (const o of overrides) {
        if (!grouped[o.projectSceneId]) grouped[o.projectSceneId] = []
        grouped[o.projectSceneId].push({
          projectSceneId: o.projectSceneId,
          characterId: o.characterId,
          placeholders: o.placeholders ?? '{}',
        })
      }
      setCharacterOverrides(grouped)
    } catch {
      // ignore
    }
  }, [data.scenePacks, data.characters.length])

  useEffect(() => {
    loadCharacterOverrides()
  }, [loadCharacterOverrides])

  // ── Scene management handlers ──
  const handleAddScene = useCallback(async (name: string) => {
    await addProjectScene({ data: { projectId, name } })
    router.invalidate()
  }, [projectId, router])

  const handleDeleteScene = useCallback(async (sceneId: number) => {
    await deleteProjectScene({ data: sceneId })
    router.invalidate()
  }, [router])

  const handleRenameScene = useCallback(async (id: number, name: string) => {
    await renameProjectScene({ data: { id, name } })
    router.invalidate()
  }, [router])

  const handlePlaceholdersChange = useCallback(() => {
    // Reload workspace data to reflect saved placeholders
    router.invalidate()
    loadCharacterOverrides()
  }, [router, loadCharacterOverrides])

  // ── Generation state ──
  const [countPerScene, setCountPerScene] = useState(0)
  const [sceneCounts, setSceneCounts] = useState<Record<number, number>>({})
  const [generating, setGenerating] = useState(data.activeJobs.length > 0)
  const [generationTotal, setGenerationTotal] = useState(
    () => data.activeJobs.reduce((sum, j) => sum + (j.totalCount ?? 0), 0),
  )
  const [activeJobs, setActiveJobs] = useState(data.activeJobs)
  const [batchTimingData, setBatchTimingData] = useState<{
    startedAt: number
    totalImages: number
    completedImages: number
    avgImageDurationMs: number | null
  } | null>(data.batchTiming)
  const [queueStopped, setQueueStopped] = useState<'error' | 'paused' | null>(
    data.queueStatus?.queueStopped ?? null,
  )

  // Sync generation state when loader data changes (e.g. page refresh reconnects to running jobs)
  useEffect(() => {
    const stopped = data.queueStatus?.queueStopped ?? null
    if (data.activeJobs.length > 0 || stopped) {
      setActiveJobs(data.activeJobs)
      setGenerating(true)
      setGenerationTotal(data.activeJobs.reduce((sum, j) => sum + (j.totalCount ?? 0), 0))
      setQueueStopped(stopped)
    }
  }, [data.activeJobs, data.queueStatus])

  const allScenes = scenePacks.flatMap((pack) =>
    pack.scenes.map((s) => ({ ...s, packName: pack.name })),
  )

  function getSceneCount(sceneId: number) {
    return sceneCounts[sceneId] ?? countPerScene
  }

  const handleSceneCountChange = useCallback((sceneId: number, count: number | null) => {
    setSceneCounts((prev) => {
      if (count === null) {
        const { [sceneId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [sceneId]: count }
    })
  }, [])

  // Poll during generation (stop polling when queue is stopped — no server-side changes in that state)
  const prevCompletedRef = useRef(0)
  useEffect(() => {
    if (!generating || queueStopped) return
    let cancelled = false
    let busy = false

    const interval = setInterval(async () => {
      if (cancelled || busy) return
      busy = true
      try {
        const [jobsResult, imgs, counts] = await Promise.all([
          listProjectJobs({ data: projectId }),
          getRecentImages({ data: projectId }),
          getSceneImageCounts({ data: projectId }),
        ])
        if (cancelled) return

        const { jobs, batchTiming, queueStatus } = jobsResult
        setActiveJobs(jobs)
        setBatchTimingData(batchTiming)
        setLiveImages(imgs)
        setLiveSceneCounts(counts)

        // Detect queue stop (error or pause)
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

        const totalCompleted = jobs.reduce((sum, j) => sum + (j.completedCount ?? 0), 0)
        if (totalCompleted !== prevCompletedRef.current) {
          prevCompletedRef.current = totalCompleted
        }

        if (jobs.length === 0 && !queueStatus?.queueStopped) {
          setGenerating(false)
          setQueueStopped(null)
          setBatchTimingData(null)
          prevCompletedRef.current = 0
          router.invalidate()
        }
      } catch {
        // ignore poll errors
      } finally {
        busy = false
      }
    }, 2000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [generating, queueStopped, projectId, router])

  async function handleGenerate() {
    const candidateIds = allScenes.map((s) => s.id)
    const sceneIds = candidateIds.filter((id) => getSceneCount(id) > 0)
    if (candidateIds.length === 0) {
      toast.error('No scenes available. Add a scene first.')
      return
    }
    if (sceneIds.length === 0) {
      toast.error('Set a count on at least one scene to generate.')
      return
    }

    const apiKey = await getSetting({ data: 'nai_api_key' })
    if (!apiKey) {
      toast.error('API key not set. Go to Settings to configure.', {
        action: {
          label: 'Settings',
          onClick: () => router.navigate({ to: '/settings' }),
        },
      })
      return
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      await saveProject({
        generalPrompt,
        negativePrompt,
        parameters: JSON.stringify(params),
      })
    }

    const batchTotal = sceneIds.reduce((sum, id) => sum + getSceneCount(id), 0)
    setGenerationTotal(batchTotal)
    setGenerating(true)
    try {
      await createGenerationJob({
        data: {
          projectId,
          projectSceneIds: sceneIds,
          countPerScene,
          sceneCounts: Object.keys(sceneCounts).length > 0 ? sceneCounts : undefined,
        },
      })
      toast.success(`${batchTotal} image generation started`)
      const { jobs } = await listProjectJobs({ data: projectId })
      setActiveJobs(jobs)
    } catch {
      toast.error('Failed to start generation')
      setGenerating(false)
    }
  }

  async function handleCancelJobs() {
    const jobIds = activeJobs.map((j) => j.id)
    if (jobIds.length === 0) return
    await cancelJobs({ data: jobIds })
    setActiveJobs([])
    setGenerating(false)
    setQueueStopped(null)
    toast.success('Generation cancelled')
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
    // Re-fetch jobs to update UI
    const { jobs, batchTiming } = await listProjectJobs({ data: projectId })
    setActiveJobs(jobs)
    setBatchTimingData(batchTiming)
    if (jobs.length === 0) {
      setGenerating(false)
      setBatchTimingData(null)
      router.invalidate()
    }
  }

  // ── View mode ──
  const [viewMode, setViewMode] = useState<'reserve' | 'edit'>('reserve')

  // ── Mobile panel state ──
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  const totalImages = allScenes.reduce((sum, s) => sum + getSceneCount(s.id), 0)

  return (
    <WorkspaceLayout
      header={
        <WorkspaceHeader
          projectName={data.project.name}
          projectId={projectId}
          saveStatus={saveStatus}
          thumbnailPath={data.projectThumbnailPath}
        />
      }
      leftPanel={
        <PromptPanel
          generalPrompt={generalPrompt}
          negativePrompt={negativePrompt}
          characters={data.characters}
          onGeneralPromptChange={handleGeneralPromptChange}
          onNegativePromptChange={handleNegativePromptChange}
          projectId={projectId}
        />
      }
      centerPanel={
        <ScenePanel
          scenePacks={scenePacks}
          projectId={projectId}
          generalPlaceholderKeys={stableGeneralKeys}
          characterPlaceholderKeys={characterPlaceholderKeys}
          characters={data.characters}
          characterOverrides={characterOverrides}
          sceneCounts={sceneCounts}
          defaultCount={countPerScene}
          onSceneCountChange={handleSceneCountChange}
          onAddScene={handleAddScene}
          onDeleteScene={handleDeleteScene}
          onRenameScene={handleRenameScene}
          onPlaceholdersChange={handlePlaceholdersChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          getPrompts={getPrompts}
        />
      }
      rightPanel={
        <HistoryPanel
          images={liveImages}
          projectId={projectId}
        />
      }
      bottomToolbar={
        <BottomToolbar
          countPerScene={countPerScene}
          onCountChange={setCountPerScene}
          onGenerate={handleGenerate}
          generating={generating}
          totalImages={totalImages}

          parameterPopover={
            <ParameterPopover params={params} onChange={handleParamsChange} />
          }
          scenePackDialog={
            <ScenePackDialog projectId={projectId} />
          }
          generationProgress={
            <GenerationProgress
              jobs={activeJobs}
              batchTotal={generationTotal}
              batchTiming={batchTimingData}
              queueStopped={queueStopped}
              onCancel={handleCancelJobs}
              onPause={handlePause}
              onResume={handleResume}
              onDismissError={handleDismissError}
            />
          }
          onToggleLeft={() => { setLeftOpen(!leftOpen); setRightOpen(false) }}
          onToggleRight={() => { setRightOpen(!rightOpen); setLeftOpen(false) }}
        />
      }
      leftOpen={leftOpen}
      rightOpen={rightOpen}
      onDismiss={() => { setLeftOpen(false); setRightOpen(false) }}
    />
  )
}
