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
  ArrowDown01Icon,
  ArrowRight01Icon,
  DashboardSquare01Icon,
  Download04Icon,
  FileImportIcon,
  PlayIcon,
} from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import type { MobilePane } from '@/components/editor-shell/editor-shell'
import type {
  SceneFilter,
  SceneSortBy,
} from '@/components/workspace/scene-filters'
import type { RailPack } from '@/components/workspace/scene-rail'
import type { PackInfo } from '@/components/workspace/project-pack-provider'
import type {
  AddSceneConfig,
  AddSceneInput,
} from '@/components/workspace/add-scene-popover'
import type { SceneImageSortBy } from '@/components/workspace/scene-detail'
import type {
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
import {
  assignScenePack,
  removeProjectScenePack,
  updateProject,
} from '@/server/functions/projects'
import {
  createProjectScenePack,
  moveProjectScene,
  moveProjectScenes,
  renameProjectScenePack,
  reorderProjectScenePack,
} from '@/server/functions/project-scene-packs'
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
import {
  useGenerateCooldown,
  useGenerateShortcut,
} from '@/components/editor-shell/use-generate-shortcut'
import {
  PendingSavesProvider,
  createPendingSaves,
} from '@/components/workspace/pending-saves'
import { PromptPanel } from '@/components/workspace/prompt-panel'
import { CharactersPanel } from '@/components/workspace/characters-panel'
import {
  ReferencePanel,
  useReferenceImages,
} from '@/components/workspace/reference-panel'
import { ParameterForm } from '@/components/workspace/parameter-popover'
import { ScenePackDialog } from '@/components/workspace/scene-pack-dialog'
import { ImportDialog } from '@/components/workspace/import-dialog'
import { GenerationProgress } from '@/components/workspace/generation-progress'
import {
  SceneRail,
  effectiveCollapsed,
  useCollapsedPacks,
  useRailCompact,
} from '@/components/workspace/scene-rail'
import { ScenePalette } from '@/components/workspace/scene-palette'
import { useScenePaletteShortcut } from '@/components/workspace/scene-palette-shortcut'
import {
  countByFilter,
  filterScenes,
  sortScenes,
} from '@/components/workspace/scene-filters'
import { toSceneCardScene } from '@/components/workspace/scene-card'
import { SceneSelectionHeader } from '@/components/workspace/scene-selection-header'
import { ProjectPackProvider } from '@/components/workspace/project-pack-provider'
import { ConvertToTemplateDialog } from '@/components/workspace/convert-to-template-dialog'
import {
  selectAllState,
  setChecked,
  visibleChecked,
} from '@/components/workspace/scene-selection'
import {
  SceneBoard,
  SceneEmptyState,
  SceneView,
} from '@/components/workspace/scene-view'
import { reserveSummary } from '@/components/workspace/reserve-summary'
import {
  parseReservePrefs,
  reserveKey,
  serializeReservePrefs,
} from '@/components/workspace/reserve-prefs'
import {
  readStorage,
  writeStorage,
} from '@/components/editor-shell/use-editor-persist'
import { WorkspaceTitle } from '@/components/workspace/workspace-title'
import { HistoryStrip } from '@/components/quick-generate/history-strip'
import { DownloadDialog } from '@/components/common/download-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

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
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-12" />
            ))}
          </div>
          <div className="flex-1 space-y-3 p-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-28 w-full rounded-md" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
          <div className="space-y-2 border-t p-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </aside>
        <main className="flex min-w-0 flex-1">
          <div className="hidden w-[216px] shrink-0 space-y-2 border-r bg-sidebar p-2 md:block">
            <Skeleton className="h-7 w-full rounded-md" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Skeleton className="h-9 w-7 shrink-0 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-6 w-14 rounded-md" />
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 space-y-3 p-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full rounded-md" />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
              ))}
            </div>
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
  /** Center mode: scene rail + view (default) or the scene board. */
  view?: 'board'
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
      view: search.view === 'board' ? 'board' : undefined,
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

  // Last started project save (awaited by Generate)
  const projectSaveInFlightRef = useRef<Promise<void>>(Promise.resolve())

  /** Saves the pending (debounced) fields now, or awaits a save in flight. */
  const flushProjectSave = useCallback((): Promise<void> => {
    if (!saveTimeoutRef.current) return projectSaveInFlightRef.current
    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = undefined
    const pending = pendingFieldsRef.current
    pendingFieldsRef.current = {}
    const save = saveProject(pending)
    projectSaveInFlightRef.current = save
    return save
  }, [saveProject])

  const debouncedSave = useCallback(
    (fields: ProjectFields) => {
      pendingFieldsRef.current = { ...pendingFieldsRef.current, ...fields }
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => void flushProjectSave(), 1000)
    },
    [flushProjectSave],
  )

  // Debounced saves of child editors (placeholders, character prompts),
  // flushed before Generate
  const [pendingSaves] = useState(createPendingSaves)

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
        pack.scenes.map((s) => ({
          ...s,
          packName: pack.name,
          packId: pack.id,
        })),
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
    (sort: SceneSortBy) => {
      navigate({
        search: (prev) => ({
          ...prev,
          sort: sort === 'default' ? undefined : sort,
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
  const [scenesSheetOpen, setScenesSheetOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [packDialogOpen, setPackDialogOpen] = useState(false)

  const boardMode = searchParams.view === 'board'

  const requestedSceneId = searchParams.scene ?? null
  /** A scene we just created and selected, until the loader data has it */
  const justAddedSceneRef = useRef<number | null>(null)
  const selectedSceneEntry =
    requestedSceneId == null
      ? undefined
      : allScenes.find((s) => s.id === requestedSceneId)
  const selectedSceneId = selectedSceneEntry ? requestedSceneId : null

  /**
   * Selects a scene and shows it (scene mode). `replace`: keyboard ↑/↓
   * moves do not add history entries.
   */
  const handleSceneSelect = useCallback(
    (id: number, opts?: { replace?: boolean }) => {
      navigate({
        search: (prev) => ({ ...prev, scene: id, view: undefined }),
        replace: opts?.replace,
      })
      setMobilePane('result')
    },
    [navigate],
  )

  const openBoard = useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, view: 'board' as const }) })
  }, [navigate])

  const closeBoard = useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, view: undefined }) })
  }, [navigate])

  const openScenePacks = useCallback(() => setPackDialogOpen(true), [])
  const openPalette = useCallback(() => setPaletteOpen(true), [])

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

  // ── Scene management handlers ──
  // A pending placeholder edit of a scene being deleted is dropped, not saved
  const handleDeleteScene = useCallback(
    async (sceneId: number, deleteFiles: boolean) => {
      pendingSaves.discard(`scene:${sceneId}`)
      await deleteProjectScene({ data: { id: sceneId, deleteFiles } })
      router.invalidate()
    },
    [router, pendingSaves],
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
        const copy = await duplicateProjectScene({ data: sceneId })
        justAddedSceneRef.current = copy.id
        await router.invalidate()
        navigate({ search: (prev) => ({ ...prev, scene: copy.id }) })
        toast.success(t('scene.sceneDuplicated'))
      } catch {
        toast.error(t('scene.duplicateSceneFailed'))
      }
    },
    [router, t, navigate],
  )

  const handlePlaceholdersChange = useCallback(() => {
    // Reload workspace data to reflect saved placeholders
    router.invalidate()
    loadCharacterOverrides()
  }, [router, loadCharacterOverrides])

  const handleBulkDeleteScenes = useCallback(
    async (ids: Array<number>, deleteFiles: boolean) => {
      for (const id of ids) pendingSaves.discard(`scene:${id}`)
      try {
        await bulkDeleteProjectScenes({ data: { ids, deleteFiles } })
      } catch (err) {
        toast.error(t('scene.bulkDeleteFailed'))
        throw err
      }
      toast.success(t('scene.bulkDeleteSuccess', { count: ids.length }))
      handlePlaceholdersChange()
    },
    [t, handlePlaceholdersChange, pendingSaves],
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
  // Reserve counts persist per project
  // The persist effect of the commit that hydrates still sees stale state
  const skipReservePersist = useRef(true)
  useEffect(() => {
    skipReservePersist.current = true
    const prefs = parseReservePrefs(readStorage(reserveKey(projectId)))
    setSceneCounts(prefs.counts)
    setCountPerScene(prefs.defaultCount)
  }, [projectId])
  useEffect(() => {
    if (skipReservePersist.current) {
      skipReservePersist.current = false
      return
    }
    // Only this project's scenes: stale ids (deleted scenes) are dropped
    const sceneIdSet = new Set(allScenes.map((s) => s.id))
    writeStorage(
      reserveKey(projectId),
      serializeReservePrefs({
        counts: Object.fromEntries(
          Object.entries(sceneCounts).filter(([id]) =>
            sceneIdSet.has(Number(id)),
          ),
        ),
        defaultCount: countPerScene,
      }),
    )
  }, [projectId, sceneCounts, countPerScene])
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

  // ── Scene rail / board: sorted groups, search + filter chips ──
  const [sceneFilter, setSceneFilter] = useState<SceneFilter>('all')
  const [collapsedPacks, toggleCollapsedPack] = useCollapsedPacks(projectId)
  const railWidth = useRailCompact(projectId)

  const sortedPacks = useMemo<Array<RailPack>>(
    () =>
      scenePacks.map((pack) => ({
        id: pack.id,
        name: pack.name,
        scenes: sortScenes(
          pack.scenes.map((s) => toSceneCardScene(s, pack.name, pack.id)),
          sceneSortBy,
        ),
      })),
    [scenePacks, sceneSortBy],
  )
  const railOrderScenes = useMemo(
    () => sortedPacks.flatMap((p) => p.scenes),
    [sortedPacks],
  )

  // Empty packs are groups of their own, unless a search / filter is active
  const filtersActive = sceneFilter !== 'all' || sceneSearch.trim() !== ''
  const visiblePacks = useMemo<Array<RailPack>>(
    () =>
      sortedPacks
        .map((pack) => ({
          ...pack,
          scenes: filterScenes(
            pack.scenes,
            { query: sceneSearch, filter: sceneFilter },
            sceneCounts,
            countPerScene,
          ),
        }))
        .filter((pack) => pack.scenes.length > 0 || !filtersActive),
    [
      sortedPacks,
      sceneSearch,
      sceneFilter,
      sceneCounts,
      countPerScene,
      filtersActive,
    ],
  )

  const filterCounts = useMemo(
    () =>
      countByFilter(railOrderScenes, sceneSearch, sceneCounts, countPerScene),
    [railOrderScenes, sceneSearch, sceneCounts, countPerScene],
  )

  const clearSceneFilters = useCallback(() => {
    setSceneFilter('all')
    setSceneSearch('')
  }, [setSceneSearch])

  // ── Add scene (＋ popover): the new scene is selected and revealed ──
  const handleAddScene = useCallback(
    async (input: AddSceneInput) => {
      // Copying values must see edits that are still waiting for their save
      if (input.copyFromSceneId != null) await pendingSaves.flushAll()
      const scene = await addProjectScene({
        data: {
          projectId,
          name: input.name,
          packId: input.packId ?? undefined,
          copyFromSceneId: input.copyFromSceneId ?? undefined,
        },
      })
      // Load the new scene first: an unknown `?scene=` would be reset
      await router.invalidate()
      if (input.packId != null && collapsedPacks.has(input.packId)) {
        toggleCollapsedPack(input.packId)
      }
      if (sceneFilter !== 'all' || sceneSearch) clearSceneFilters()
      justAddedSceneRef.current = scene.id
      navigate({ search: (prev) => ({ ...prev, scene: scene.id }) })
      if (!boardMode) setMobilePane('result')
    },
    [
      projectId,
      router,
      collapsedPacks,
      toggleCollapsedPack,
      sceneFilter,
      sceneSearch,
      clearSceneFilters,
      navigate,
      boardMode,
      pendingSaves,
    ],
  )

  const addPacks = useMemo(
    () =>
      scenePacks.map((pack) => ({
        id: pack.id,
        name: pack.name,
        sceneNames: pack.scenes.map((sc) => sc.name),
      })),
    [scenePacks],
  )
  const addSceneConfig = useMemo<AddSceneConfig>(
    () => ({
      packs: addPacks,
      selectedScene: selectedSceneEntry
        ? {
            id: selectedSceneEntry.id,
            name: selectedSceneEntry.name,
            packId: selectedSceneEntry.packId,
          }
        : null,
      onAdd: handleAddScene,
    }),
    [addPacks, selectedSceneEntry, handleAddScene],
  )
  // Mobile sheet: the new scene closes it
  const sheetAddSceneConfig = useMemo<AddSceneConfig>(
    () => ({
      ...addSceneConfig,
      onAdd: async (input) => {
        await handleAddScene(input)
        setScenesSheetOpen(false)
      },
    }),
    [addSceneConfig, handleAddScene],
  )

  // ── Scene selection (rail + selection grid / board share it) ──
  const [selectMode, setSelectMode] = useState(false)
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  )
  const [convertIds, setConvertIds] = useState<Array<number> | null>(null)

  // Scenes in collapsed groups are hidden: select-all / bulk actions skip them
  const shownCollapsed = effectiveCollapsed(collapsedPacks, sceneSearch)
  const visibleSceneIds = useMemo(
    () =>
      visiblePacks
        .filter((pack) => !shownCollapsed.has(pack.id))
        .flatMap((pack) => pack.scenes.map((sc) => sc.id)),
    [visiblePacks, shownCollapsed],
  )

  // Selection belongs to one project
  useEffect(() => {
    setSelectMode(false)
    setCheckedIds(new Set())
  }, [projectId])
  const checkedVisibleIds = useMemo(
    () => visibleChecked(checkedIds, visibleSceneIds),
    [checkedIds, visibleSceneIds],
  )

  const enterSelectMode = useCallback(() => setSelectMode(true), [])
  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setCheckedIds(new Set())
  }, [])
  const handleCheckedChange = useCallback((id: number, checked: boolean) => {
    setCheckedIds((prev) => setChecked(prev, id, checked))
  }, [])
  const toggleAllChecked = useCallback(() => {
    setCheckedIds(
      selectAllState(checkedVisibleIds.length, visibleSceneIds.length) === 'all'
        ? new Set()
        : new Set(visibleSceneIds),
    )
  }, [checkedVisibleIds.length, visibleSceneIds])

  const checkedImageCount = useMemo(() => {
    const checked = new Set(checkedVisibleIds)
    return allScenes.reduce(
      (sum, s) => (checked.has(s.id) ? sum + s.recentImageCount : sum),
      0,
    )
  }, [allScenes, checkedVisibleIds])

  const handleBulkDelete = useCallback(
    async (deleteFiles: boolean) => {
      try {
        await handleBulkDeleteScenes(checkedVisibleIds, deleteFiles)
      } catch {
        // handleBulkDeleteScenes reports the failure; stay in select mode to retry
        return
      }
      // A deleted selection falls back to the first scene (effect below)
      exitSelectMode()
    },
    [handleBulkDeleteScenes, checkedVisibleIds, exitSelectMode],
  )

  // ── Project scene pack management ──
  const packInfos = useMemo<Array<PackInfo>>(
    () =>
      scenePacks.map((pack) => ({
        id: pack.id,
        name: pack.name,
        sceneIds: pack.scenes.map((s) => s.id),
        sceneNames: pack.scenes.map((s) => s.name),
        imageCount: pack.scenes.reduce((n, s) => n + s.recentImageCount, 0),
      })),
    [scenePacks],
  )

  const handleCreatePack = useCallback(
    async (name: string) => {
      const pack = await createProjectScenePack({ data: { projectId, name } })
      await router.invalidate()
      return { id: pack.id }
    },
    [projectId, router],
  )
  const handleRenamePack = useCallback(
    async (id: number, name: string) => {
      await renameProjectScenePack({ data: { projectId, id, name } })
      await router.invalidate()
    },
    [projectId, router],
  )
  const handleMovePack = useCallback(
    async (id: number, direction: 'up' | 'down') => {
      try {
        await reorderProjectScenePack({ data: { projectId, id, direction } })
        await router.invalidate()
      } catch {
        toast.error(t('projectPacks.reorderFailed'))
      }
    },
    [projectId, router, t],
  )
  const handleSavePackAsTemplate = useCallback(
    (id: number) => {
      const pack = scenePacks.find((p) => p.id === id)
      if (pack) setConvertIds(pack.scenes.map((s) => s.id))
    },
    [scenePacks],
  )
  const handleDeletePack = useCallback(
    async (id: number, deleteFiles: boolean) => {
      const pack = scenePacks.find((p) => p.id === id)
      for (const s of pack?.scenes ?? []) pendingSaves.discard(`scene:${s.id}`)
      await removeProjectScenePack({ data: { id, projectId, deleteFiles } })
      toast.success(t('projectPacks.deleted'))
      await router.invalidate()
    },
    [scenePacks, pendingSaves, projectId, router, t],
  )
  const handleMoveScene = useCallback(
    async (id: number, direction: 'up' | 'down') => {
      try {
        await moveProjectScene({ data: { projectId, id, direction } })
        await router.invalidate()
      } catch {
        toast.error(t('projectPacks.reorderFailed'))
      }
    },
    [projectId, router, t],
  )
  const handleMoveScenes = useCallback(
    async (ids: Array<number>, packId: number) => {
      // Appended in rail order
      const order = new Map(allSceneIds.map((sid, i) => [sid, i]))
      const sceneIds = [...ids].sort(
        (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
      )
      try {
        const result = await moveProjectScenes({
          data: { projectId, sceneIds, targetPackId: packId },
        })
        await router.invalidate()
        if (collapsedPacks.has(packId)) toggleCollapsedPack(packId)
        if (result.moved > 0) {
          toast.success(
            result.renamed > 0
              ? t('projectPacks.movedRenamed', {
                  count: result.moved,
                  renamed: result.renamed,
                })
              : t('projectPacks.moved', { count: result.moved }),
          )
        }
      } catch {
        toast.error(t('projectPacks.moveFailed'))
      }
    },
    [projectId, router, allSceneIds, collapsedPacks, toggleCollapsedPack, t],
  )

  const renderSelectionHeader = useCallback(
    (end?: ReactNode) => (
      <SceneSelectionHeader
        count={checkedVisibleIds.length}
        total={visibleSceneIds.length}
        onExit={exitSelectMode}
        onToggleAll={toggleAllChecked}
        onApplyCount={(n) => {
          for (const id of checkedVisibleIds) handleSceneCountChange(id, n)
        }}
        onResetCount={() => {
          for (const id of checkedVisibleIds) handleSceneCountChange(id, null)
        }}
        onSaveTemplate={() => setConvertIds(checkedVisibleIds)}
        onMoveToPack={(packId) =>
          void handleMoveScenes(checkedVisibleIds, packId)
        }
        onDelete={handleBulkDelete}
        deleteImageCount={checkedImageCount}
        renderExport={(trigger) => (
          <DownloadDialog
            trigger={trigger}
            projectId={projectId}
            projectName={data.project.name}
            projectSceneIds={checkedVisibleIds}
          />
        )}
        end={end}
      />
    ),
    [
      checkedVisibleIds,
      visibleSceneIds.length,
      exitSelectMode,
      toggleAllChecked,
      handleSceneCountChange,
      handleBulkDelete,
      handleMoveScenes,
      projectId,
      data.project.name,
    ],
  )

  // No valid selection in scene mode (first visit, deleted scene, `?scene=`
  // of another project) → first scene in rail order, replacing the entry.
  // Board mode only drops an invalid `?scene=`.
  const firstSceneId =
    visiblePacks.at(0)?.scenes.at(0)?.id ?? railOrderScenes.at(0)?.id ?? null

  // ── Scene palette (Ctrl/Cmd+K) ──
  useScenePaletteShortcut(
    () => setPaletteOpen(true),
    railOrderScenes.length > 0,
  )

  // Mobile sheet: picking a scene (not ↑/↓) closes the sheet
  const handleSheetSelect = useCallback(
    (id: number, opts?: { replace?: boolean }) => {
      handleSceneSelect(id, opts)
      if (!opts?.replace) setScenesSheetOpen(false)
    },
    [handleSceneSelect],
  )
  const handleSheetOpenBoard = useCallback(() => {
    setScenesSheetOpen(false)
    openBoard()
  }, [openBoard])
  const handleSheetOpenScenePacks = useCallback(() => {
    setScenesSheetOpen(false)
    setPackDialogOpen(true)
  }, [])
  useEffect(() => {
    if (selectedSceneEntry) {
      if (selectedSceneEntry.id === justAddedSceneRef.current) {
        justAddedSceneRef.current = null
      }
      return
    }
    // Just added/duplicated: the loader data may lag behind the URL
    if (
      requestedSceneId != null &&
      requestedSceneId === justAddedSceneRef.current
    )
      return
    const target = boardMode ? null : firstSceneId
    if (target == null && requestedSceneId == null) return
    navigate({
      search: (prev) => ({ ...prev, scene: target ?? undefined }),
      replace: true,
    })
  }, [selectedSceneEntry, boardMode, firstSceneId, requestedSceneId, navigate])

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

  // Latest committed reserve state (read after the blur below re-rendered)
  const reserveRef = useRef({ allSceneIds, sceneCounts, countPerScene })
  reserveRef.current = { allSceneIds, sceneCounts, countPerScene }

  async function handleGenerate() {
    // Generate uses what is on screen: blur commits a typed reserve stepper
    // value, then every pending debounced save is flushed.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.all([flushProjectSave(), pendingSaves.flushAll()])

    const reserve = reserveRef.current
    const getSceneCount = (id: number) =>
      reserve.sceneCounts[id] ?? reserve.countPerScene
    const sceneIds = reserve.allSceneIds.filter((id) => getSceneCount(id) > 0)
    if (reserve.allSceneIds.length === 0) {
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

    const batchTotal = sceneIds.reduce((sum, id) => sum + getSceneCount(id), 0)
    setGenerating(true)
    try {
      await createGenerationJob({
        data: {
          projectId,
          projectSceneIds: sceneIds,
          countPerScene: reserve.countPerScene,
          sceneCounts:
            Object.keys(reserve.sceneCounts).length > 0
              ? reserve.sceneCounts
              : undefined,
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

  // Button and Ctrl/Cmd+Enter share one 1s cooldown (same as Quick Generate)
  const { cooldown, trigger: handleGenerateClick } =
    useGenerateCooldown(handleGenerate)

  const canGenerate = summary.images > 0
  useGenerateShortcut(handleGenerateClick, canGenerate && !cooldown)

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

  const openImageDetail = useCallback(
    (id: number) => {
      navigate({ search: (prev) => ({ ...prev, imageDetail: id }) })
    },
    [navigate],
  )

  // ── Center: [SceneRail | SceneView] (scene mode) or SceneBoard ──
  const railProps = {
    packs: visiblePacks,
    totalCount: railOrderScenes.length,
    filterCounts,
    filter: sceneFilter,
    onFilterChange: setSceneFilter,
    searchQuery: sceneSearch,
    onSearchQueryChange: setSceneSearch,
    onClearFilters: clearSceneFilters,
    collapsedPacks,
    onToggleCollapsed: toggleCollapsedPack,
    sortBy: sceneSortBy,
    onSortByChange: setSceneSortBy,
    sceneCounts,
    defaultCount: countPerScene,
    onDefaultCountChange: setCountPerScene,
    onSceneCountChange: handleSceneCountChange,
    selectedSceneId,
    addScene: addSceneConfig,
    onDeleteScene: handleDeleteScene,
    onRenameScene: handleRenameScene,
    onDuplicateScene: handleDuplicateScene,
    selectMode,
    checkedIds,
    onCheckedChange: handleCheckedChange,
    onEnterSelectMode: enterSelectMode,
    onExitSelectMode: exitSelectMode,
    selectionHeader: renderSelectionHeader(),
    checkedCount: checkedVisibleIds.length,
  }

  let center: ReactNode
  if (railOrderScenes.length === 0 && scenePacks.length === 0) {
    center = (
      <SceneEmptyState
        addScene={addSceneConfig}
        onOpenScenePacks={openScenePacks}
      />
    )
  } else if (boardMode) {
    center = (
      <SceneBoard
        projectId={projectId}
        packs={visiblePacks}
        totalCount={railOrderScenes.length}
        filterCounts={filterCounts}
        filter={sceneFilter}
        onFilterChange={setSceneFilter}
        searchQuery={sceneSearch}
        onSearchQueryChange={setSceneSearch}
        onClearFilters={clearSceneFilters}
        collapsedPacks={collapsedPacks}
        onToggleCollapsed={toggleCollapsedPack}
        sceneCounts={sceneCounts}
        defaultCount={countPerScene}
        onSceneCountChange={handleSceneCountChange}
        selectedSceneId={selectedSceneId}
        onSelect={handleSceneSelect}
        addScene={addSceneConfig}
        onClose={closeBoard}
        selectMode={selectMode}
        checkedIds={checkedIds}
        onCheckedChange={handleCheckedChange}
        onEnterSelectMode={enterSelectMode}
        renderSelectionHeader={renderSelectionHeader}
      />
    )
  } else {
    center = (
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        {/* Mobile: the rail lives in a bottom sheet */}
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScenesSheetOpen(true)}
            data-onboarding="scene-rail"
            aria-label={t('sceneRail.openScenes')}
            className="min-w-0 flex-1 justify-start"
          >
            <span className="text-muted-foreground">
              {t('sceneRail.title')}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 truncate font-medium">
              {selectedScene?.name ?? t('sceneRail.noSelection')}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={openBoard}
            title={t('sceneRail.openBoard')}
            aria-label={t('sceneRail.openBoard')}
          >
            <HugeiconsIcon icon={DashboardSquare01Icon} className="size-4" />
          </Button>
        </div>
        <SceneRail
          {...railProps}
          onSelect={handleSceneSelect}
          onOpenBoard={openBoard}
          onOpenScenePacks={openScenePacks}
          onOpenPalette={openPalette}
          compact={railWidth.compact}
          onToggleCompact={railWidth.toggle}
          className="hidden md:flex"
        />
        <div className="min-h-0 min-w-0 flex-1">
          {selectMode ? (
            <SceneBoard
              projectId={projectId}
              packs={visiblePacks}
              totalCount={railOrderScenes.length}
              filterCounts={filterCounts}
              filter={sceneFilter}
              onFilterChange={setSceneFilter}
              searchQuery={sceneSearch}
              onSearchQueryChange={setSceneSearch}
              onClearFilters={clearSceneFilters}
              collapsedPacks={collapsedPacks}
              onToggleCollapsed={toggleCollapsedPack}
              sceneCounts={sceneCounts}
              defaultCount={countPerScene}
              onSceneCountChange={handleSceneCountChange}
              selectedSceneId={selectedSceneId}
              onSelect={handleSceneSelect}
              addScene={addSceneConfig}
              selectMode
              railHasSelectionBar={!railWidth.compact}
              checkedIds={checkedIds}
              onCheckedChange={handleCheckedChange}
              onEnterSelectMode={enterSelectMode}
              renderSelectionHeader={renderSelectionHeader}
            />
          ) : selectedScene ? (
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
          ) : railOrderScenes.length === 0 ? (
            <SceneEmptyState
              addScene={addSceneConfig}
              onOpenScenePacks={openScenePacks}
            />
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <PendingSavesProvider value={pendingSaves}>
      <ProjectPackProvider
        packs={packInfos}
        manualOrder={sceneSortBy === 'default'}
        onCreatePack={handleCreatePack}
        onRenamePack={handleRenamePack}
        onMovePack={handleMovePack}
        onSavePackAsTemplate={handleSavePackAsTemplate}
        onDeletePack={handleDeletePack}
        onMoveScene={handleMoveScene}
        onMoveScenes={handleMoveScenes}
      >
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
                  <ScenePackDialog
                    projectId={projectId}
                    open={packDialogOpen}
                    onOpenChange={setPackDialogOpen}
                  />
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
                        <HugeiconsIcon
                          icon={Download04Icon}
                          className="size-5"
                        />
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
              id: 'prompt',
              label: t('editor.tabPrompt'),
              onboarding: 'prompt-tab',
              content: (
                <PromptPanel
                  generalPrompt={generalPrompt}
                  negativePrompt={negativePrompt}
                  onGeneralPromptChange={handleGeneralPromptChange}
                  onNegativePromptChange={handleNegativePromptChange}
                />
              ),
            },
            {
              id: 'chars',
              label: t('editor.tabCharacters'),
              badge: data.characters.length,
              content: (
                <CharactersPanel
                  projectId={projectId}
                  characters={data.characters}
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
                    sceneLabel: t(
                      summary.scenes === 1
                        ? 'workspace.sceneOne'
                        : 'workspace.sceneMany',
                    ),
                    imageLabel: t(
                      summary.images === 1
                        ? 'workspace.imageOne'
                        : 'workspace.imageMany',
                    ),
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
          center={center}
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
        <Sheet open={scenesSheetOpen} onOpenChange={setScenesSheetOpen}>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            // Pack dialogs live outside the sheet's tree: do not close on them
            onInteractOutside={(e) => {
              if (
                (e.target as HTMLElement | null)?.closest(
                  '[role="dialog"],[role="alertdialog"]',
                )
              ) {
                e.preventDefault()
              }
            }}
            className="gap-0 overflow-hidden rounded-t-xl p-0 data-[side=bottom]:h-[85dvh]"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t('sceneRail.title')}</SheetTitle>
              <SheetDescription>{t('sceneRail.openScenes')}</SheetDescription>
            </SheetHeader>
            <SceneRail
              {...railProps}
              addScene={sheetAddSceneConfig}
              variant="sheet"
              onSelect={handleSheetSelect}
              onOpenBoard={handleSheetOpenBoard}
              onOpenScenePacks={handleSheetOpenScenePacks}
              onOpenPalette={() => {
                setScenesSheetOpen(false)
                setPaletteOpen(true)
              }}
              onClose={() => setScenesSheetOpen(false)}
              className="min-h-0 flex-1"
            />
          </SheetContent>
        </Sheet>
        <ScenePalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          packs={sortedPacks}
          sceneCounts={sceneCounts}
          defaultCount={countPerScene}
          selectedSceneId={selectedSceneId}
          onSelect={(id) => {
            exitSelectMode()
            handleSceneSelect(id)
          }}
        />
        <ConvertToTemplateDialog
          open={convertIds !== null}
          onOpenChange={(open) => {
            if (!open) setConvertIds(null)
          }}
          scenes={(convertIds ?? []).map((id) => ({
            id,
            name: allScenes.find((sc) => sc.id === id)?.name ?? '',
          }))}
        />
      </ProjectPackProvider>
    </PendingSavesProvider>
  )
}
