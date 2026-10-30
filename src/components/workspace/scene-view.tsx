import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useVirtualizer } from '@tanstack/react-virtual'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  ChampionIcon,
  Exchange01Icon,
  FileExportIcon,
  Film02Icon,
  FolderAddIcon,
  GridIcon,
  Image02Icon,
  ImageRemove01Icon,
  PencilEdit02Icon,
  Search01Icon,
  Tick01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { PlaceholderEditor } from './placeholder-editor'
import { ScenePositionsSection } from './scene-positions-section'
import { SceneDetail } from './scene-detail'
import { TournamentDialog } from './tournament-dialog'
import { ConvertToTemplateDialog } from './convert-to-template-dialog'
import { SceneCard, SceneMenuButton, SceneMenuItems } from './scene-card'
import {
  PackMenuItems,
  PackRenameInput,
  SceneMoveMenuItems,
  usePackManage,
} from './project-pack-provider'
import { effectiveCollapsed } from './scene-rail'
import { AddScenePopover } from './add-scene-popover'
import { SceneSearchFilter } from './scene-search-filter'
import {
  SCENE_CARD_MIN_WIDTH,
  SCENE_CARD_SIZES,
  SCENE_CARD_SIZE_DEFAULT,
  parseSceneCardSize,
  sceneBoardSizeKey,
} from './scene-board-prefs'
import type { SceneCardSize } from './scene-board-prefs'
import type { ReactNode } from 'react'
import type { AddSceneConfig } from './add-scene-popover'
import type { SceneFilter, SceneFilterCounts } from './scene-filters'
import type { RailPack } from './scene-rail'
import type { SceneImageSortBy } from './scene-detail'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  readStorage,
  writeStorage,
} from '@/components/editor-shell/use-editor-persist'
import { useTranslation } from '@/lib/i18n'
import { useOnboardingMaybe } from '@/lib/onboarding'
import { cn } from '@/lib/utils'
import {
  bulkUpdatePlaceholders,
  upsertCharacterOverride,
} from '@/server/functions/project-scenes'

// ── Shared types (same shapes the workspace route already has) ──

export interface SceneViewCharacter {
  id: number
  name: string
  charPrompt: string
  charNegative: string
  position: string | null
}

/** One row of the route's `characterOverrides[sceneId]` array. */
export interface SceneViewCharacterOverride {
  projectSceneId: number
  characterId: number
  placeholders: string
  position: string | null
}

export interface CharacterPlaceholderKeyEntry {
  characterId: number
  characterName: string
  keys: Array<string>
}

/** The selected scene: a `scenePacks[].scenes[]` item + its pack name. */
export interface SceneViewScene {
  id: number
  name: string
  packName: string
  /** Raw JSON string from `project_scenes.placeholders`. */
  placeholders: string | null
  thumbnailImageId: number | null
  thumbnailPath: string | null
  /** `recentImageCount` (live-updated during generation). */
  imageCount: number
}

export interface SceneViewProps {
  projectId: number
  scene: SceneViewScene
  characters: Array<SceneViewCharacter>
  /** Overrides of the selected scene only (`characterOverrides[scene.id] ?? []`). */
  characterOverrides: Array<SceneViewCharacterOverride>
  generalPlaceholderKeys: Array<string>
  characterPlaceholderKeys: Array<CharacterPlaceholderKeyEntry>
  getPrompts?: () => { generalPrompt: string; negativePrompt: string }
  /** Called after a placeholder/override save (route: invalidate + reload overrides). */
  onPlaceholdersChange: () => void
  onRenameScene: (id: number, name: string) => Promise<void>
  onThumbnailChange: (
    imageId: number | null,
    thumbnailPath?: string | null,
  ) => void
  projectThumbnailImageId?: number | null
  onProjectThumbnailChange?: (imageId: number | null) => void
  /** Bump to silently reload the images (e.g. on each generation poll). */
  refreshKey?: number
  imageSortBy?: SceneImageSortBy
  onImageSortByChange?: (sort: SceneImageSortBy) => void
  /** Canvas of the position section; false hides it (V3 models) */
  positions?: { aspect: number } | false
}

function thumbUrl(path: string) {
  return `/api/thumbnails/${path.replace('data/thumbnails/', '')}`
}

// ── Placeholders collapse state (per project, SSR-safe) ──

function usePlaceholdersOpen(projectId: number) {
  const storageKey = `87studio-scene-placeholders-open:${projectId}`
  const [open, setOpenState] = useState(true)

  useEffect(() => {
    try {
      setOpenState(localStorage.getItem(storageKey) !== '0')
    } catch {
      setOpenState(true)
    }
  }, [storageKey])

  const setOpen = useCallback(
    (value: boolean) => {
      setOpenState(value)
      try {
        localStorage.setItem(storageKey, value ? '1' : '0')
      } catch {
        // ignore (private mode / blocked storage)
      }
    },
    [storageKey],
  )

  return [open, setOpen] as const
}

// ── SceneView ──

export function SceneView({
  projectId,
  scene,
  characters,
  characterOverrides,
  generalPlaceholderKeys,
  characterPlaceholderKeys,
  getPrompts,
  onPlaceholdersChange,
  onRenameScene,
  onThumbnailChange,
  projectThumbnailImageId,
  onProjectThumbnailChange,
  refreshKey,
  imageSortBy,
  onImageSortByChange,
  positions,
}: SceneViewProps) {
  const { t } = useTranslation()
  const onboarding = useOnboardingMaybe()
  const sceneId = scene.id

  // ── Placeholders section ──
  const [placeholdersOpen, setPlaceholdersOpen] = usePlaceholdersOpen(projectId)
  // Onboarding step 7 targets the placeholder editor — never hide it then
  // (the collapse toggle is disabled meanwhile).
  const forcedOpen = !!onboarding?.state.active
  const showPlaceholders = placeholdersOpen || forcedOpen

  const parsedPlaceholders = useMemo<Record<string, string>>(
    () => JSON.parse(scene.placeholders || '{}'),
    [scene.placeholders],
  )
  const parsedCharOverrides = useMemo(() => {
    const result: Record<number, Record<string, string>> = {}
    for (const o of characterOverrides) {
      result[o.characterId] = JSON.parse(o.placeholders || '{}')
    }
    return result
  }, [characterOverrides])

  const handleSaveGeneral = useCallback(
    async (mergedJson: string) => {
      await bulkUpdatePlaceholders({
        data: { updates: [{ sceneId, placeholders: mergedJson }] },
      })
    },
    [sceneId],
  )

  const handleSaveCharOverride = useCallback(
    async (charId: number, mergedJson: string) => {
      await upsertCharacterOverride({
        data: {
          projectSceneId: sceneId,
          characterId: charId,
          placeholders: mergedJson,
        },
      })
    },
    [sceneId],
  )

  const placeholderCount =
    generalPlaceholderKeys.length +
    new Set(characterPlaceholderKeys.flatMap((c) => c.keys)).size

  // ── Inline rename ──
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')

  useEffect(() => {
    setEditingName(false)
  }, [sceneId])

  async function handleRename() {
    const name = editNameValue.trim()
    if (!name) return
    if (name === scene.name) {
      setEditingName(false)
      return
    }
    try {
      await onRenameScene(sceneId, name)
      setEditingName(false)
    } catch {
      toast.error(t('scene.failedToRename'))
    }
  }

  // ── Scene actions ──
  const [selectMode, setSelectMode] = useState(false)
  const [tournamentOpen, setTournamentOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  // Local bump so SceneDetail silently reloads W/L stats after a tournament
  const [localRefresh, setLocalRefresh] = useState(0)

  // Image selection belongs to one scene
  useEffect(() => {
    setSelectMode(false)
  }, [sceneId])

  function handleCompare() {
    if (!selectMode) setSelectMode(true)
    toast.info(t('sceneView.selectToCompare'))
  }

  const canCompare = scene.imageCount >= 2

  return (
    <div className="@container relative flex h-full min-h-0 flex-col">
      {/* ── Scene header ── */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <div className="size-8 shrink-0 overflow-hidden rounded-md bg-secondary/60">
          {scene.thumbnailPath ? (
            <img
              src={thumbUrl(scene.thumbnailPath)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <HugeiconsIcon
                icon={Image02Icon}
                className="size-4 text-muted-foreground/30"
              />
            </div>
          )}
        </div>

        {editingName ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Input
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') setEditingName(false)
              }}
              className="h-7 flex-1 text-sm"
              aria-label={t('scene.sceneName')}
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRename}
              aria-label={t('common.save')}
            >
              <HugeiconsIcon icon={Tick01Icon} className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditingName(false)}
              aria-label={t('common.cancel')}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-muted-foreground">
              {scene.packName}
              <span className="tabular-nums">
                {' · '}
                {t('scene.images', { count: scene.imageCount })}
              </span>
            </div>
            <button
              onClick={() => {
                setEditNameValue(scene.name)
                setEditingName(true)
              }}
              className="group/rename flex max-w-full items-center gap-1.5 text-sm font-semibold transition-colors hover:text-primary"
              title={t('scene.clickToRename')}
            >
              <span className="truncate">{scene.name}</span>
              <HugeiconsIcon
                icon={PencilEdit02Icon}
                className="size-3.5 shrink-0 text-muted-foreground/40 group-hover/rename:text-primary"
              />
            </button>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!canCompare}
            onClick={handleCompare}
            title={t('scene.compare')}
          >
            <HugeiconsIcon icon={Exchange01Icon} className="size-4" />
            <span className="hidden @5xl:inline">{t('scene.compare')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canCompare}
            onClick={() => setTournamentOpen(true)}
            title={t('tournament.tournament')}
          >
            <HugeiconsIcon icon={ChampionIcon} className="size-4" />
            <span className="hidden @5xl:inline">
              {t('tournament.tournament')}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConvertOpen(true)}
            title={t('scene.convertToTemplate')}
          >
            <HugeiconsIcon icon={FileExportIcon} className="size-4" />
            <span className="hidden @5xl:inline">
              {t('scene.convertToTemplate')}
            </span>
          </Button>
          {scene.thumbnailImageId !== null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onThumbnailChange(null, null)}
              title={t('scene.resetThumbnail')}
            >
              <HugeiconsIcon icon={ImageRemove01Icon} className="size-4" />
              <span className="hidden @5xl:inline">
                {t('scene.resetThumbnail')}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Placeholders (collapsible, max 45% of the panel when open) ── */}
      <section
        className={cn(
          'flex shrink-0 flex-col border-b',
          showPlaceholders && 'max-h-[min(45%,30rem)]',
        )}
      >
        <button
          onClick={() => setPlaceholdersOpen(!placeholdersOpen)}
          disabled={forcedOpen}
          aria-expanded={showPlaceholders}
          title={t('sceneView.togglePlaceholders')}
          className="flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
        >
          {!forcedOpen && (
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn(
                'size-4 transition-transform',
                !showPlaceholders && '-rotate-90',
              )}
            />
          )}
          {t('sceneView.placeholders')}
          {placeholderCount > 0 && (
            <span className="tabular-nums text-muted-foreground/60">
              {placeholderCount}
            </span>
          )}
        </button>
        {showPlaceholders && (
          <ScrollFade className="min-h-0 px-3 pb-4 sm:px-4">
            <PlaceholderEditor
              key={sceneId}
              sceneId={sceneId}
              scenePlaceholders={parsedPlaceholders}
              characterOverrides={parsedCharOverrides}
              generalPlaceholderKeys={generalPlaceholderKeys}
              characterPlaceholderKeys={characterPlaceholderKeys}
              characters={characters}
              onSaveGeneral={handleSaveGeneral}
              onSaveCharOverride={handleSaveCharOverride}
              onPlaceholdersChange={onPlaceholdersChange}
              getPrompts={getPrompts}
            />
          </ScrollFade>
        )}
      </section>

      {positions && characters.length > 0 && (
        <ScenePositionsSection
          key={`positions-${sceneId}`}
          projectId={projectId}
          sceneId={sceneId}
          characters={characters}
          overrides={characterOverrides}
          aspect={positions.aspect}
          onChange={onPlaceholdersChange}
        />
      )}

      {/* ── Images (scroll container — must stay unpositioned so the bulk
          bar anchors to this panel's root) ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SceneDetail
          key={sceneId}
          sceneId={sceneId}
          characters={characters}
          generalPlaceholderKeys={generalPlaceholderKeys}
          projectId={projectId}
          thumbnailImageId={scene.thumbnailImageId}
          onThumbnailChange={onThumbnailChange}
          projectThumbnailImageId={projectThumbnailImageId}
          onProjectThumbnailChange={onProjectThumbnailChange}
          refreshKey={(refreshKey ?? 0) + localRefresh}
          hidePlaceholders
          hideSceneActions
          sceneName={scene.name}
          sortBy={imageSortBy}
          onSortByChange={onImageSortByChange}
          selectMode={selectMode}
          onSelectModeChange={setSelectMode}
        />
      </div>

      <TournamentDialog
        open={tournamentOpen}
        onOpenChange={(open) => {
          setTournamentOpen(open)
          if (!open) setLocalRefresh((k) => k + 1)
        }}
        projectSceneId={sceneId}
        sceneName={scene.name}
      />
      <ConvertToTemplateDialog
        key={sceneId}
        open={convertOpen}
        onOpenChange={setConvertOpen}
        scenes={[{ id: sceneId, name: scene.name }]}
      />
    </div>
  )
}

// ── Empty project (no scenes) ──

export function SceneEmptyState({
  addScene,
  onOpenScenePacks,
}: {
  addScene: AddSceneConfig
  onOpenScenePacks: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-2xl bg-secondary/30 p-5">
        <HugeiconsIcon
          icon={GridIcon}
          className="size-8 text-muted-foreground/40"
        />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium">{t('sceneView.emptyTitle')}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t('sceneView.emptyDesc')}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" size="sm" onClick={onOpenScenePacks}>
          <HugeiconsIcon icon={Film02Icon} className="size-4" />
          {t('templates.title')}
        </Button>
        <AddScenePopover
          config={addScene}
          onboarding
          trigger={
            <Button variant="outline" size="sm" data-onboarding="add-scene-btn">
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              {t('scene.addScene')}
            </Button>
          }
        />
      </div>
    </div>
  )
}

// ── SceneBoard (explicit board mode: `?view=board`) ──

function useSceneCardSize(
  projectId: number,
  fallback: SceneCardSize = SCENE_CARD_SIZE_DEFAULT,
): [SceneCardSize, (size: SceneCardSize) => void] {
  const key = sceneBoardSizeKey(projectId)
  const [size, setSizeState] = useState<SceneCardSize>(fallback)
  useEffect(() => {
    const stored = readStorage(key)
    setSizeState(stored ? parseSceneCardSize(stored) : fallback)
  }, [key])
  const setSize = useCallback(
    (next: SceneCardSize) => {
      setSizeState(next)
      writeStorage(key, next)
    },
    [key],
  )
  return [size, setSize]
}

export interface SceneBoardProps {
  projectId: number
  /** Sorted + filtered groups (empty groups dropped). */
  packs: Array<RailPack>
  totalCount: number
  filterCounts: SceneFilterCounts
  filter: SceneFilter
  onFilterChange: (filter: SceneFilter) => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  onClearFilters: () => void
  collapsedPacks: ReadonlySet<number>
  onToggleCollapsed: (packId: number) => void
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
  selectedSceneId: number | null
  /** Card click: select the scene and return to scene mode. */
  onSelect: (sceneId: number) => void
  addScene: AddSceneConfig
  /** Board mode: closes the board. Omitted for the selection grid. */
  onClose?: () => void
  /**
   * Selection grid next to an expanded rail (md+): the rail header already
   * holds the selection bar, so the grid keeps only its own controls.
   */
  railHasSelectionBar?: boolean
  selectMode: boolean
  checkedIds: ReadonlySet<number>
  onCheckedChange: (sceneId: number, checked: boolean) => void
  onEnterSelectMode: () => void
  /** Selection header (replaces the toolbar while selecting); `end` = card size slider. */
  renderSelectionHeader: (end: ReactNode) => ReactNode
}

export function SceneBoard({
  projectId,
  packs,
  totalCount,
  filterCounts,
  filter,
  onFilterChange,
  searchQuery,
  onSearchQueryChange,
  onClearFilters,
  collapsedPacks,
  onToggleCollapsed,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
  selectedSceneId,
  onSelect,
  addScene,
  onClose,
  railHasSelectionBar,
  selectMode,
  checkedIds,
  onCheckedChange,
  onEnterSelectMode,
  renderSelectionHeader,
}: SceneBoardProps) {
  const { t } = useTranslation()
  const { openNewPack } = usePackManage()
  // The selection grid (no close button) defaults to smaller cards
  const [size, setSize] = useSceneCardSize(
    projectId,
    onClose ? undefined : 'md',
  )
  const sizeIndex = SCENE_CARD_SIZES.indexOf(size)
  const shownCollapsed = effectiveCollapsed(collapsedPacks, searchQuery)
  const filtersActive = filter !== 'all' || searchQuery.trim() !== ''

  const sizeSlider = (
    <Slider
      className="w-20 shrink-0"
      min={0}
      max={SCENE_CARD_SIZES.length - 1}
      step={1}
      value={[sizeIndex < 0 ? SCENE_CARD_SIZES.length - 1 : sizeIndex]}
      onValueChange={([v]) => setSize(SCENE_CARD_SIZES[v])}
      aria-label={t('scene.cardSize')}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col" data-scene-board>
      {/* ── Toolbar (the selection header while selecting) ── */}
      {selectMode ? (
        railHasSelectionBar ? (
          <>
            <div className="md:hidden">{renderSelectionHeader(sizeSlider)}</div>
            <div
              data-grid-toolbar
              className="hidden shrink-0 items-center justify-end gap-2 border-b px-4 py-1.5 md:flex"
            >
              <span className="text-xs text-muted-foreground">
                {t('scene.cardSize')}
              </span>
              {sizeSlider}
            </div>
          </>
        ) : (
          renderSelectionHeader(sizeSlider)
        )
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2">
          <div className="text-sm font-semibold whitespace-nowrap">
            {t('sceneView.boardTitle')}
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {totalCount}
            </span>
          </div>
          <SceneSearchFilter
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            filter={filter}
            onFilterChange={onFilterChange}
            counts={filterCounts}
            className="w-56"
          />
          <div className="flex-1" />
          {sizeSlider}
          <Button
            variant="outline"
            size="sm"
            onClick={onEnterSelectMode}
            title={t('scene.selectMode')}
          >
            <HugeiconsIcon icon={Tick02Icon} className="size-4" />
            <span className="hidden sm:inline">{t('scene.selectMode')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openNewPack()}
            title={t('projectPacks.newPackItem')}
          >
            <HugeiconsIcon icon={FolderAddIcon} className="size-4" />
            <span className="hidden sm:inline">
              {t('projectPacks.newPackItem')}
            </span>
          </Button>
          <AddScenePopover
            config={addScene}
            align="end"
            trigger={
              <Button variant="outline" size="sm">
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
                <span className="hidden sm:inline">{t('scene.addScene')}</span>
              </Button>
            }
          />
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              title={t('sceneRail.closeBoard')}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              <span className="hidden sm:inline">
                {t('sceneRail.closeBoard')}
              </span>
            </Button>
          )}
        </div>
      )}

      {/* ── Groups ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {packs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <HugeiconsIcon
              icon={Search01Icon}
              className="size-8 text-muted-foreground/30"
            />
            <p className="text-sm text-muted-foreground">
              {t('sceneRail.noMatches')}
            </p>
            {filtersActive && (
              <Button size="sm" variant="outline" onClick={onClearFilters}>
                {t('sceneRail.clearFilters')}
              </Button>
            )}
          </div>
        ) : (
          <BoardGrid
            packs={packs}
            addScene={addScene}
            collapsed={shownCollapsed}
            onToggleCollapsed={onToggleCollapsed}
            size={size}
            sceneCounts={sceneCounts}
            defaultCount={defaultCount}
            onSceneCountChange={onSceneCountChange}
            selectedSceneId={selectedSceneId}
            onSelect={onSelect}
            selectMode={selectMode}
            checkedIds={checkedIds}
            onCheckedChange={onCheckedChange}
          />
        )}
      </div>
    </div>
  )
}

// ── ScrollFade: scroll container with a bottom fade while content is cut off ──

function ScrollFade({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () =>
      setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (inner.current) ro.observe(inner.current)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        data-placeholder-scroll
        className={cn('flex-1 overflow-y-auto', className)}
      >
        <div ref={inner}>{children}</div>
      </div>
      {more && (
        <div
          data-scroll-more
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent"
        />
      )}
    </div>
  )
}

function BoardPackHeader({
  pack,
  collapsed,
  onToggle,
}: {
  pack: RailPack
  collapsed: boolean
  onToggle: (packId: number) => void
}) {
  const { renamingPackId } = usePackManage()
  const [menuOpen, setMenuOpen] = useState(false)
  const renaming = renamingPackId === pack.id
  return (
    <div
      data-pack-header={pack.id}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuOpen(true)
      }}
      className="group/pack flex h-7 max-w-full items-center gap-1"
    >
      {renaming ? (
        <PackRenameInput
          packId={pack.id}
          initial={pack.name}
          className="h-6 w-56 px-1.5 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => onToggle(pack.id)}
          aria-expanded={!collapsed}
          className="flex h-7 min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon
            icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
            className="size-3.5 shrink-0"
          />
          <span className="truncate">{pack.name}</span>
          <span className="shrink-0 font-normal text-muted-foreground/70 tabular-nums">
            · {pack.scenes.length}
          </span>
        </button>
      )}
      {!renaming && (
        <SceneMenuButton
          menu={<PackMenuItems packId={pack.id} />}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className={cn(
            'p-0.5',
            !menuOpen &&
              'opacity-0 group-hover/pack:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
          )}
        />
      )}
    </div>
  )
}

// ── BoardGrid (virtualized: pack headers + rows of cards) ──

const BOARD_PADDING = 16
const BOARD_GAP = 12
const BOARD_HEADER_HEIGHT = 28

type BoardRow =
  | { kind: 'header'; key: string; pack: RailPack; collapsed: boolean }
  | { kind: 'cards'; key: string; scenes: Array<RailPack['scenes'][number]> }
  | { kind: 'empty'; key: string; pack: RailPack }

interface BoardGridProps {
  packs: Array<RailPack>
  addScene: AddSceneConfig
  collapsed: ReadonlySet<number>
  onToggleCollapsed: (packId: number) => void
  size: SceneCardSize
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
  selectedSceneId: number | null
  onSelect: (sceneId: number) => void
  selectMode: boolean
  checkedIds: ReadonlySet<number>
  onCheckedChange: (sceneId: number, checked: boolean) => void
}

function BoardGrid({
  packs,
  addScene,
  collapsed,
  onToggleCollapsed,
  size,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
  selectedSceneId,
  onSelect,
  selectMode,
  checkedIds,
  onCheckedChange,
}: BoardGridProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const minWidth = SCENE_CARD_MIN_WIDTH[size]
  const columns = Math.max(
    1,
    Math.floor(
      (width - BOARD_PADDING * 2 + BOARD_GAP) / (minWidth + BOARD_GAP),
    ),
  )

  const rows = useMemo<Array<BoardRow>>(() => {
    const out: Array<BoardRow> = []
    for (const pack of packs) {
      const isCollapsed = collapsed.has(pack.id)
      out.push({
        kind: 'header',
        key: `p${pack.id}`,
        pack,
        collapsed: isCollapsed,
      })
      if (isCollapsed) continue
      if (pack.scenes.length === 0) {
        out.push({ kind: 'empty', key: `e${pack.id}`, pack })
        continue
      }
      for (let i = 0; i < pack.scenes.length; i += columns) {
        out.push({
          kind: 'cards',
          key: `c${pack.id}:${pack.scenes[i].id}`,
          scenes: pack.scenes.slice(i, i + columns),
        })
      }
    }
    return out
  }, [packs, collapsed, columns])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) =>
      rows[i].kind === 'header'
        ? BOARD_HEADER_HEIGHT
        : Math.round(
            ((width - BOARD_PADDING * 2 - BOARD_GAP * (columns - 1)) /
              columns) *
              (4 / 3),
          ) + 64,
    getItemKey: (i) => rows[i].key,
    overscan: 4,
    paddingStart: BOARD_PADDING,
    paddingEnd: BOARD_PADDING,
  })

  // Re-measure when the card geometry changes (size slider, resize)
  useEffect(() => {
    virtualizer.measure()
  }, [columns, size, virtualizer])

  // Keep the selection visible on mount / selection change
  useEffect(() => {
    if (selectedSceneId == null || width === 0) return
    const idx = rows.findIndex(
      (r) =>
        r.kind === 'cards' && r.scenes.some((s) => s.id === selectedSceneId),
    )
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' })
    // only when the selection changes
  }, [selectedSceneId, width === 0])

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {width > 0 &&
          virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index]
            const style = {
              position: 'absolute' as const,
              top: 0,
              left: BOARD_PADDING,
              width: `calc(100% - ${BOARD_PADDING * 2}px)`,
              transform: `translateY(${v.start}px)`,
            }
            if (row.kind === 'header') {
              return (
                <div
                  key={v.key}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  style={style}
                >
                  <BoardPackHeader
                    pack={row.pack}
                    collapsed={row.collapsed}
                    onToggle={onToggleCollapsed}
                  />
                </div>
              )
            }
            if (row.kind === 'empty') {
              return (
                <div
                  key={v.key}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  style={style}
                  className="pb-3"
                >
                  <AddScenePopover
                    config={addScene}
                    defaultPackId={row.pack.id}
                    trigger={
                      <button
                        type="button"
                        className="flex h-16 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        <HugeiconsIcon icon={Add01Icon} className="size-4" />
                        {t('scene.addScene')}
                      </button>
                    }
                  />
                </div>
              )
            }
            return (
              <div
                key={v.key}
                data-index={v.index}
                ref={virtualizer.measureElement}
                style={style}
                className="pb-3"
              >
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {row.scenes.map((scene) => (
                    <SceneCard
                      key={scene.id}
                      scene={scene}
                      count={sceneCounts[scene.id] ?? null}
                      defaultCount={defaultCount}
                      onCountChange={onSceneCountChange}
                      selected={scene.id === selectedSceneId}
                      onSelect={onSelect}
                      size={size}
                      menu={
                        <SceneMenuItems>
                          <SceneMoveMenuItems
                            sceneId={scene.id}
                            packId={scene.packId}
                          />
                        </SceneMenuItems>
                      }
                      selectMode={selectMode}
                      checked={checkedIds.has(scene.id)}
                      onCheckedChange={onCheckedChange}
                    />
                  ))}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
