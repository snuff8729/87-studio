import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  DashboardSquare01Icon,
  Film02Icon,
  FolderAddIcon,
  Image02Icon,
  MoreVerticalIcon,
  Search01Icon,
  SidebarLeftIcon,
  SortingDownIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { AddScenePopover } from './add-scene-popover'
import {
  PackMenuItems,
  PackRenameInput,
  SceneMoveMenuItems,
  usePackManage,
} from './project-pack-provider'
import { CompactSelectionHeader } from './scene-selection-header'
import { SceneSearchFilter } from './scene-search-filter'
import {
  ReserveStepper,
  SceneMenuButton,
  SceneMenuItems,
  SelectCheckbox,
  sceneThumbnailUrl,
  useItemInteraction,
} from './scene-card'
import { SCENE_SORT_OPTIONS } from './scene-filters'
import {
  RAIL_WIDTH_COMPACT,
  RAIL_WIDTH_EXPANDED,
  collapsedPacksKey,
  parseCollapsedPacks,
  parseRailPref,
  railPrefKey,
} from './scene-rail-prefs'
import type { ReactNode } from 'react'
import type { SceneCardScene } from './scene-card'
import type { AddSceneConfig } from './add-scene-popover'
import type {
  SceneFilter,
  SceneFilterCounts,
  SceneSortBy,
} from './scene-filters'
import type { RailPref } from './scene-rail-prefs'
import type { TranslationKeys } from '@/lib/i18n/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DeleteFilesOption } from '@/components/workspace/delete-files-option'
import {
  readStorage,
  writeStorage,
} from '@/components/editor-shell/use-editor-persist'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// ── Shared labels ──

const SORT_LABEL_KEYS: Record<SceneSortBy, TranslationKeys> = {
  default: 'scene.sortDefault',
  name_asc: 'scene.sortNameAsc',
  name_desc: 'scene.sortNameDesc',
  images_desc: 'scene.sortImagesDesc',
  images_asc: 'scene.sortImagesAsc',
  created_asc: 'scene.sortCreatedAsc',
  created_desc: 'scene.sortCreatedDesc',
}

/** A pack group as shown by the rail / board (sorted + filtered scenes). */
export interface RailPack {
  id: number
  name: string
  scenes: Array<SceneCardScene>
}

const EMPTY_ID_SET: ReadonlySet<number> = new Set()

/** While searching, groups with matches are shown expanded. */
export function effectiveCollapsed(
  collapsed: ReadonlySet<number>,
  query: string,
): ReadonlySet<number> {
  return query.trim() ? EMPTY_ID_SET : collapsed
}

// ── Hooks ──

/**
 * Rail width: a manual 216 ↔ 56px toggle, persisted per project (default
 * expanded). The width never changes on its own.
 */
export function useRailCompact(projectId: number) {
  const key = railPrefKey(projectId)
  const [pref, setPref] = useState<RailPref>('expanded')

  // Before paint: no 216→56px flash for a saved compact choice
  useLayoutEffect(() => {
    setPref(parseRailPref(readStorage(key)))
  }, [key])

  const compact = pref === 'compact'

  const toggle = useCallback(() => {
    const next: RailPref = compact ? 'expanded' : 'compact'
    setPref(next)
    writeStorage(key, next)
  }, [compact, key])

  return { compact, toggle }
}

/** Collapsed pack groups, persisted per project. */
export function useCollapsedPacks(
  projectId: number,
): [ReadonlySet<number>, (packId: number) => void] {
  const key = collapsedPacksKey(projectId)
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(EMPTY_ID_SET)
  const collapsedRef = useRef(collapsed)
  collapsedRef.current = collapsed

  // Before paint: saved collapsed groups do not flash open
  useLayoutEffect(() => {
    setCollapsed(new Set(parseCollapsedPacks(readStorage(key))))
  }, [key])

  const toggle = useCallback(
    (packId: number) => {
      const next = new Set(collapsedRef.current)
      if (next.has(packId)) next.delete(packId)
      else next.add(packId)
      collapsedRef.current = next
      setCollapsed(next)
      writeStorage(key, JSON.stringify([...next]))
    },
    [key],
  )

  return [collapsed, toggle]
}

// ── SceneRail ──

export interface SceneRailProps {
  /** Sorted + filtered groups (empty groups dropped). */
  packs: Array<RailPack>
  /** All scenes of the project (unfiltered). */
  totalCount: number
  filterCounts: SceneFilterCounts
  filter: SceneFilter
  onFilterChange: (filter: SceneFilter) => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  /** Clears search + filter. */
  onClearFilters: () => void
  collapsedPacks: ReadonlySet<number>
  onToggleCollapsed: (packId: number) => void
  sortBy: SceneSortBy
  onSortByChange: (sort: SceneSortBy) => void
  sceneCounts: Record<number, number>
  defaultCount: number
  onDefaultCountChange: (count: number) => void
  onSceneCountChange: (sceneId: number, count: number | null) => void
  selectedSceneId: number | null
  /** `replace`: keyboard ↑/↓ moves do not add history entries. */
  onSelect: (id: number, opts?: { replace?: boolean }) => void
  addScene: AddSceneConfig
  onDeleteScene: (sceneId: number, deleteFiles: boolean) => Promise<void>
  onRenameScene: (id: number, name: string) => Promise<void>
  onDuplicateScene: (sceneId: number) => Promise<void>
  /** Selection state lives in the route (shared with the selection grid). */
  selectMode: boolean
  checkedIds: ReadonlySet<number>
  onCheckedChange: (sceneId: number, checked: boolean) => void
  onEnterSelectMode: () => void
  onExitSelectMode: () => void
  /** Selection header for the expanded / sheet rail (the compact one is built in). */
  selectionHeader: ReactNode
  checkedCount: number
  onOpenBoard: () => void
  onOpenScenePacks: () => void
  /** Opens the Ctrl/Cmd+K scene palette (header button). */
  onOpenPalette?: () => void
  /** `rail`: center column (216 / 56px). `sheet`: full width, always expanded. */
  variant?: 'rail' | 'sheet'
  compact?: boolean
  onToggleCompact?: () => void
  /** Sheet variant: close button in the header. */
  onClose?: () => void
  className?: string
}

export const SceneRail = memo(function SceneRail({
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
  sortBy,
  onSortByChange,
  sceneCounts,
  defaultCount,
  onDefaultCountChange,
  onSceneCountChange,
  selectedSceneId,
  onSelect,
  addScene,
  onDeleteScene,
  onRenameScene,
  onDuplicateScene,
  selectMode,
  checkedIds,
  onCheckedChange,
  onEnterSelectMode,
  onExitSelectMode,
  selectionHeader,
  checkedCount,
  onOpenBoard,
  onOpenScenePacks,
  onOpenPalette,
  variant = 'rail',
  compact: compactProp = false,
  onToggleCompact,
  onClose,
  className,
}: SceneRailProps) {
  const { t } = useTranslation()
  const isSheet = variant === 'sheet'

  const compact = compactProp && !isSheet

  const { openNewPack } = usePackManage()

  // ── Rename / delete (one dialog each, opened from item menus) ──
  const [renameTarget, setRenameTarget] = useState<SceneCardScene | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<SceneCardScene | null>(null)
  const [deleteFiles, setDeleteFiles] = useState(false)

  async function submitRename() {
    if (!renameTarget) return
    const name = renameValue.trim()
    if (!name) return
    if (name === renameTarget.name) {
      setRenameTarget(null)
      return
    }
    try {
      await onRenameScene(renameTarget.id, name)
      setRenameTarget(null)
    } catch {
      toast.error(t('scene.failedToRename'))
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await onDeleteScene(deleteTarget.id, deleteFiles)
    } catch {
      toast.error(t('scene.deleteSceneFailed'))
    }
  }

  // Menus open dialogs after the dropdown has closed (avoids focus/pointer
  // lock races between the two Radix layers).
  const buildMenu = useCallback(
    (scene: SceneCardScene, hasOverride: boolean) => (
      <SceneMenuItems
        onRename={() =>
          setTimeout(() => {
            setRenameValue(scene.name)
            setRenameTarget(scene)
          }, 0)
        }
        onDuplicate={() => onDuplicateScene(scene.id)}
        onResetCount={
          hasOverride ? () => onSceneCountChange(scene.id, null) : undefined
        }
        onDelete={() =>
          setTimeout(() => {
            setDeleteFiles(false)
            setDeleteTarget(scene)
          }, 0)
        }
      >
        <SceneMoveMenuItems sceneId={scene.id} packId={scene.packId} />
      </SceneMenuItems>
    ),
    [onDuplicateScene, onSceneCountChange],
  )

  // ── Keyboard navigation (visible rows of expanded groups only) ──
  const shownCollapsed = effectiveCollapsed(collapsedPacks, searchQuery)
  const navigableIds = useMemo(
    () =>
      packs
        .filter((p) => !shownCollapsed.has(p.id))
        .flatMap((p) => p.scenes.map((s) => s.id)),
    [packs, shownCollapsed],
  )

  const moveSelection = useCallback(
    (delta: number) => {
      if (navigableIds.length === 0) return
      const idx =
        selectedSceneId == null ? -1 : navigableIds.indexOf(selectedSceneId)
      const next =
        idx < 0
          ? delta > 0
            ? 0
            : navigableIds.length - 1
          : Math.min(navigableIds.length - 1, Math.max(0, idx + delta))
      if (navigableIds[next] !== selectedSceneId) {
        onSelect(navigableIds[next], { replace: true })
      }
    },
    [navigableIds, selectedSceneId, onSelect],
  )

  const filtersActive = filter !== 'all' || searchQuery.trim() !== ''
  const width = isSheet
    ? undefined
    : compact
      ? RAIL_WIDTH_COMPACT
      : RAIL_WIDTH_EXPANDED

  const addButton = (
    <AddScenePopover
      config={addScene}
      side={compact ? 'right' : 'bottom'}
      onboarding
      trigger={
        <button
          type="button"
          title={t('scene.addScene')}
          aria-label={t('scene.addScene')}
          data-onboarding="add-scene-btn"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
        </button>
      }
    />
  )
  const boardButton = (
    <RailIconButton
      onClick={onOpenBoard}
      label={t('sceneRail.openBoard')}
      icon={DashboardSquare01Icon}
    />
  )
  const paletteButton = onOpenPalette ? (
    <RailIconButton
      onClick={onOpenPalette}
      label={t('sceneRail.paletteHint')}
      icon={Search01Icon}
    />
  ) : null
  const compactToggle = onToggleCompact ? (
    <RailIconButton
      onClick={onToggleCompact}
      label={compact ? t('sceneRail.expand') : t('sceneRail.compact')}
      icon={SidebarLeftIcon}
      dot={compact && filtersActive}
      dotLabel={t('sceneRail.filtersActive')}
    />
  ) : null

  return (
    <div
      className={cn(
        'flex h-full min-h-0 shrink-0 flex-col overflow-hidden',
        !isSheet && 'border-r bg-sidebar transition-[width] duration-150',
        className,
      )}
      style={width ? { width } : undefined}
    >
      {/* ── Header ── */}
      {selectMode ? (
        compact ? (
          <CompactSelectionHeader
            count={checkedCount}
            onExit={onExitSelectMode}
          />
        ) : (
          selectionHeader
        )
      ) : compact ? (
        <div
          data-onboarding="scene-rail"
          className="flex shrink-0 flex-col items-center gap-0.5 border-b py-1.5"
        >
          {compactToggle}
          {boardButton}
          {addButton}
        </div>
      ) : (
        <div
          data-onboarding="scene-rail"
          className={cn(
            'flex h-10 shrink-0 items-center gap-0.5 border-b',
            isSheet ? 'h-12 pr-2 pl-4' : 'pr-1 pl-2.5',
          )}
        >
          <div className="min-w-0 flex-1 truncate text-xs font-semibold">
            {t('sceneRail.title')}
            <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
              {totalCount}
            </span>
          </div>
          {paletteButton}
          {boardButton}
          {addButton}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={t('sceneRail.more')}
                aria-label={t('sceneRail.more')}
                className={cn(
                  'relative inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground',
                  sortBy !== 'default' && 'text-primary',
                )}
              >
                <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-52">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <HugeiconsIcon icon={SortingDownIcon} />
                  {t('scene.sort')}
                  <span className="ml-auto pl-3 text-xs text-muted-foreground">
                    {t(SORT_LABEL_KEYS[sortBy])}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-auto min-w-44">
                  <DropdownMenuRadioGroup
                    value={sortBy}
                    onValueChange={(v) => onSortByChange(v as SceneSortBy)}
                  >
                    {SCENE_SORT_OPTIONS.map((opt) => (
                      <DropdownMenuRadioItem key={opt} value={opt}>
                        {t(SORT_LABEL_KEYS[opt])}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {totalCount > 0 && (
                <DropdownMenuItem onSelect={onEnterSelectMode}>
                  <HugeiconsIcon icon={Tick02Icon} />
                  {t('scene.selectMode')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => setTimeout(onOpenScenePacks, 0)}
              >
                <HugeiconsIcon icon={Film02Icon} />
                {t('templates.title')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTimeout(() => openNewPack(), 0)}
              >
                <HugeiconsIcon icon={FolderAddIcon} />
                {t('projectPacks.newPackItem')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div
                className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm"
                title={t('scene.defaultCountTitle')}
              >
                {t('scene.defaultCount')}
                <ReserveStepper
                  value={defaultCount}
                  onChange={onDefaultCountChange}
                  size="xs"
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          {compactToggle}
          {onClose && (
            <RailIconButton
              onClick={onClose}
              label={t('common.close')}
              icon={Cancel01Icon}
            />
          )}
        </div>
      )}

      {/* ── Search + filter (expanded only) ── */}
      {!compact && (
        <div className="shrink-0 border-b px-2 py-2">
          <SceneSearchFilter
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            filter={filter}
            onFilterChange={onFilterChange}
            counts={filterCounts}
          />
        </div>
      )}

      {/* ── List ── */}
      <div className="min-h-0 flex-1">
        {packs.length === 0 ? (
          compact ? null : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <HugeiconsIcon
                icon={Search01Icon}
                className="size-6 text-muted-foreground/30"
              />
              <p className="text-xs text-muted-foreground">
                {t('sceneRail.noMatches')}
              </p>
              {filtersActive && (
                <Button size="xs" variant="outline" onClick={onClearFilters}>
                  {t('sceneRail.clearFilters')}
                </Button>
              )}
            </div>
          )
        ) : (
          <RailList
            key={compact ? 'compact' : 'expanded'}
            packs={packs}
            collapsedPacks={shownCollapsed}
            onToggleCollapsed={onToggleCollapsed}
            compact={compact}
            addScene={addScene}
            sceneCounts={sceneCounts}
            defaultCount={defaultCount}
            onSceneCountChange={onSceneCountChange}
            selectedSceneId={selectedSceneId}
            onSelect={onSelect}
            selectMode={selectMode}
            checkedIds={checkedIds}
            onCheckedChange={onCheckedChange}
            buildMenu={buildMenu}
            onMove={moveSelection}
          />
        )}
      </div>

      {/* ── Dialogs ── */}
      <Dialog
        open={renameTarget != null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('scene.renameScene')}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename()
            }}
            placeholder={t('scene.sceneName')}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submitRename} disabled={!renameValue.trim()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('scene.deleteScene')}
        description={t('scene.deleteSceneDesc', {
          name: deleteTarget?.name ?? '',
        })}
        onConfirm={confirmDelete}
      >
        <DeleteFilesOption
          imageCount={deleteTarget?.imageCount ?? 0}
          checked={deleteFiles}
          onCheckedChange={setDeleteFiles}
        />
      </ConfirmDialog>
    </div>
  )
})

// ── Toolbar bits ──

function RailIconButton({
  onClick,
  label,
  icon,
  dot,
  dotLabel,
}: {
  onClick: () => void
  label: string
  icon: typeof Add01Icon
  /** Small primary dot (e.g. hidden search/filter is active). */
  dot?: boolean
  dotLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={dot && dotLabel ? `${label} (${dotLabel})` : label}
      aria-label={label}
      className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
    >
      <HugeiconsIcon icon={icon} className="size-4" />
      {dot && (
        <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
      )}
    </button>
  )
}

// ── Virtual list ──

interface RailListProps {
  packs: Array<RailPack>
  collapsedPacks: ReadonlySet<number>
  onToggleCollapsed: (packId: number) => void
  compact: boolean
  addScene: AddSceneConfig
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
  selectedSceneId: number | null
  onSelect: (id: number) => void
  selectMode: boolean
  checkedIds: ReadonlySet<number>
  onCheckedChange: (id: number, checked: boolean) => void
  buildMenu: (scene: SceneCardScene, hasOverride: boolean) => ReactNode
  /** Moves the selection by `delta` rows in navigation order. */
  onMove: (delta: number) => void
}

type ListEntry =
  | { kind: 'header'; pack: RailPack; collapsed: boolean }
  | { kind: 'scene'; scene: SceneCardScene }
  | { kind: 'empty'; pack: RailPack }

const HEADER_HEIGHT = 28
const HEADER_HEIGHT_COMPACT = 18
const ROW_HEIGHT = 44
const EMPTY_ROW_HEIGHT = 32

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}

function RailList({
  packs,
  collapsedPacks,
  onToggleCollapsed,
  compact,
  addScene,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
  selectedSceneId,
  onSelect,
  selectMode,
  checkedIds,
  onCheckedChange,
  buildMenu,
  onMove,
}: RailListProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<Array<ListEntry>>(() => {
    const out: Array<ListEntry> = []
    for (const pack of packs) {
      const collapsed = collapsedPacks.has(pack.id)
      out.push({ kind: 'header', pack, collapsed })
      if (!collapsed) {
        for (const scene of pack.scenes) out.push({ kind: 'scene', scene })
        if (pack.scenes.length === 0 && !compact) {
          out.push({ kind: 'empty', pack })
        }
      }
    }
    return out
  }, [packs, collapsedPacks, compact])

  const headerHeight = compact ? HEADER_HEIGHT_COMPACT : HEADER_HEIGHT
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const kind = entries[i].kind
      return kind === 'header'
        ? headerHeight
        : kind === 'empty'
          ? EMPTY_ROW_HEIGHT
          : ROW_HEIGHT
    },
    getItemKey: (i) => {
      const e = entries[i]
      return e.kind === 'header'
        ? `p${e.pack.id}`
        : e.kind === 'empty'
          ? `e${e.pack.id}`
          : `s${e.scene.id}`
    },
    overscan: 8,
  })

  // Keep the selection visible (keyboard navigation, palette, mount)
  useEffect(() => {
    if (selectedSceneId == null) return
    const idx = entries.findIndex(
      (e) => e.kind === 'scene' && e.scene.id === selectedSceneId,
    )
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'auto' })
    // only when the selection changes
  }, [selectedSceneId])

  return (
    <div
      ref={scrollRef}
      role="listbox"
      aria-label={t('sceneRail.title')}
      tabIndex={0}
      onKeyDown={(e) => {
        // React bubbles events from portaled menus through this list
        if (!e.currentTarget.contains(e.target as Node)) return
        if (isTypingTarget(e.target) || selectMode) return
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onMove(1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          onMove(-1)
        }
      }}
      className={cn(
        'h-full overflow-y-auto py-1 outline-none focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:ring-inset',
        compact ? 'no-scrollbar px-1' : 'px-1.5',
      )}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((v) => {
          const entry = entries[v.index]
          const style = {
            position: 'absolute' as const,
            top: 0,
            left: 0,
            width: '100%',
            height: `${v.size}px`,
            transform: `translateY(${v.start}px)`,
          }
          if (entry.kind === 'header') {
            return (
              <div key={v.key} style={style}>
                <PackHeader
                  pack={entry.pack}
                  collapsed={entry.collapsed}
                  compact={compact}
                  onToggle={onToggleCollapsed}
                />
              </div>
            )
          }
          if (entry.kind === 'empty') {
            return (
              <div key={v.key} style={style} className="pb-0.5">
                <AddScenePopover
                  config={addScene}
                  defaultPackId={entry.pack.id}
                  trigger={
                    <button
                      type="button"
                      className="flex h-full w-full items-center gap-1.5 rounded-md border border-dashed px-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                    >
                      <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                      {t('scene.addScene')}
                    </button>
                  }
                />
              </div>
            )
          }
          const { scene } = entry
          const override = sceneCounts[scene.id] as number | undefined
          const Row = compact ? CompactRailRow : RailRow
          return (
            <div key={v.key} style={style} className="pb-0.5">
              <Row
                scene={scene}
                count={override ?? null}
                defaultCount={defaultCount}
                onCountChange={onSceneCountChange}
                selected={selectedSceneId === scene.id}
                onSelect={onSelect}
                menu={buildMenu(scene, override != null)}
                selectMode={selectMode}
                checked={checkedIds.has(scene.id)}
                onCheckedChange={onCheckedChange}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PackHeader({
  pack,
  collapsed,
  compact,
  onToggle,
}: {
  pack: RailPack
  collapsed: boolean
  compact: boolean
  onToggle: (packId: number) => void
}) {
  const icon = collapsed ? ArrowRight01Icon : ArrowDown01Icon
  const { renamingPackId } = usePackManage()
  const [menuOpen, setMenuOpen] = useState(false)
  const renaming = renamingPackId === pack.id
  const menu = <PackMenuItems packId={pack.id} />
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenuOpen(true)
  }
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onContextMenu={onContextMenu}
            data-pack-header={pack.id}
            className="relative h-full w-full"
          >
            <button
              type="button"
              onClick={() => onToggle(pack.id)}
              aria-expanded={!collapsed}
              aria-label={pack.name}
              className="flex h-full w-full items-center gap-0.5 px-1 text-muted-foreground/70 hover:text-foreground"
            >
              <HugeiconsIcon icon={icon} className="size-3 shrink-0" />
              <span className="h-px flex-1 bg-border" />
            </button>
            <SceneMenuButton
              menu={menu}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              className="pointer-events-none absolute inset-0 opacity-0"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          {pack.name} · {pack.scenes.length}
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <div
      onContextMenu={onContextMenu}
      data-pack-header={pack.id}
      className="group/pack flex h-full w-full items-center rounded"
    >
      {renaming ? (
        <PackRenameInput packId={pack.id} initial={pack.name} />
      ) : (
        <button
          type="button"
          onClick={() => onToggle(pack.id)}
          aria-expanded={!collapsed}
          className="flex h-full min-w-0 flex-1 items-center gap-1 px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={icon} className="size-3.5 shrink-0" />
          <span className="truncate">{pack.name}</span>
          <span className="shrink-0 font-normal text-muted-foreground/70 tabular-nums">
            · {pack.scenes.length}
          </span>
        </button>
      )}
      {!renaming && (
        <SceneMenuButton
          menu={menu}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className={cn(
            'p-0.5',
            !menuOpen &&
              'hidden group-hover/pack:block focus-visible:block pointer-coarse:block',
          )}
        />
      )}
    </div>
  )
}

interface RailRowProps {
  scene: SceneCardScene
  count: number | null
  defaultCount: number
  onCountChange: (sceneId: number, count: number | null) => void
  selected: boolean
  onSelect: (sceneId: number) => void
  menu: ReactNode
  selectMode: boolean
  checked: boolean
  onCheckedChange: (sceneId: number, checked: boolean) => void
}

function RailThumb({ scene }: { scene: SceneCardScene }) {
  return (
    <div className="flex h-9 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary/50">
      {scene.thumbnailPath ? (
        <img
          src={sceneThumbnailUrl(scene.thumbnailPath)}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <HugeiconsIcon
          icon={Image02Icon}
          className="size-3.5 text-muted-foreground/25"
        />
      )}
    </div>
  )
}

const RailRow = memo(function RailRow(props: RailRowProps) {
  const {
    scene,
    count,
    defaultCount,
    onCountChange,
    selected,
    menu,
    selectMode,
    checked,
    onCheckedChange,
  } = props
  const { t } = useTranslation()
  const { menuOpen, setMenuOpen, onClick, onContextMenu } =
    useItemInteraction(props)
  const highlighted = selectMode ? checked : selected

  return (
    <div
      role="option"
      aria-selected={highlighted}
      data-onboarding="scene-item"
      data-scene-id={scene.id}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={scene.name}
      className={cn(
        'group/row flex h-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 transition-colors select-none',
        highlighted ? 'bg-primary/15' : 'hover:bg-secondary/60',
      )}
    >
      {selectMode && (
        <SelectCheckbox
          scene={scene}
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      )}
      <RailThumb scene={scene} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          selected && !selectMode
            ? 'font-medium text-primary'
            : 'text-foreground/90',
        )}
      >
        {scene.name}
      </span>
      {!selectMode && (
        <ReserveStepper
          value={count}
          placeholder={defaultCount}
          onChange={(v) => onCountChange(scene.id, v)}
          size="xs"
          title={t('scene.reserveCount')}
        />
      )}
      {!selectMode && (
        <SceneMenuButton
          menu={menu}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          className={cn(
            'p-0.5',
            !menuOpen &&
              'hidden group-hover/row:block focus-visible:block group-aria-selected/row:block pointer-coarse:block',
          )}
        />
      )}
    </div>
  )
})

const CompactRailRow = memo(function CompactRailRow(props: RailRowProps) {
  const { scene, count, defaultCount, selected, menu, selectMode, checked } =
    props
  const { t } = useTranslation()
  const { menuOpen, setMenuOpen, onClick, onContextMenu } =
    useItemInteraction(props)
  const effective = count ?? defaultCount

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="option"
          aria-selected={selectMode ? checked : selected}
          aria-label={scene.name}
          data-onboarding="scene-item"
          data-scene-id={scene.id}
          onClick={onClick}
          onContextMenu={onContextMenu}
          className={cn(
            'relative mx-auto flex h-full w-11 cursor-pointer items-center justify-center rounded-md transition-colors select-none',
            (selectMode ? checked : selected)
              ? 'bg-primary/15 ring-1 ring-primary/60 ring-inset'
              : 'hover:bg-secondary/60',
          )}
        >
          <RailThumb scene={scene} />
          {effective > 0 && (
            <span
              className={cn(
                'absolute top-0.5 right-0 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-medium tabular-nums',
                count != null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/35 text-foreground',
              )}
            >
              {effective}
            </span>
          )}
          {!selectMode && (
            <SceneMenuButton
              menu={menu}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              className="pointer-events-none absolute inset-0 opacity-0"
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="font-medium">{scene.name}</div>
        <div className="opacity-70">
          {scene.packName}
          {effective > 0 &&
            ` · ${t('sceneRail.reservedCount', { count: effective })}`}
        </div>
      </TooltipContent>
    </Tooltip>
  )
})
