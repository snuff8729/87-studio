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
  FileExportIcon,
  GridIcon,
  GridViewIcon,
  LeftToRightListBulletIcon,
  Search01Icon,
  SortingDownIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { ConvertToTemplateDialog } from './convert-to-template-dialog'
import {
  ReserveStepper,
  SCENE_SORT_OPTIONS,
  SceneCard,
  SceneMenuItems,
  SceneRow,
  toSceneCardScene,
} from './scene-card'
import {
  SCENES_TAB_PREFS_DEFAULT,
  SCENE_CARD_MIN_WIDTH,
  SCENE_CARD_SIZES,
  parseScenesTabPrefs,
  scenesTabPrefsKey,
} from './scenes-tab-prefs'
import type { ReactNode } from 'react'
import type {
  SceneCardScene,
  SceneSortBy,
  WorkspaceSceneData,
  WorkspaceScenePack,
} from './scene-card'
import type { ScenesTabPrefs } from './scenes-tab-prefs'
import type { TranslationKeys } from '@/lib/i18n/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  readStorage,
  writeStorage,
} from '@/components/editor-shell/use-editor-persist'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export interface ScenesTabProps {
  scenePacks: Array<WorkspaceScenePack>
  projectId: number
  sceneCounts: Record<number, number>
  defaultCount: number
  onDefaultCountChange: (count: number) => void
  onSceneCountChange: (sceneId: number, count: number | null) => void
  onAddScene: (name: string) => Promise<void>
  onDeleteScene: (sceneId: number) => Promise<void>
  onRenameScene: (id: number, name: string) => Promise<void>
  onDuplicateScene: (sceneId: number) => Promise<void>
  sortBy: string
  onSortByChange: (sort: string) => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  selectedSceneId: number | null
  onSelectedSceneChange: (id: number | null) => void
  /** Renders an export trigger + dialog for the selected scenes (bulk bar). */
  exportDialog?: (sceneIds: Array<number>) => ReactNode
  /** Bulk delete for select mode; hidden when not provided. */
  onBulkDeleteScenes?: (sceneIds: Array<number>) => Promise<void>
}

const SORT_LABEL_KEYS: Record<SceneSortBy, TranslationKeys> = {
  default: 'scene.sortDefault',
  name_asc: 'scene.sortNameAsc',
  name_desc: 'scene.sortNameDesc',
  images_desc: 'scene.sortImagesDesc',
  images_asc: 'scene.sortImagesAsc',
  created_asc: 'scene.sortCreatedAsc',
  created_desc: 'scene.sortCreatedDesc',
}

function sortScenes(
  scenes: Array<WorkspaceSceneData>,
  sortBy: string,
): Array<WorkspaceSceneData> {
  if (sortBy === 'default') return scenes
  const sorted = [...scenes]
  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'name_asc':
        return a.name.localeCompare(b.name)
      case 'name_desc':
        return b.name.localeCompare(a.name)
      case 'images_desc':
        return b.recentImageCount - a.recentImageCount
      case 'images_asc':
        return a.recentImageCount - b.recentImageCount
      case 'created_asc':
        return a.id - b.id
      case 'created_desc':
        return b.id - a.id
      default:
        return 0
    }
  })
  return sorted
}

interface VisiblePack {
  id: number
  name: string
  scenes: Array<SceneCardScene>
}

/** View mode + card size, persisted per project (SSR-safe: defaults first). */
function useScenesTabPrefs(
  projectId: number,
): [ScenesTabPrefs, (patch: Partial<ScenesTabPrefs>) => void] {
  const [prefs, setPrefs] = useState<ScenesTabPrefs>(SCENES_TAB_PREFS_DEFAULT)
  useEffect(() => {
    setPrefs(parseScenesTabPrefs(readStorage(scenesTabPrefsKey(projectId))))
  }, [projectId])
  const update = useCallback(
    (patch: Partial<ScenesTabPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch }
        writeStorage(scenesTabPrefsKey(projectId), JSON.stringify(next))
        return next
      })
    },
    [projectId],
  )
  return [prefs, update]
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}

export const ScenesTab = memo(function ScenesTab({
  scenePacks,
  projectId,
  sceneCounts,
  defaultCount,
  onDefaultCountChange,
  onSceneCountChange,
  onAddScene,
  onDeleteScene,
  onRenameScene,
  onDuplicateScene,
  sortBy,
  onSortByChange,
  searchQuery,
  onSearchQueryChange,
  selectedSceneId,
  onSelectedSceneChange,
  exportDialog,
  onBulkDeleteScenes,
}: ScenesTabProps) {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useScenesTabPrefs(projectId)

  // ── Filters ──
  const [packFilter, setPackFilter] = useState<number | 'all'>('all')
  const activePackFilter =
    packFilter !== 'all' && scenePacks.some((p) => p.id === packFilter)
      ? packFilter
      : 'all'
  const [searchVisible, setSearchVisible] = useState(searchQuery.length > 0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [collapsedPacks, setCollapsedPacks] = useState<Set<number>>(
    () => new Set(),
  )

  const visiblePacks = useMemo<Array<VisiblePack>>(() => {
    const q = searchQuery.trim().toLowerCase()
    return scenePacks
      .filter((p) => activePackFilter === 'all' || p.id === activePackFilter)
      .map((pack) => ({
        id: pack.id,
        name: pack.name,
        scenes: sortScenes(pack.scenes, sortBy)
          .filter((s) => !q || s.name.toLowerCase().includes(q))
          .map((s) => toSceneCardScene(s, pack.name)),
      }))
      .filter((pack) => pack.scenes.length > 0)
  }, [scenePacks, activePackFilter, searchQuery, sortBy])

  const visibleScenes = useMemo(
    () => visiblePacks.flatMap((p) => p.scenes),
    [visiblePacks],
  )
  const totalSceneCount = useMemo(
    () => scenePacks.reduce((sum, p) => sum + p.scenes.length, 0),
    [scenePacks],
  )

  // ── Select mode ──
  const [selectMode, setSelectMode] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set())
  const [bulkCount, setBulkCount] = useState(1)
  const [convertOpen, setConvertOpen] = useState(false)

  // Drop checked ids that no longer exist (deleted / filtered out)
  const visibleIdSet = useMemo(
    () => new Set(visibleScenes.map((s) => s.id)),
    [visibleScenes],
  )
  const checkedVisibleIds = useMemo(
    () => [...checkedIds].filter((id) => visibleIdSet.has(id)),
    [checkedIds, visibleIdSet],
  )
  const allChecked =
    visibleScenes.length > 0 &&
    checkedVisibleIds.length === visibleScenes.length

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setCheckedIds(new Set())
  }, [])

  const handleCheckedChange = useCallback((id: number, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  function applyBulkCount() {
    for (const id of checkedVisibleIds) onSceneCountChange(id, bulkCount)
  }

  async function handleBulkDelete() {
    if (!onBulkDeleteScenes) return
    const ids = checkedVisibleIds
    if (selectedSceneId != null && ids.includes(selectedSceneId)) {
      onSelectedSceneChange(null)
    }
    await onBulkDeleteScenes(ids)
    exitSelectMode()
  }

  // ── Add scene ──
  const [addingScene, setAddingScene] = useState(false)
  const [newSceneName, setNewSceneName] = useState('')

  async function submitAddScene() {
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

  function cancelAddScene() {
    setAddingScene(false)
    setNewSceneName('')
  }

  // ── Rename / delete (one dialog each, opened from item menus) ──
  const [renameTarget, setRenameTarget] = useState<SceneCardScene | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<SceneCardScene | null>(null)

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
    const id = deleteTarget.id
    if (selectedSceneId === id) onSelectedSceneChange(null)
    await onDeleteScene(id)
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
        onDelete={() => setTimeout(() => setDeleteTarget(scene), 0)}
      />
    ),
    [onDuplicateScene, onSceneCountChange],
  )

  // ── Keyboard navigation ──
  const navigableIds = useMemo(
    () =>
      prefs.view === 'list'
        ? visiblePacks
            .filter((p) => !collapsedPacks.has(p.id))
            .flatMap((p) => p.scenes.map((s) => s.id))
        : visibleScenes.map((s) => s.id),
    [prefs.view, visiblePacks, visibleScenes, collapsedPacks],
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
        onSelectedSceneChange(navigableIds[next])
      }
    },
    [navigableIds, selectedSceneId, onSelectedSceneChange],
  )

  const toggleSearch = () => {
    const next = !searchVisible
    setSearchVisible(next)
    if (!next) onSearchQueryChange('')
    else setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  const itemProps = {
    sceneCounts,
    defaultCount,
    onSceneCountChange,
    selectedSceneId,
    onSelect: onSelectedSceneChange,
    selectMode,
    checkedIds,
    onCheckedChange: handleCheckedChange,
    buildMenu,
    onMove: moveSelection,
  }

  const sizeIndex = SCENE_CARD_SIZES.indexOf(prefs.size)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ── */}
      {selectMode ? (
        <div className="flex items-center gap-2 px-3 h-10 border-b border-border shrink-0">
          <span className="text-sm font-medium whitespace-nowrap">
            {t('scene.selectedCount', { count: checkedVisibleIds.length })}
          </span>
          <button
            type="button"
            onClick={() =>
              setCheckedIds(
                allChecked
                  ? new Set()
                  : new Set(visibleScenes.map((s) => s.id)),
              )
            }
            className="text-xs text-primary hover:underline whitespace-nowrap"
          >
            {allChecked ? t('scene.deselectAll') : t('scene.selectAll')}
          </button>
          <div className="flex-1" />
          <Button size="xs" variant="ghost" onClick={exitSelectMode}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 px-2 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-0.5">
            <Select
              value={String(activePackFilter)}
              onValueChange={(v) =>
                setPackFilter(v === 'all' ? 'all' : Number(v))
              }
            >
              <SelectTrigger
                size="sm"
                className="h-7 min-w-0 flex-1 text-xs"
                aria-label={t('scene.packFilter')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('scene.allPacks')}</SelectItem>
                {scenePacks.map((pack) => (
                  <SelectItem key={pack.id} value={String(pack.id)}>
                    {pack.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ToolbarIconButton
              onClick={toggleSearch}
              active={searchVisible}
              label={t('scene.searchScenes')}
              icon={Search01Icon}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'rounded-md p-1.5 transition-colors',
                    sortBy !== 'default'
                      ? 'text-primary bg-secondary/80'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                  )}
                  title={t('scene.sort')}
                  aria-label={t('scene.sort')}
                >
                  <HugeiconsIcon icon={SortingDownIcon} className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-44">
                <DropdownMenuLabel>{t('scene.sort')}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sortBy}
                  onValueChange={onSortByChange}
                >
                  {SCENE_SORT_OPTIONS.map((opt) => (
                    <DropdownMenuRadioItem key={opt} value={opt}>
                      {t(SORT_LABEL_KEYS[opt])}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {totalSceneCount > 0 && (
              <ToolbarIconButton
                onClick={() => setSelectMode(true)}
                label={t('scene.selectMode')}
                icon={Tick02Icon}
              />
            )}

            <ToolbarIconButton
              onClick={() => setAddingScene(true)}
              label={t('scene.addScene')}
              icon={Add01Icon}
              onboarding="add-scene-btn"
            />
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex items-center bg-secondary/40 rounded-md p-0.5 shrink-0"
              role="group"
              aria-label={t('scene.viewMode')}
            >
              <ViewToggleButton
                active={prefs.view === 'list'}
                onClick={() => setPrefs({ view: 'list' })}
                icon={LeftToRightListBulletIcon}
                label={t('scene.viewList')}
              />
              <ViewToggleButton
                active={prefs.view === 'cards'}
                onClick={() => setPrefs({ view: 'cards' })}
                icon={GridViewIcon}
                label={t('scene.viewCards')}
              />
            </div>

            {prefs.view === 'cards' ? (
              <Slider
                className="w-16 shrink-0"
                min={0}
                max={SCENE_CARD_SIZES.length - 1}
                step={1}
                value={[sizeIndex < 0 ? 1 : sizeIndex]}
                onValueChange={([v]) => setPrefs({ size: SCENE_CARD_SIZES[v] })}
                aria-label={t('scene.cardSize')}
              />
            ) : null}

            <div className="flex-1" />

            <label
              className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
              title={t('scene.defaultCountTitle')}
            >
              {t('scene.defaultCount')}
              <ReserveStepper
                value={defaultCount}
                onChange={onDefaultCountChange}
                size="xs"
              />
            </label>
          </div>
        </div>
      )}

      {/* ── Search ── */}
      {searchVisible && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-border shrink-0">
          <HugeiconsIcon
            icon={Search01Icon}
            className="size-4 text-muted-foreground shrink-0"
          />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchVisible(false)
                onSearchQueryChange('')
              }
            }}
            placeholder={t('scene.searchPlaceholder')}
            className="h-7 text-sm border-none bg-transparent shadow-none focus-visible:ring-0 px-0"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label={t('common.clear')}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>
          )}
        </div>
      )}

      {/* ── Add scene form ── */}
      {addingScene && (
        <div
          data-onboarding="add-scene-form"
          className="mx-2 mt-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2 flex flex-col gap-1.5 shrink-0"
        >
          <Input
            value={newSceneName}
            onChange={(e) => setNewSceneName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAddScene()
              if (e.key === 'Escape') cancelAddScene()
            }}
            placeholder={t('scene.sceneName')}
            className="h-7 text-sm"
            autoFocus
          />
          <div className="flex gap-1">
            <Button
              size="xs"
              onClick={submitAddScene}
              disabled={!newSceneName.trim()}
              className="flex-1"
            >
              {t('common.add')}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={cancelAddScene}
              className="flex-1"
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 min-h-0">
        {totalSceneCount === 0 ? (
          !addingScene && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
              <div className="rounded-2xl bg-secondary/30 p-5 mb-3">
                <HugeiconsIcon
                  icon={GridIcon}
                  className="size-8 text-muted-foreground/30"
                />
              </div>
              <p className="text-sm font-medium text-foreground/80 mb-1">
                {t('scene.noScenesYet')}
              </p>
              <p className="text-xs text-muted-foreground mb-4 max-w-52">
                {t('scene.noScenesDesc')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingScene(true)}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
                {t('scene.addScene')}
              </Button>
            </div>
          )
        ) : visibleScenes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
            <HugeiconsIcon
              icon={Search01Icon}
              className="size-8 text-muted-foreground/20 mb-3"
            />
            <p className="text-sm text-muted-foreground">
              {searchQuery.trim()
                ? t('scene.noSearchResults', { query: searchQuery })
                : t('scene.noScenesYet')}
            </p>
          </div>
        ) : prefs.view === 'list' ? (
          <SceneListView
            {...itemProps}
            packs={visiblePacks}
            collapsedPacks={collapsedPacks}
            onToggleCollapsed={(id) =>
              setCollapsedPacks((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }
          />
        ) : (
          <SceneCardsView
            {...itemProps}
            scenes={visibleScenes}
            size={prefs.size}
          />
        )}
      </div>

      {/* ── Bulk bar (select mode) ── */}
      {selectMode && (
        <div className="shrink-0 border-t border-border bg-card px-2 py-2 flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1">
            <ReserveStepper
              value={bulkCount}
              onChange={setBulkCount}
              size="xs"
              title={t('scene.setCountTitle')}
            />
            <Button
              size="xs"
              variant="outline"
              onClick={applyBulkCount}
              disabled={checkedVisibleIds.length === 0}
              title={t('scene.setCountTitle')}
            >
              {t('scene.setCount')}
            </Button>
          </div>
          {exportDialog && checkedVisibleIds.length > 0
            ? exportDialog(checkedVisibleIds)
            : null}
          <Button
            size="xs"
            variant="outline"
            onClick={() => setConvertOpen(true)}
            disabled={checkedVisibleIds.length === 0}
          >
            <HugeiconsIcon icon={FileExportIcon} className="size-3.5" />
            {t('scene.convertToTemplate')}
          </Button>
          {onBulkDeleteScenes && (
            <ConfirmDialog
              trigger={
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={checkedVisibleIds.length === 0}
                >
                  {t('common.delete')}
                </Button>
              }
              title={t('scene.bulkDelete')}
              description={t('scene.bulkDeleteDesc', {
                count: checkedVisibleIds.length,
              })}
              onConfirm={handleBulkDelete}
            />
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setCheckedIds(new Set())}
            disabled={checkedVisibleIds.length === 0}
          >
            {t('common.clear')}
          </Button>
        </div>
      )}

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
      />

      <ConvertToTemplateDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        scenes={visibleScenes
          .filter((s) => checkedVisibleIds.includes(s.id))
          .map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  )
})

// ── Toolbar bits ──

function ToolbarIconButton({
  onClick,
  label,
  icon,
  active,
  onboarding,
}: {
  onClick: () => void
  label: string
  icon: typeof Add01Icon
  active?: boolean
  onboarding?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      data-onboarding={onboarding}
      className={cn(
        'rounded-md p-1.5 transition-colors shrink-0',
        active
          ? 'text-primary bg-secondary/80'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </button>
  )
}

function ViewToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Add01Icon
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'rounded px-1.5 py-1 transition-all',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </button>
  )
}

// ── Views ──

interface ItemViewProps {
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
  selectedSceneId: number | null
  onSelect: (id: number) => void
  selectMode: boolean
  checkedIds: Set<number>
  onCheckedChange: (id: number, checked: boolean) => void
  buildMenu: (scene: SceneCardScene, hasOverride: boolean) => ReactNode
  /** Moves the selection by `delta` items in navigation order. */
  onMove: (delta: number) => void
}

type ListEntry =
  | { kind: 'header'; pack: VisiblePack; collapsed: boolean }
  | { kind: 'scene'; scene: SceneCardScene }

const LIST_HEADER_HEIGHT = 30
const LIST_ROW_HEIGHT = 58

function SceneListView({
  packs,
  collapsedPacks,
  onToggleCollapsed,
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
}: ItemViewProps & {
  packs: Array<VisiblePack>
  collapsedPacks: Set<number>
  onToggleCollapsed: (packId: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<Array<ListEntry>>(() => {
    const out: Array<ListEntry> = []
    for (const pack of packs) {
      const collapsed = collapsedPacks.has(pack.id)
      out.push({ kind: 'header', pack, collapsed })
      if (!collapsed) {
        for (const scene of pack.scenes) out.push({ kind: 'scene', scene })
      }
    }
    return out
  }, [packs, collapsedPacks])

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) =>
      entries[i].kind === 'header' ? LIST_HEADER_HEIGHT : LIST_ROW_HEIGHT,
    getItemKey: (i) => {
      const e = entries[i]
      return e.kind === 'header' ? `p${e.pack.id}` : `s${e.scene.id}`
    },
    overscan: 6,
  })

  // Keep the selection visible (keyboard navigation, external changes)
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
      tabIndex={0}
      onKeyDown={(e) => {
        if (isTypingTarget(e.target)) return
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          onMove(1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          onMove(-1)
        }
      }}
      className="h-full overflow-y-auto px-1.5 py-1.5 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
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
              <div key={v.key} style={style} className="flex items-end pb-1">
                <button
                  type="button"
                  onClick={() => onToggleCollapsed(entry.pack.id)}
                  className="flex items-center gap-1 w-full px-1 py-0.5 rounded text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  aria-expanded={!entry.collapsed}
                >
                  <HugeiconsIcon
                    icon={entry.collapsed ? ArrowRight01Icon : ArrowDown01Icon}
                    className="size-3.5 shrink-0"
                  />
                  <span className="truncate">{entry.pack.name}</span>
                  <span className="tabular-nums text-muted-foreground/70 normal-case">
                    {entry.pack.scenes.length}
                  </span>
                </button>
              </div>
            )
          }
          const { scene } = entry
          const override = sceneCounts[scene.id] as number | undefined
          return (
            <div key={v.key} style={style} className="pb-0.5">
              <SceneRow
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
                className="h-full"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const CARD_GAP = 8

function SceneCardsView({
  scenes,
  size,
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
}: ItemViewProps & {
  scenes: Array<SceneCardScene>
  size: keyof typeof SCENE_CARD_MIN_WIDTH
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const style = getComputedStyle(el)
      setWidth(
        el.clientWidth -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const minWidth = SCENE_CARD_MIN_WIDTH[size]
  const cols =
    width > 0
      ? Math.max(1, Math.floor((width + CARD_GAP) / (minWidth + CARD_GAP)))
      : 1
  const cardWidth =
    width > 0 ? Math.floor((width - CARD_GAP * (cols - 1)) / cols) : minWidth
  const rowCount = Math.ceil(scenes.length / cols)
  // thumbnail (3:4) + name/stepper area + gap
  const estimatedRowHeight =
    Math.floor((cardWidth * 4) / 3) + (selectMode ? 32 : 64) + CARD_GAP

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 2,
    measureElement: (el) => el.getBoundingClientRect().height,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, estimatedRowHeight, cols])

  useEffect(() => {
    if (selectedSceneId == null) return
    const idx = scenes.findIndex((s) => s.id === selectedSceneId)
    if (idx >= 0) {
      virtualizer.scrollToIndex(Math.floor(idx / cols), { align: 'auto' })
    }
    // only when the selection changes
  }, [selectedSceneId])

  return (
    <div
      ref={scrollRef}
      role="listbox"
      tabIndex={0}
      onKeyDown={(e) => {
        if (isTypingTarget(e.target)) return
        const step =
          e.key === 'ArrowDown'
            ? cols
            : e.key === 'ArrowUp'
              ? -cols
              : e.key === 'ArrowRight'
                ? 1
                : e.key === 'ArrowLeft'
                  ? -1
                  : 0
        if (step !== 0) {
          e.preventDefault()
          onMove(step)
        }
      }}
      className="h-full overflow-y-auto p-2 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((vRow) => {
          const rowScenes = scenes.slice(
            vRow.index * cols,
            vRow.index * cols + cols,
          )
          return (
            <div
              key={vRow.key}
              ref={virtualizer.measureElement}
              data-index={vRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vRow.start}px)`,
                paddingBottom: `${CARD_GAP}px`,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: `${CARD_GAP}px`,
                }}
              >
                {rowScenes.map((scene) => {
                  const override = sceneCounts[scene.id] as number | undefined
                  return (
                    <SceneCard
                      key={scene.id}
                      scene={scene}
                      count={override ?? null}
                      defaultCount={defaultCount}
                      onCountChange={onSceneCountChange}
                      selected={selectedSceneId === scene.id}
                      onSelect={onSelect}
                      size={size}
                      menu={buildMenu(scene, override != null)}
                      selectMode={selectMode}
                      checked={checkedIds.has(scene.id)}
                      onCheckedChange={onCheckedChange}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
