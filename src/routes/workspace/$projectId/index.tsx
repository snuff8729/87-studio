import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  Download04Icon,
  FileImportIcon,
  PlayIcon,
} from '@hugeicons/core-free-icons'
import type { MobilePane } from '@/components/editor-shell/editor-shell'
import type { SceneSortBy } from '@/components/workspace/scene-card'
import type { SceneImageSortBy } from '@/components/workspace/scene-detail'
import type {
  SceneBoardScene,
  SceneViewCharacterOverride,
  SceneViewScene,
} from '@/components/workspace/scene-view'
import type { SaveStatus } from '@/components/workspace/workspace-title'
import { extractPlaceholders } from '@/lib/placeholder'
import { useStableArray } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import {
  getRecentImages,
  getSceneImageCounts,
  getWorkspaceData,
  listProjectJobs,
} from '@/server/functions/workspace'
import { assignScenePack, updateProject } from '@/server/functions/projects'
import { createGenerationJob } from '@/server/functions/generation'
import { getSetting } from '@/server/functions/settings'
import {
  addProjectScene,
  bulkDeleteProjectScenes,
  deleteProjectScene,
  duplicateProjectScene,
  getAllCharacterOverrides,
  renameProjectScene,
  updateProjectScene,
} from '@/server/functions/project-scenes'
import { EditorShell } from '@/components/editor-shell/editor-shell'
import { EditorHeader } from '@/components/editor-shell/editor-header'
import { useGenerateShortcut } from '@/components/editor-shell/use-generate-shortcut'
import { PromptPanel } from '@/components/workspace/prompt-panel'
import {
  ReferencePanel,
  useReferenceImages,
} from '@/components/workspace/reference-panel'
import { ParameterForm } from '@/components/workspace/parameter-popover'
import { ScenePackDialog } from '@/components/workspace/scene-pack-dialog'
import { ImportDialog } from '@/components/workspace/import-dialog'
import { GenerationProgress } from '@/components/workspace/generation-progress'
import { ScenesTab } from '@/components/workspace/scenes-tab'
import { SceneBoard, SceneView } from '@/components/workspace/scene-view'
import { reserveSummary } from '@/components/workspace/reserve-summary'
import { WorkspaceTitle } from '@/components/workspace/workspace-title'
import { HistoryStrip } from '@/components/quick-generate/history-strip'
import { DownloadDialog } from '@/components/common/download-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

function PendingComponent() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-sidebar px-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-4 w-28" />
        <div className="flex-1" />
        <Skeleton className="h-7 w-24 rounded-md" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-[300px] shrink-0 flex-col border-r md:flex">
          <div className="flex h-10 items-center gap-2 border-b px-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-12" />
            ))}
          </div>
          <div className="flex-1 space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-12 w-9 shrink-0 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-6 w-16 rounded-md" />
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t p-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
            ))}
          </div>
        </main>
        <aside className="hidden w-[220px] shrink-0 space-y-2 border-l p-2 lg:block">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-md" />
          ))}
        </aside>
      </div>
    </div>
  )
}

const VALID_SORT = [
  'default',
  'name_asc',
  'name_desc',
  'images_desc',
  'images_asc',
  'created_asc',
  'created_desc',
] as const satisfies ReadonlyArray<SceneSortBy>

const VALID_IMAGE_SORT = [
  'newest',
  'tournament_winrate',
  'tournament_wins',
] as const satisfies ReadonlyArray<SceneImageSortBy>

type WorkspaceSearch = {
  sort?: SceneSortBy
  q?: string
  scene?: number
  imageSort?: SceneImageSortBy
}

const EMPTY_OVERRIDES: Array<SceneViewCharacterOverride> = []

type ProjectFields = {
  generalPrompt?: string
  negativePrompt?: string
  parameters?: string
}

export const Route = createFileRoute('/workspace/$projectId/')({
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => {
    const scene = Number(search.scene)
    return {
      sort:
        VALID_SORT.includes(search.sort as SceneSortBy) &&
        search.sort !== 'default'
          ? (search.sort as SceneSortBy)
          : undefined,
      q: typeof search.q === 'string' && search.q ? search.q : undefined,
      scene: Number.isInteger(scene) && scene > 0 ? scene : undefined,
      imageSort:
        VALID_IMAGE_SORT.includes(search.imageSort as SceneImageSortBy) &&
        search.imageSort !== 'newest'
          ? (search.imageSort as SceneImageSortBy)
          : undefined,
    }
  },
  loader: async ({ params }) => {
    const projectId = Number(params.projectId)
    return getWorkspaceData({ data: projectId })
  },
  component: WorkspacePage,
  pendingComponent: PendingComponent,
})

function WorkspacePage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const { t } = useTranslation()
  const projectId = data.project.id

  // ── Prompt state ──
  const [generalPrompt, setGeneralPrompt] = useState(
    data.project.generalPrompt ?? '',
  )
  const [negativePrompt, setNegativePrompt] = useState(
    data.project.negativePrompt ?? '',
  )
  const [params, setParams] = useState<Record<string, unknown>>(
    JSON.parse(data.project.parameters || '{}'),
  )

  // Sync only when navigating to a different project (not on every router.invalidate())
  // Local state is authoritative during editing; auto-save + invalidate should not overwrite unsaved edits
  useEffect(() => {
    setGeneralPrompt(data.project.generalPrompt ?? '')
    setNegativePrompt(data.project.negativePrompt ?? '')
    setParams(JSON.parse(data.project.parameters || '{}'))
  }, [data.project.id])

  // ── Stable placeholder key arrays (only change when actual keys change, not on every keystroke) ──
  const rawGeneralKeys = useMemo(
    () => [
      ...new Set([
        ...extractPlaceholders(generalPrompt),
        ...extractPlaceholders(negativePrompt),
      ]),
    ],
    [generalPrompt, negativePrompt],
  )
  const stableGeneralKeys = useStableArray(rawGeneralKeys)

  // ── Stable getPrompts callback for PlaceholderEditor preview (ref-based, no re-renders) ──
  const promptsRef = useRef({ generalPrompt, negativePrompt })
  promptsRef.current = { generalPrompt, negativePrompt }
  const getPrompts = useCallback(() => promptsRef.current, [])

  const characterPlaceholderKeys = useMemo(
    () =>
      data.characters.map((char) => ({
        characterId: char.id,
        characterName: char.name,
        keys: [
          ...new Set([
            ...extractPlaceholders(char.charPrompt),
            ...extractPlaceholders(char.charNegative),
          ]),
        ],
      })),
    [data.characters],
  )

  // ── Auto-save (debounced; pending fields are merged so a prompt edit
  // followed by a parameter edit within the debounce window saves both) ──
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savedClearRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingFieldsRef = useRef<ProjectFields>({})

  const saveProject = useCallback(
    async (fields: ProjectFields) => {
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
    (fields: ProjectFields) => {
      pendingFieldsRef.current = { ...pendingFieldsRef.current, ...fields }
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = undefined
        const pending = pendingFieldsRef.current
        pendingFieldsRef.current = {}
        saveProject(pending)
      }, 1000)
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

  const paramsRef = useRef(params)
  paramsRef.current = params
  const handleParamsChange = useCallback(
    (newParams: Record<string, unknown>) => {
      paramsRef.current = newParams
      setParams(newParams)
      debouncedSave({ parameters: JSON.stringify(newParams) })
    },
    [debouncedSave],
  )
  const setParam = useCallback(
    (key: string, value: unknown) =>
      handleParamsChange({ ...paramsRef.current, [key]: value }),
    [handleParamsChange],
  )

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
  const [liveSceneCounts, setLiveSceneCounts] = useState<
    Record<number, number>
  >({})

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
  const scenePacks = useMemo(
    () =>
      data.scenePacks.map((pack) => ({
        ...pack,
        scenes: pack.scenes.map((scene) => {
          const override = thumbnailOverrides[scene.id]

          return {
            ...scene,
            recentImageCount:
              liveSceneCounts[scene.id] ?? scene.recentImageCount,
            thumbnailImageId: override
              ? override.imageId
              : scene.thumbnailImageId,
            thumbnailPath: override
              ? override.thumbnailPath
              : scene.thumbnailImageId
                ? scene.thumbnailPath
                : (liveLatestThumbs[scene.id] ?? scene.thumbnailPath),
          }
        }),
      })),
    [data.scenePacks, thumbnailOverrides, liveSceneCounts, liveLatestThumbs],
  )

  const allScenes = useMemo(
    () =>
      scenePacks.flatMap((pack) =>
        pack.scenes.map((s) => ({ ...s, packName: pack.name })),
      ),
    [scenePacks],
  )
  const allSceneIds = useMemo(() => allScenes.map((s) => s.id), [allScenes])

  // ── Character overrides (for the selected scene's placeholder editor) ──
  const [characterOverrides, setCharacterOverrides] = useState<
    Record<number, Array<SceneViewCharacterOverride>>
  >({})

  const loadCharacterOverrides = useCallback(async () => {
    const ids = data.scenePacks.flatMap((p) => p.scenes.map((s) => s.id))
    if (ids.length === 0 || data.characters.length === 0) {
      setCharacterOverrides({})
      return
    }
    try {
      const overrides = await getAllCharacterOverrides({ data: ids })
      const grouped: Record<number, Array<SceneViewCharacterOverride>> = {}
      for (const o of overrides) {
        ;(grouped[o.projectSceneId] ??= []).push({
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

  // ── URL search params ──
  const searchParams = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const sceneSortBy = searchParams.sort ?? 'default'
  const setSceneSortBy = useCallback(
    (sort: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          sort: sort === 'default' ? undefined : (sort as SceneSortBy),
        }),
      })
    },
    [navigate],
  )

  const sceneSearch = searchParams.q ?? ''
  const setSceneSearch = useCallback(
    (q: string) => {
      navigate({
        search: (prev) => ({ ...prev, q: q || undefined }),
        replace: true,
      })
    },
    [navigate],
  )

  const imageSortBy = searchParams.imageSort ?? 'newest'
  const setImageSortBy = useCallback(
    (sort: SceneImageSortBy) => {
      navigate({
        search: (prev) => ({
          ...prev,
          imageSort: sort === 'newest' ? undefined : sort,
        }),
        replace: true,
      })
    },
    [navigate],
  )

  const [mobilePane, setMobilePane] = useState<MobilePane>('edit')

  const requestedSceneId = searchParams.scene ?? null
  const selectedSceneEntry =
    requestedSceneId == null
      ? undefined
      : allScenes.find((s) => s.id === requestedSceneId)
  const selectedSceneId = selectedSceneEntry ? requestedSceneId : null

  const setSelectedSceneId = useCallback(
    (id: number | null) => {
      navigate({ search: (prev) => ({ ...prev, scene: id ?? undefined }) })
    },
    [navigate],
  )

  const handleSceneSelect = useCallback(
    (id: number | null) => {
      setSelectedSceneId(id)
      if (id != null) setMobilePane('result')
    },
    [setSelectedSceneId],
  )

  // `?scene=` of another project / deleted / nonexistent → board, param cleared
  useEffect(() => {
    if (requestedSceneId != null && !selectedSceneEntry) {
      navigate({
        search: (prev) => ({ ...prev, scene: undefined }),
        replace: true,
      })
    }
  }, [requestedSceneId, selectedSceneEntry, navigate])

  const selectedScene = useMemo<SceneViewScene | null>(
    () =>
      selectedSceneEntry
        ? {
            id: selectedSceneEntry.id,
            name: selectedSceneEntry.name,
            packName: selectedSceneEntry.packName,
            placeholders: selectedSceneEntry.placeholders,
            thumbnailImageId: selectedSceneEntry.thumbnailImageId,
            thumbnailPath: selectedSceneEntry.thumbnailPath,
            imageCount: selectedSceneEntry.recentImageCount,
          }
        : null,
    [selectedSceneEntry],
  )

  const boardScenes = useMemo<Array<SceneBoardScene>>(
    () =>
      allScenes.map((s) => ({
        id: s.id,
        name: s.name,
        packName: s.packName,
        thumbnailPath: s.thumbnailPath,
        imageCount: s.recentImageCount,
      })),
    [allScenes],
  )

  // ── Scene management handlers ──
  const handleAddScene = useCallback(
    async (name: string) => {
      await addProjectScene({ data: { projectId, name } })
      router.invalidate()
    },
    [projectId, router],
  )

  const handleDeleteScene = useCallback(
    async (sceneId: number) => {
      await deleteProjectScene({ data: sceneId })
      router.invalidate()
    },
    [router],
  )

  const handleRenameScene = useCallback(
    async (id: number, name: string) => {
      await renameProjectScene({ data: { id, name } })
      router.invalidate()
    },
    [router],
  )

  const handleDuplicateScene = useCallback(
    async (sceneId: number) => {
      try {
        await duplicateProjectScene({ data: sceneId })
        router.invalidate()
        toast.success(t('scene.sceneDuplicated'))
      } catch {
        toast.error(t('scene.duplicateSceneFailed'))
      }
    },
    [router, t],
  )

  const handlePlaceholdersChange = useCallback(() => {
    // Reload workspace data to reflect saved placeholders
    router.invalidate()
    loadCharacterOverrides()
  }, [router, loadCharacterOverrides])

  const handleBulkDeleteScenes = useCallback(
    async (ids: Array<number>) => {
      try {
        await bulkDeleteProjectScenes({ data: ids })
      } catch (err) {
        toast.error(t('scene.bulkDeleteFailed'))
        throw err
      }
      toast.success(t('scene.bulkDeleteSuccess', { count: ids.length }))
      handlePlaceholdersChange()
    },
    [t, handlePlaceholdersChange],
  )

  // ── Thumbnails ──
  const handleSceneThumbnailChange = useCallback(
    (imageId: number | null, thumbnailPath?: string | null) => {
      if (selectedSceneId == null) return
      const sceneId = selectedSceneId
      setThumbnailOverrides((prev) => ({
        ...prev,
        [sceneId]: { imageId, thumbnailPath: thumbnailPath ?? null },
      }))
      updateProjectScene({ data: { id: sceneId, thumbnailImageId: imageId } })
        .then(() => router.invalidate())
        .catch(() => {
          setThumbnailOverrides((prev) => {
            const { [sceneId]: _, ...rest } = prev
            return rest
          })
          toast.error(t('imageDetail.setSceneThumbFailed'))
        })
    },
    [selectedSceneId, router, t],
  )

  const handleProjectThumbnailChange = useCallback(
    (imageId: number | null) => {
      updateProject({ data: { id: projectId, thumbnailImageId: imageId } })
        .then(() => router.invalidate())
        .catch(() => toast.error(t('imageDetail.setProjectThumbFailed')))
    },
    [projectId, router, t],
  )

  // ── SD Studio import (imported pack is assigned to this project) ──
  const [importOpen, setImportOpen] = useState(false)
  const handleImported = useCallback(
    async (packId: number) => {
      try {
        await assignScenePack({ data: { projectId, scenePackId: packId } })
        toast.success(t('templates.templateApplied'))
        router.invalidate()
      } catch {
        toast.error(t('templates.applyFailed'))
      }
    },
    [projectId, router, t],
  )

  // ── Generation state ──
  const [countPerScene, setCountPerScene] = useState(0)
  const [sceneCounts, setSceneCounts] = useState<Record<number, number>>({})
  const [generating, setGenerating] = useState(data.activeJobs.length > 0)
  const [queueStopped, setQueueStopped] = useState<'error' | 'paused' | null>(
    data.queueStatus?.queueStopped ?? null,
  )
  const [refreshKey, setRefreshKey] = useState(0)

  // Sync generation state when loader data changes (e.g. page refresh reconnects to running jobs)
  useEffect(() => {
    const stopped = data.queueStatus?.queueStopped ?? null
    if (data.activeJobs.length > 0 || stopped) {
      setGenerating(true)
      setQueueStopped(stopped)
    } else {
      // No active jobs and no queue stop state — clear generating
      setGenerating(false)
      setQueueStopped(null)
    }
  }, [data.activeJobs, data.queueStatus])

  const handleSceneCountChange = useCallback(
    (sceneId: number, count: number | null) => {
      setSceneCounts((prev) => {
        if (count === null) {
          const { [sceneId]: _, ...rest } = prev
          return rest
        }
        return { ...prev, [sceneId]: count }
      })
    },
    [],
  )

  const summary = useMemo(
    () => reserveSummary(allSceneIds, sceneCounts, countPerScene),
    [allSceneIds, sceneCounts, countPerScene],
  )

  // Poll during generation (stop polling when queue is stopped — no server-side changes in that state)
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

        const { jobs, queueStatus } = jobsResult
        setLiveImages(imgs)
        setLiveSceneCounts(counts)
        // New images appear in the selected scene's grid
        setRefreshKey((k) => k + 1)

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

        if (jobs.length === 0) {
          setGenerating(false)
          setQueueStopped(null)
          router.invalidate()
        }
      } catch {
        // ignore poll errors
      } finally {
        busy = false
      }
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [generating, queueStopped, projectId, router])

  async function handleGenerate() {
    const getSceneCount = (id: number) => sceneCounts[id] ?? countPerScene
    const sceneIds = allSceneIds.filter((id) => getSceneCount(id) > 0)
    if (allSceneIds.length === 0) {
      toast.error(t('generation.noScenesAvailable'))
      return
    }
    if (sceneIds.length === 0) {
      toast.error(t('generation.setCountFirst'))
      return
    }

    const apiKey = await getSetting({ data: 'nai_api_key' })
    if (!apiKey) {
      toast.error(t('generation.apiKeyNotSet'), {
        action: {
          label: t('nav.settings'),
          onClick: () =>
            router.navigate({
              to: '/settings',
              search: { imageDetail: undefined },
            }),
        },
      })
      return
    }

    // Flush a pending prompt/parameter save so the job uses the latest values
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = undefined
      pendingFieldsRef.current = {}
      await saveProject({
        generalPrompt,
        negativePrompt,
        parameters: JSON.stringify(params),
      })
    }

    const batchTotal = sceneIds.reduce((sum, id) => sum + getSceneCount(id), 0)
    setGenerating(true)
    try {
      await createGenerationJob({
        data: {
          projectId,
          projectSceneIds: sceneIds,
          countPerScene,
          sceneCounts:
            Object.keys(sceneCounts).length > 0 ? sceneCounts : undefined,
        },
      })
      toast.success(t('generation.generationStarted', { count: batchTotal }))
      window.dispatchEvent(new CustomEvent('queue-updated'))
      window.dispatchEvent(new CustomEvent('onboarding:generation-started'))
    } catch {
      toast.error(t('generation.generationFailed'))
      setGenerating(false)
    }
  }

  // Generate button cooldown (same 1s as Quick Generate)
  const [cooldown, setCooldown] = useState(false)
  const cooldownRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(cooldownRef.current), [])
  function handleGenerateClick() {
    handleGenerate()
    setCooldown(true)
    clearTimeout(cooldownRef.current)
    cooldownRef.current = setTimeout(() => setCooldown(false), 1000)
  }

  const canGenerate = summary.images > 0
  useGenerateShortcut(handleGenerate, canGenerate)

  // ── Tab badges ──
  const { data: references = [] } = useReferenceImages(projectId)
  const activeRefMode = params.referenceMode
  const enabledRefCount =
    activeRefMode === 'vibe' || activeRefMode === 'precise'
      ? references.filter((r) => r.enabled && r.type === activeRefMode).length
      : 0

  const availableScenes = useMemo(
    () =>
      allScenes.map((s) => ({ id: s.id, name: s.name, packName: s.packName })),
    [allScenes],
  )

  const exportDialog = useCallback(
    (sceneIds: Array<number>) => (
      <DownloadDialog
        trigger={
          <Button size="xs" variant="outline">
            <HugeiconsIcon icon={Download04Icon} className="size-3.5" />
            {t('export.export')}
          </Button>
        }
        projectId={projectId}
        projectName={data.project.name}
        projectSceneIds={sceneIds}
      />
    ),
    [projectId, data.project.name, t],
  )

  const openImageDetail = useCallback(
    (id: number) => {
      navigate({ search: (prev) => ({ ...prev, imageDetail: id }) })
    },
    [navigate],
  )

  const scenePackDialog = <ScenePackDialog projectId={projectId} />

  return (
    <>
      <EditorShell
        id="workspace"
        mobilePane={mobilePane}
        onMobilePaneChange={setMobilePane}
        header={
          <EditorHeader
            title={
              <WorkspaceTitle
                projectId={projectId}
                projectName={data.project.name}
                thumbnailPath={data.projectThumbnailPath}
                saveStatus={saveStatus}
              />
            }
            actions={
              <>
                {scenePackDialog}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setImportOpen(true)}
                  title={t('import.title')}
                >
                  <HugeiconsIcon icon={FileImportIcon} className="size-5" />
                  <span className="hidden sm:inline">
                    {t('workspace.importPreset')}
                  </span>
                </Button>
                <DownloadDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      <HugeiconsIcon icon={Download04Icon} className="size-5" />
                      <span className="hidden sm:inline">
                        {t('export.export')}
                      </span>
                    </Button>
                  }
                  projectId={projectId}
                  projectName={data.project.name}
                  availableScenes={availableScenes}
                  filenameTemplate={
                    params.filenameTemplate as string | undefined
                  }
                />
              </>
            }
          />
        }
        tabs={[
          {
            id: 'scenes',
            label: t('editor.tabScenes'),
            badge: allScenes.length,
            fill: true,
            onboarding: 'scenes-tab',
            content: (
              <ScenesTab
                scenePacks={scenePacks}
                projectId={projectId}
                sceneCounts={sceneCounts}
                defaultCount={countPerScene}
                onDefaultCountChange={setCountPerScene}
                onSceneCountChange={handleSceneCountChange}
                onAddScene={handleAddScene}
                onDeleteScene={handleDeleteScene}
                onRenameScene={handleRenameScene}
                onDuplicateScene={handleDuplicateScene}
                sortBy={sceneSortBy}
                onSortByChange={setSceneSortBy}
                searchQuery={sceneSearch}
                onSearchQueryChange={setSceneSearch}
                selectedSceneId={selectedSceneId}
                onSelectedSceneChange={handleSceneSelect}
                exportDialog={exportDialog}
                onBulkDeleteScenes={handleBulkDeleteScenes}
              />
            ),
          },
          {
            id: 'prompt',
            label: t('editor.tabPrompt'),
            onboarding: 'prompt-tab',
            content: (
              <PromptPanel
                section="prompt"
                generalPrompt={generalPrompt}
                negativePrompt={negativePrompt}
                characters={data.characters}
                onGeneralPromptChange={handleGeneralPromptChange}
                onNegativePromptChange={handleNegativePromptChange}
                projectId={projectId}
              />
            ),
          },
          {
            id: 'chars',
            label: t('editor.tabCharacters'),
            badge: data.characters.length,
            content: (
              <PromptPanel
                section="characters"
                generalPrompt={generalPrompt}
                negativePrompt={negativePrompt}
                characters={data.characters}
                onGeneralPromptChange={handleGeneralPromptChange}
                onNegativePromptChange={handleNegativePromptChange}
                projectId={projectId}
              />
            ),
          },
          {
            id: 'refs',
            label: t('editor.tabReferences'),
            badge: enabledRefCount,
            content: (
              <ReferencePanel
                projectId={projectId}
                className="border-t-0 p-0"
                referenceMode={
                  (params.referenceMode as 'none' | 'vibe' | 'precise') ??
                  'none'
                }
                currentModel={
                  (params.model as string) ?? 'nai-diffusion-4-5-full'
                }
                onReferenceModeChange={(mode) =>
                  setParam('referenceMode', mode)
                }
              />
            ),
          },
          {
            id: 'params',
            label: t('editor.tabParameters'),
            content: <ParameterForm localParams={params} set={setParam} />,
          },
        ]}
        footer={
          <div className="flex flex-col gap-2">
            <GenerationProgress />
            <div
              className="flex items-center gap-2"
              data-onboarding="generation-controls"
            >
              <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
                {t('workspace.reserveSummary', {
                  scenes: summary.scenes,
                  images: summary.images,
                })}
              </div>
              <Button
                variant="brand"
                onClick={handleGenerateClick}
                disabled={!canGenerate || cooldown}
                title={t('workspace.generateShortcut')}
                className="shrink-0"
              >
                <HugeiconsIcon icon={PlayIcon} className="size-5" />
                {t('generation.generateCount', { count: summary.images })}
              </Button>
            </div>
          </div>
        }
        center={
          selectedScene ? (
            <SceneView
              projectId={projectId}
              scene={selectedScene}
              characters={data.characters}
              characterOverrides={
                characterOverrides[selectedScene.id] ?? EMPTY_OVERRIDES
              }
              generalPlaceholderKeys={stableGeneralKeys}
              characterPlaceholderKeys={characterPlaceholderKeys}
              getPrompts={getPrompts}
              onPlaceholdersChange={handlePlaceholdersChange}
              onRenameScene={handleRenameScene}
              onThumbnailChange={handleSceneThumbnailChange}
              projectThumbnailImageId={data.project.thumbnailImageId}
              onProjectThumbnailChange={handleProjectThumbnailChange}
              refreshKey={refreshKey}
              imageSortBy={imageSortBy}
              onImageSortByChange={setImageSortBy}
            />
          ) : (
            <SceneBoard
              scenes={boardScenes}
              sceneCounts={sceneCounts}
              defaultCount={countPerScene}
              onSceneCountChange={handleSceneCountChange}
              onSelect={handleSceneSelect}
              onAddScene={handleAddScene}
              scenePackDialog={scenePackDialog}
            />
          )
        }
        rightTitle={
          liveImages.length > 0
            ? `${t('history.title')} · ${liveImages.length}`
            : t('history.title')
        }
        right={
          <HistoryStrip
            images={liveImages}
            selectedImageId={null}
            onSelect={openImageDetail}
            footer={
              <Link
                to="/gallery"
                search={{ project: projectId, imageDetail: undefined }}
                className="flex min-w-0 items-center gap-1 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-primary"
              >
                <span className="truncate">
                  {t('quickGenerate.viewInGallery')}
                </span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-4 shrink-0"
                />
              </Link>
            }
          />
        }
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />
    </>
  )
}
