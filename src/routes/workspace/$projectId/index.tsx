import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { getWorkspaceData, listProjectJobs, getRecentImages, getSceneImageCounts } from '@/server/functions/workspace'
import { updateProject } from '@/server/functions/projects'
import { createGenerationJob, cancelJobs } from '@/server/functions/generation'
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
  const scenePacks = data.scenePacks.map((pack) => ({
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
  }))

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
  async function handleAddScene(name: string) {
    await addProjectScene({ data: { projectId, name } })
    router.invalidate()
  }

  async function handleDeleteScene(sceneId: number) {
    await deleteProjectScene({ data: sceneId })
    router.invalidate()
  }

  async function handleRenameScene(id: number, name: string) {
    await renameProjectScene({ data: { id, name } })
    router.invalidate()
  }

  function handlePlaceholdersChange() {
    // Reload workspace data to reflect saved placeholders
    router.invalidate()
    loadCharacterOverrides()
  }

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

  // Sync generation state when loader data changes (e.g. page refresh reconnects to running jobs)
  useEffect(() => {
    if (data.activeJobs.length > 0) {
      setActiveJobs(data.activeJobs)
      setGenerating(true)
      setGenerationTotal(data.activeJobs.reduce((sum, j) => sum + (j.totalCount ?? 0), 0))
    }
  }, [data.activeJobs])

  const allScenes = scenePacks.flatMap((pack) =>
    pack.scenes.map((s) => ({ ...s, packName: pack.name })),
  )

  function getSceneCount(sceneId: number) {
    return sceneCounts[sceneId] ?? countPerScene
  }

  function handleSceneCountChange(sceneId: number, count: number | null) {
    setSceneCounts((prev) => {
      if (count === null) {
        const { [sceneId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [sceneId]: count }
    })
  }

  // Poll during generation
  const prevCompletedRef = useRef(0)
  useEffect(() => {
    if (!generating) return
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

        const { jobs, batchTiming } = jobsResult
        setActiveJobs(jobs)
        setBatchTimingData(batchTiming)
        setLiveImages(imgs)
        setLiveSceneCounts(counts)

        const totalCompleted = jobs.reduce((sum, j) => sum + (j.completedCount ?? 0), 0)
        if (totalCompleted !== prevCompletedRef.current) {
          prevCompletedRef.current = totalCompleted
        }

        if (jobs.length === 0) {
          setGenerating(false)
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
  }, [generating, projectId, router])

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
    toast.success('Generation cancelled')
    router.invalidate()
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
          generalPrompt={generalPrompt}
          negativePrompt={negativePrompt}
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
              onCancel={handleCancelJobs}
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
