import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { getWorkspaceData, listProjectJobs, getRecentImages, getSceneImageCounts } from '@/server/functions/workspace'
import { updateProject } from '@/server/functions/projects'
import { createGenerationJob, cancelJobs } from '@/server/functions/generation'
import { updateProjectScene } from '@/server/functions/project-scenes'
import { getSetting } from '@/server/functions/settings'
import { WorkspaceLayout } from '@/components/workspace/workspace-layout'
import { WorkspaceHeader } from '@/components/workspace/workspace-header'
import { BottomToolbar } from '@/components/workspace/bottom-toolbar'
import { PromptPanel } from '@/components/workspace/prompt-panel'
import { ScenePanel } from '@/components/workspace/scene-panel'
import { HistoryPanel } from '@/components/workspace/history-panel'
import { ParameterPopover } from '@/components/workspace/parameter-popover'
import { CharacterPopover } from '@/components/workspace/character-popover'
import { ScenePackDialog } from '@/components/workspace/scene-pack-dialog'
import { GenerationProgress } from '@/components/workspace/generation-progress'

export const Route = createFileRoute('/workspace/$projectId')({
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

  // ── Scene state ──
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null)

  // ── Live images (updated incrementally during generation) ──
  const [liveImages, setLiveImages] = useState(data.recentImages)
  useEffect(() => {
    setLiveImages(data.recentImages)
  }, [data.recentImages])

  // ── Thumbnail optimistic state ──
  const [thumbnailOverrides, setThumbnailOverrides] = useState<
    Record<number, { imageId: number | null; thumbnailPath: string | null }>
  >({})

  // Clear overrides when loader data refreshes (server caught up)
  useEffect(() => {
    setThumbnailOverrides({})
  }, [data.scenePacks])

  // ── Live scene image counts (polled during generation) ──
  const [liveSceneCounts, setLiveSceneCounts] = useState<Record<number, number>>({})

  // Clear live counts when loader data refreshes (server caught up)
  useEffect(() => {
    setLiveSceneCounts({})
  }, [data.scenePacks])

  // Latest thumbnail per scene from liveImages
  const liveLatestThumbs = useMemo(() => {
    const thumbs: Record<number, string | null> = {}
    for (const img of liveImages) {
      const sid = img.projectSceneId
      if (sid == null || sid in thumbs) continue
      // liveImages is ordered by createdAt desc, first hit is latest
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

  // ── Generation state ──
  const [countPerScene, setCountPerScene] = useState(0)
  const [sceneCounts, setSceneCounts] = useState<Record<number, number>>({})
  const [generating, setGenerating] = useState(false)
  const [generationTotal, setGenerationTotal] = useState(0)
  const [activeJobs, setActiveJobs] = useState(
    data.queueStatus.processing ? [] as Awaited<ReturnType<typeof listProjectJobs>>: [],
  )

  // All scenes across all packs (flat list for generation)
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

  function handleThumbnailChange(
    sceneId: number,
    imageId: number | null,
    thumbnailPath?: string | null,
  ) {
    // Optimistic update — UI changes instantly
    setThumbnailOverrides((prev) => ({
      ...prev,
      [sceneId]: { imageId, thumbnailPath: thumbnailPath ?? null },
    }))
    // Fire-and-forget server update + background invalidate
    updateProjectScene({ data: { id: sceneId, thumbnailImageId: imageId } })
      .then(() => router.invalidate())
      .catch(() => toast.error('Failed to update thumbnail'))
  }

  // Poll: always fetch jobs + images together, fixed interval, skip if busy
  const prevCompletedRef = useRef(0)
  const [generationRefreshKey, setGenerationRefreshKey] = useState(0)
  useEffect(() => {
    if (!generating) return
    let cancelled = false
    let busy = false

    const interval = setInterval(async () => {
      if (cancelled || busy) return
      busy = true
      try {
        const [jobs, imgs, counts] = await Promise.all([
          listProjectJobs({ data: projectId }),
          getRecentImages({ data: projectId }),
          getSceneImageCounts({ data: projectId }),
        ])
        if (cancelled) return

        setActiveJobs(jobs)
        setLiveImages(imgs)
        setLiveSceneCounts(counts)

        const totalCompleted = jobs.reduce((sum, j) => sum + (j.completedCount ?? 0), 0)
        if (totalCompleted !== prevCompletedRef.current) {
          prevCompletedRef.current = totalCompleted
          setGenerationRefreshKey((k) => k + 1)
        }

        if (jobs.length === 0) {
          setGenerating(false)
          prevCompletedRef.current = 0
          setGenerationRefreshKey((k) => k + 1)
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
    // Determine which scenes to generate (only those with count > 0)
    const candidateIds = selectedSceneId ? [selectedSceneId] : allScenes.map((s) => s.id)
    const sceneIds = candidateIds.filter((id) => getSceneCount(id) > 0)
    if (candidateIds.length === 0) {
      toast.error('No scenes available. Add a scene pack first.')
      return
    }
    if (sceneIds.length === 0) {
      toast.error('Set a count on at least one scene to generate.')
      return
    }

    // Check API key
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

    // Flush any pending saves first
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
      // Start polling
      const jobs = await listProjectJobs({ data: projectId })
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

  // ── Mobile panel state ──
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  // Compute total images for the generate button
  const targetSceneIds = selectedSceneId ? [selectedSceneId] : allScenes.map((s) => s.id)
  const totalImages = targetSceneIds.reduce((sum, id) => sum + getSceneCount(id), 0)

  return (
    <WorkspaceLayout
      header={
        <WorkspaceHeader
          projectName={data.project.name}
          projectId={projectId}
          saveStatus={saveStatus}
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
          selectedSceneId={selectedSceneId}
          onSelectScene={setSelectedSceneId}
          characters={data.characters}
          generalPrompt={generalPrompt}
          projectId={projectId}
          sceneCounts={sceneCounts}
          defaultCount={countPerScene}
          onSceneCountChange={handleSceneCountChange}
          onThumbnailChange={handleThumbnailChange}
          refreshKey={generationRefreshKey}
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
          characterPopover={
            <CharacterPopover
              characters={data.characters}
              projectId={projectId}
            />
          }
          scenePackDialog={
            <ScenePackDialog projectId={projectId} />
          }
          generationProgress={
            <GenerationProgress
              jobs={activeJobs}
              batchTotal={generationTotal}
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
