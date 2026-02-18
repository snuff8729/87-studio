import { useState, useRef, useMemo, useCallback, memo } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Delete02Icon,
  Image02Icon,
  GridIcon,
  PencilEdit02Icon,
  Search01Icon,
  SortingDownIcon,
  Cancel01Icon,
  Tick02Icon,
  Download04Icon,
  FileExportIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { useOnboardingMaybe } from '@/lib/onboarding'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { NumberStepper } from '@/components/ui/number-stepper'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DownloadDialog } from '@/components/common/download-dialog'
import { ConvertToTemplateDialog } from './convert-to-template-dialog'
import { SceneMatrix } from './scene-matrix'
import { useTranslation } from '@/lib/i18n'
import { bulkDeleteProjectScenes } from '@/server/functions/project-scenes'
import { GridSizeToggle } from '@/components/common/grid-size-toggle'
import { useImageGridSize, type GridSize } from '@/lib/use-image-grid-size'

export type SceneSortBy = 'default' | 'name_asc' | 'name_desc' | 'images_desc' | 'images_asc' | 'created_asc' | 'created_desc'

interface CharacterOverride {
  projectSceneId: number
  characterId: number
  placeholders: string
}

interface CharacterPlaceholderKeyEntry {
  characterId: number
  characterName: string
  keys: string[]
}

interface ScenePanelProps {
  scenePacks: Array<{
    id: number
    name: string
    scenes: Array<{
      id: number
      name: string
      placeholders: string | null
      sortOrder: number | null
      recentImageCount: number
      thumbnailPath: string | null
      thumbnailImageId: number | null
    }>
  }>
  projectId: number
  projectName?: string
  generalPlaceholderKeys: string[]
  characterPlaceholderKeys: CharacterPlaceholderKeyEntry[]
  characters: Array<{
    id: number
    name: string
    charPrompt: string
    charNegative: string
  }>
  characterOverrides: Record<number, CharacterOverride[]>
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
  onAddScene: (name: string) => Promise<void>
  onDeleteScene: (sceneId: number) => Promise<void>
  onRenameScene: (id: number, name: string) => Promise<void>
  onDuplicateScene: (sceneId: number) => Promise<void>
  onPlaceholdersChange: () => void
  viewMode: 'reserve' | 'edit'
  onViewModeChange: (mode: 'reserve' | 'edit') => void
  sortBy: string
  onSortByChange: (sort: string) => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  selectedSceneId: number | null
  onSelectedSceneChange: (id: number | null) => void
  getPrompts?: () => { generalPrompt: string; negativePrompt: string }
}

export const ScenePanel = memo(function ScenePanel({
  scenePacks,
  projectId,
  projectName,
  generalPlaceholderKeys,
  characterPlaceholderKeys,
  characters,
  characterOverrides,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
  onAddScene,
  onDeleteScene,
  onRenameScene,
  onDuplicateScene,
  onPlaceholdersChange,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortByChange,
  searchQuery,
  onSearchQueryChange,
  selectedSceneId,
  onSelectedSceneChange,
  getPrompts,
}: ScenePanelProps) {
  const { t } = useTranslation()
  const [searchVisible, setSearchVisible] = useState(searchQuery.length > 0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { gridSize, setGridSize } = useImageGridSize('scene-list')

  // ── Selection mode ──
  const [selectMode, setSelectMode] = useState(false)
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<number>>(new Set())
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedSceneIds(new Set())
  }, [])

  const toggleSelectScene = useCallback((id: number) => {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const sortedScenePacks = useMemo(() => {
    if (sortBy === 'default') return scenePacks

    const sortFn = (a: (typeof scenePacks)[0]['scenes'][0], b: (typeof scenePacks)[0]['scenes'][0]) => {
      switch (sortBy) {
        case 'name_asc': return a.name.localeCompare(b.name)
        case 'name_desc': return b.name.localeCompare(a.name)
        case 'images_desc': return b.recentImageCount - a.recentImageCount
        case 'images_asc': return a.recentImageCount - b.recentImageCount
        case 'created_asc': return a.id - b.id
        case 'created_desc': return b.id - a.id
        default: return 0
      }
    }

    return scenePacks.map((pack) => ({
      ...pack,
      scenes: [...pack.scenes].sort(sortFn),
    }))
  }, [scenePacks, sortBy])

  const filteredScenePacks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return sortedScenePacks
    return sortedScenePacks
      .map((pack) => ({
        ...pack,
        scenes: pack.scenes.filter((s) => s.name.toLowerCase().includes(q)),
      }))
      .filter((pack) => pack.scenes.length > 0)
  }, [sortedScenePacks, searchQuery])

  const allScenes = filteredScenePacks.flatMap((pack) => pack.scenes)
  const allSceneIds = useMemo(() => new Set(allScenes.map((s) => s.id)), [allScenes])
  const allScenesSelected = selectedSceneIds.size > 0 && selectedSceneIds.size === allSceneIds.size && [...selectedSceneIds].every((id) => allSceneIds.has(id))

  const toggleSelectAll = useCallback(() => {
    if (allScenesSelected) {
      setSelectedSceneIds(new Set())
    } else {
      setSelectedSceneIds(new Set(allSceneIds))
    }
  }, [allScenesSelected, allSceneIds])

  const selectedScenesInfo = useMemo(
    () => allScenes.filter((s) => selectedSceneIds.has(s.id)),
    [allScenes, selectedSceneIds],
  )

  async function handleBulkDelete() {
    const ids = [...selectedSceneIds]
    try {
      await bulkDeleteProjectScenes({ data: ids })
      toast.success(t('scene.bulkDeleteSuccess', { count: ids.length }))
      exitSelectMode()
      onPlaceholdersChange()
    } catch {
      toast.error(t('scene.bulkDeleteFailed'))
    }
  }

  // ── Add scene state (shared) ──
  const [addingScene, setAddingScene] = useState(false)
  const [newSceneName, setNewSceneName] = useState('')
  const newSceneInputRef = useRef<HTMLInputElement>(null)

  async function handleAddScene() {
    const name = newSceneName.trim()
    if (!name) return
    try {
      await onAddScene(name)
      setNewSceneName('')
      setAddingScene(false)
    } catch {
      toast.error(t('scene.addSceneFailed'))
    }
  }

  const totalSceneCount = scenePacks.reduce((sum, p) => sum + p.scenes.length, 0)
  const onboarding = useOnboardingMaybe()
  const onboardingActive = onboarding?.state.active ?? false

  // ── Empty state (only when truly no scenes, not when search filters everything) ──
  // Skip empty state during onboarding so the toolbar + button is always visible
  if (totalSceneCount === 0 && !addingScene && !onboardingActive) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
        <div className="rounded-2xl bg-secondary/30 p-6 mb-4">
          <HugeiconsIcon icon={GridIcon} className="size-10 text-muted-foreground/30" />
        </div>
        <p className="text-base font-medium text-foreground/80 mb-1">{t('scene.noScenesYet')}</p>
        <p className="text-sm text-muted-foreground mb-4 max-w-52">
          {t('scene.noScenesDesc')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAddingScene(true)
            setTimeout(() => newSceneInputRef.current?.focus(), 50)
          }}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-5" />
          {t('scene.addScene')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Mode toggle tab bar ── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border shrink-0">
        {selectMode ? (
          <>
            <span className="text-sm font-medium text-foreground">
              {t('scene.selectedCount', { count: selectedSceneIds.size })}
            </span>
            <button
              onClick={toggleSelectAll}
              className="text-xs text-primary hover:underline ml-2"
            >
              {allScenesSelected ? t('scene.deselectAll') : t('scene.selectAll')}
            </button>
            <div className="flex-1" />
            <Button size="xs" variant="ghost" onClick={exitSelectMode}>
              {t('common.cancel')}
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center bg-secondary/40 rounded-lg p-0.5">
              <button
                onClick={() => onViewModeChange('reserve')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'reserve'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <HugeiconsIcon icon={GridIcon} className="size-5" />
                {t('scene.reserve')}
              </button>
              <button
                onClick={() => onViewModeChange('edit')}
                data-onboarding="scene-edit-tab"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'edit'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <HugeiconsIcon icon={PencilEdit02Icon} className="size-5" />
                {t('scene.edit')}
              </button>
            </div>

            <div className="flex-1" />

            {/* Grid size toggle (reserve view only) */}
            {viewMode === 'reserve' && (
              <GridSizeToggle value={gridSize} onChange={setGridSize} />
            )}

            {/* Sort dropdown */}
            <Select value={sortBy} onValueChange={onSortByChange}>
              <SelectTrigger size="sm" className="h-7 w-auto gap-1.5 text-xs text-muted-foreground border-none bg-transparent hover:bg-secondary/80 px-2">
                <HugeiconsIcon icon={SortingDownIcon} className="size-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">{t('scene.sortDefault')}</SelectItem>
                <SelectItem value="name_asc">{t('scene.sortNameAsc')}</SelectItem>
                <SelectItem value="name_desc">{t('scene.sortNameDesc')}</SelectItem>
                <SelectItem value="images_desc">{t('scene.sortImagesDesc')}</SelectItem>
                <SelectItem value="images_asc">{t('scene.sortImagesAsc')}</SelectItem>
                <SelectItem value="created_asc">{t('scene.sortCreatedAsc')}</SelectItem>
                <SelectItem value="created_desc">{t('scene.sortCreatedDesc')}</SelectItem>
              </SelectContent>
            </Select>

            {/* Search toggle */}
            <button
              onClick={() => {
                const next = !searchVisible
                setSearchVisible(next)
                if (!next) onSearchQueryChange('')
                else setTimeout(() => searchInputRef.current?.focus(), 50)
              }}
              className={`rounded-md p-1.5 transition-colors ${searchVisible ? 'text-primary bg-secondary/80' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'}`}
              title={t('scene.searchScenes')}
            >
              <HugeiconsIcon icon={Search01Icon} className="size-5" />
            </button>

            {/* Select mode toggle (only in reserve view) */}
            {viewMode === 'reserve' && totalSceneCount > 0 && (
              <button
                onClick={() => setSelectMode(true)}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                title={t('scene.selectMode')}
              >
                <HugeiconsIcon icon={Tick02Icon} className="size-5" />
              </button>
            )}

            {/* Add scene button */}
            <button
              onClick={() => {
                setAddingScene(true)
                setTimeout(() => newSceneInputRef.current?.focus(), 50)
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              title="Add Scene"
              data-onboarding="add-scene-btn"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-5" />
            </button>
          </>
        )}
      </div>

      {/* ── Search bar ── */}
      {searchVisible && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
          <HugeiconsIcon icon={Search01Icon} className="size-4 text-muted-foreground shrink-0" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setSearchVisible(false); onSearchQueryChange('') }
            }}
            placeholder={t('scene.searchPlaceholder')}
            className="h-7 text-sm border-none bg-transparent shadow-none focus-visible:ring-0 px-0"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => onSearchQueryChange('')}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>
          )}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 min-h-0">
        {allScenes.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
            <HugeiconsIcon icon={Search01Icon} className="size-8 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">
              {t('scene.noSearchResults', { query: searchQuery })}
            </p>
          </div>
        ) : viewMode === 'reserve' ? (
          <ReserveGrid
            scenes={allScenes}
            projectId={projectId}
            sceneCounts={sceneCounts}
            defaultCount={defaultCount}
            onSceneCountChange={onSceneCountChange}
            onDeleteScene={onDeleteScene}
            onDuplicateScene={onDuplicateScene}
            addingScene={addingScene}
            newSceneName={newSceneName}
            newSceneInputRef={newSceneInputRef}
            onNewSceneNameChange={setNewSceneName}
            onAddScene={handleAddScene}
            onCancelAdd={() => { setAddingScene(false); setNewSceneName('') }}
            selectMode={selectMode}
            selectedSceneIds={selectedSceneIds}
            onToggleSelect={toggleSelectScene}
            gridSize={gridSize}
          />
        ) : (
          <SceneMatrix
            scenePacks={filteredScenePacks}
            projectId={projectId}
            generalPlaceholderKeys={generalPlaceholderKeys}
            characterPlaceholderKeys={characterPlaceholderKeys}
            characters={characters}
            characterOverrides={characterOverrides}
            selectedScene={selectedSceneId}
            onSelectedSceneChange={onSelectedSceneChange}
            onAddScene={onAddScene}
            onDeleteScene={onDeleteScene}
            onRenameScene={onRenameScene}
            onDuplicateScene={onDuplicateScene}
            onPlaceholdersChange={onPlaceholdersChange}
            getPrompts={getPrompts}
          />
        )}
      </div>

      {/* ── Selection action bar ── */}
      {selectMode && selectedSceneIds.size > 0 && (
        <div className="fixed bottom-16 lg:bottom-12 left-1/2 -translate-x-1/2 z-40 bg-card border border-border rounded-xl px-3 py-2 flex items-center justify-center gap-2 lg:gap-3 flex-wrap shadow-lg max-w-[calc(100vw-1rem)]">
          <span className="text-sm font-medium">{t('scene.selectedCount', { count: selectedSceneIds.size })}</span>
          <DownloadDialog
            trigger={
              <Button size="sm" variant="outline">
                <HugeiconsIcon icon={Download04Icon} className="size-4" />
                {t('export.export')}
              </Button>
            }
            projectId={projectId}
            projectName={projectName}
            projectSceneIds={[...selectedSceneIds]}
          />
          <Button size="sm" variant="outline" onClick={() => setConvertDialogOpen(true)}>
            <HugeiconsIcon icon={FileExportIcon} className="size-4" />
            {t('scene.convertToTemplate')}
          </Button>
          <ConfirmDialog
            trigger={<Button size="sm" variant="destructive">{t('common.delete')}</Button>}
            title={t('scene.bulkDelete')}
            description={t('scene.bulkDeleteDesc', { count: selectedSceneIds.size })}
            variant="destructive"
            onConfirm={handleBulkDelete}
          />
          <Button size="sm" variant="ghost" onClick={exitSelectMode}>{t('common.cancel')}</Button>
        </div>
      )}

      {/* ── Convert to template dialog ── */}
      <ConvertToTemplateDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        scenes={selectedScenesInfo.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  )
})

// ── Reserve Grid ──

interface ReserveGridProps {
  scenes: Array<{
    id: number
    name: string
    placeholders: string | null
    sortOrder: number | null
    recentImageCount: number
    thumbnailPath: string | null
    thumbnailImageId: number | null
  }>
  projectId: number
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
  onDeleteScene: (sceneId: number) => Promise<void>
  onDuplicateScene: (sceneId: number) => Promise<void>
  addingScene: boolean
  newSceneName: string
  newSceneInputRef: React.RefObject<HTMLInputElement | null>
  onNewSceneNameChange: (name: string) => void
  onAddScene: () => void
  onCancelAdd: () => void
  selectMode: boolean
  selectedSceneIds: Set<number>
  onToggleSelect: (id: number) => void
  gridSize: GridSize
}

const reserveGridSizeMap: Record<GridSize, string> = {
  sm: 'grid-cols-3 md:grid-cols-4',
  md: 'grid-cols-2 md:grid-cols-3',
  lg: 'grid-cols-1 md:grid-cols-2',
}

function ReserveGrid({
  scenes,
  projectId,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
  onDeleteScene,
  onDuplicateScene,
  addingScene,
  newSceneName,
  newSceneInputRef,
  onNewSceneNameChange,
  onAddScene,
  onCancelAdd,
  selectMode,
  selectedSceneIds,
  onToggleSelect,
  gridSize,
}: ReserveGridProps) {
  const { t } = useTranslation()
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className={`grid ${reserveGridSizeMap[gridSize]} gap-3`}>
        {scenes.map((scene) => {
          const count = sceneCounts[scene.id] ?? null
          const effectiveCount = count ?? defaultCount
          const isSelected = selectMode && selectedSceneIds.has(scene.id)

          return (
            <div
              key={scene.id}
              data-onboarding="scene-item"
              className={`rounded-lg border transition-all group/card ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/50 bg-primary/10'
                  : effectiveCount > 0
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border bg-secondary/10'
              }`}
              onClick={selectMode ? () => onToggleSelect(scene.id) : undefined}
              role={selectMode ? 'button' : undefined}
            >
              {/* Thumbnail */}
              <div className="relative">
                {scene.thumbnailPath ? (
                  <div className="aspect-[3/4] rounded-t-lg overflow-hidden">
                    <img
                      src={`/api/thumbnails/${scene.thumbnailPath.replace('data/thumbnails/', '')}`}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="aspect-[3/4] rounded-t-lg bg-secondary/40 flex items-center justify-center">
                    <HugeiconsIcon icon={Image02Icon} className="size-6 text-muted-foreground/15" />
                  </div>
                )}

                {/* Select checkbox */}
                {selectMode && (
                  <div className="absolute top-1.5 left-1.5">
                    <Checkbox
                      checked={isSelected}
                      tabIndex={-1}
                      className="pointer-events-none bg-black/40 border-white/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                  </div>
                )}

                {/* Image count badge */}
                {scene.recentImageCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-xs text-white/80 tabular-nums">
                    <HugeiconsIcon icon={Image02Icon} className="size-2.5" />
                    {scene.recentImageCount}
                  </span>
                )}

              </div>

              {/* Info + count */}
              <div className="px-2.5 pt-2 pb-2.5">
                <div className="flex items-center gap-1">
                  <div className="text-sm font-medium truncate flex-1 text-foreground/90">
                    {scene.name}
                  </div>
                  {!selectMode && (
                    <Link
                      to="/workspace/$projectId/scenes/$sceneId"
                      params={{ projectId: String(projectId), sceneId: String(scene.id) }}
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-secondary/80 transition-colors"
                      title="View gallery"
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                    </Link>
                  )}
                </div>

                {/* Count stepper + delete (hidden in select mode) */}
                {!selectMode && (
                  <div className="flex items-center gap-1 mt-2">
                    <NumberStepper
                      value={count}
                      onChange={(v) => onSceneCountChange(scene.id, v)}
                      min={0}
                      max={100}
                      placeholder={String(defaultCount)}
                    />
                    {count != null && (
                      <button
                        onClick={() => onSceneCountChange(scene.id, null)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        title="Reset to default"
                      >
                        &times;
                      </button>
                    )}
                    <div className="flex-1" />
                    <button
                      onClick={() => onDuplicateScene(scene.id)}
                      className="rounded-md p-1 text-muted-foreground/40 hover:text-foreground hover:bg-secondary/80 transition-all"
                      title={t('scene.duplicateScene')}
                    >
                      <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
                    </button>
                    <ConfirmDialog
                      trigger={
                        <button className="rounded-md p-1 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all">
                          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                        </button>
                      }
                      title={t('scene.deleteScene')}
                      description={t('scene.deleteSceneDesc', { name: scene.name })}
                      onConfirm={() => onDeleteScene(scene.id)}
                    />
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Add scene inline form / button */}
        {addingScene ? (
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 flex flex-col justify-center" data-onboarding="add-scene-form">
            <Input
              ref={newSceneInputRef}
              value={newSceneName}
              onChange={(e) => onNewSceneNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAddScene()
                if (e.key === 'Escape') onCancelAdd()
              }}
              placeholder={t('scene.sceneName')}
              className="h-7 text-sm mb-2"
              autoFocus
            />
            <div className="flex gap-1">
              <Button size="xs" onClick={onAddScene} disabled={!newSceneName.trim()} className="flex-1">
                {t('common.add')}
              </Button>
              <Button size="xs" variant="ghost" onClick={onCancelAdd} className="flex-1">
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
