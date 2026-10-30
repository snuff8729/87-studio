import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  ChampionIcon,
  Exchange01Icon,
  FileExportIcon,
  GridIcon,
  Image02Icon,
  ImageRemove01Icon,
  PencilEdit02Icon,
  Tick01Icon,
} from '@hugeicons/core-free-icons'
import { PlaceholderEditor } from './placeholder-editor'
import { SceneDetail } from './scene-detail'
import { TournamentDialog } from './tournament-dialog'
import { ConvertToTemplateDialog } from './convert-to-template-dialog'
import type { ReactNode } from 'react'
import type { SceneImageSortBy } from './scene-detail'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberStepper } from '@/components/ui/number-stepper'
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
}

/** One row of the route's `characterOverrides[sceneId]` array. */
export interface SceneViewCharacterOverride {
  projectSceneId: number
  characterId: number
  placeholders: string
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
}: SceneViewProps) {
  const { t } = useTranslation()
  const onboarding = useOnboardingMaybe()
  const sceneId = scene.id

  // ── Placeholders section ──
  const [placeholdersOpen, setPlaceholdersOpen] = usePlaceholdersOpen(projectId)
  // Onboarding step 7 targets the placeholder editor — never hide it then.
  const showPlaceholders = placeholdersOpen || !!onboarding?.state.active

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
            <span className="hidden @2xl:inline">{t('scene.compare')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canCompare}
            onClick={() => setTournamentOpen(true)}
            title={t('tournament.tournament')}
          >
            <HugeiconsIcon icon={ChampionIcon} className="size-4" />
            <span className="hidden @2xl:inline">
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
            <span className="hidden @2xl:inline">
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
              <span className="hidden @2xl:inline">
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
          showPlaceholders && 'max-h-[45%]',
        )}
      >
        <button
          onClick={() => setPlaceholdersOpen(!placeholdersOpen)}
          aria-expanded={showPlaceholders}
          title={t('sceneView.togglePlaceholders')}
          className="flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              'size-4 transition-transform',
              !showPlaceholders && '-rotate-90',
            )}
          />
          {t('sceneView.placeholders')}
          {placeholderCount > 0 && (
            <span className="tabular-nums text-muted-foreground/60">
              {placeholderCount}
            </span>
          )}
        </button>
        {showPlaceholders && (
          <div className="min-h-0 overflow-y-auto px-3 pb-3 sm:px-4">
            <PlaceholderEditor
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
          </div>
        )}
      </section>

      {/* ── Images (scroll container — must stay unpositioned so the bulk
          bar anchors to this panel's root) ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SceneDetail
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

// ── SceneBoard (no scene selected) ──

/** Same shape as Task 1's `SceneCard` scene. */
export interface SceneBoardScene {
  id: number
  name: string
  packName: string
  thumbnailPath: string | null
  imageCount: number
}

export interface SceneBoardProps {
  scenes: Array<SceneBoardScene>
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
  onSelect: (sceneId: number) => void
  onAddScene: (name: string) => Promise<void>
  /** Rendered as-is (e.g. `<ScenePackDialog projectId={…} />`, which brings its own trigger). */
  scenePackDialog: ReactNode
}

export function SceneBoard({
  scenes,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
  onSelect,
  onAddScene,
  scenePackDialog,
}: SceneBoardProps) {
  const { t } = useTranslation()

  if (scenes.length === 0) {
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
          {scenePackDialog}
          <AddSceneInline onAddScene={onAddScene} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {t('sceneView.boardTitle')}
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              {scenes.length}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {t('sceneView.boardHint')}
          </div>
        </div>
        {scenePackDialog}
        <AddSceneInline onAddScene={onAddScene} />
      </div>
      {/* TODO(task3): use SceneCard */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3 p-4">
        {scenes.map((scene) => (
          <BoardCard
            key={scene.id}
            scene={scene}
            count={sceneCounts[scene.id] ?? null}
            defaultCount={defaultCount}
            onCountChange={(v) => onSceneCountChange(scene.id, v)}
            onSelect={() => onSelect(scene.id)}
          />
        ))}
      </div>
    </div>
  )
}

function BoardCard({
  scene,
  count,
  defaultCount,
  onCountChange,
  onSelect,
}: {
  scene: SceneBoardScene
  count: number | null
  defaultCount: number
  onCountChange: (count: number | null) => void
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const effective = count ?? defaultCount

  return (
    <div
      className={cn(
        'group/card overflow-hidden rounded-lg border transition-colors',
        effective > 0
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-secondary/10',
      )}
    >
      <button
        onClick={onSelect}
        className="relative block w-full cursor-pointer text-left"
      >
        <div className="aspect-[3/4] bg-secondary/40">
          {scene.thumbnailPath ? (
            <img
              src={thumbUrl(scene.thumbnailPath)}
              alt=""
              className="h-full w-full object-cover transition-opacity group-hover/card:opacity-90"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <HugeiconsIcon
                icon={Image02Icon}
                className="size-6 text-muted-foreground/20"
              />
            </div>
          )}
        </div>
        {scene.imageCount > 0 && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-xs tabular-nums text-white/80 backdrop-blur-sm">
            <HugeiconsIcon icon={Image02Icon} className="size-2.5" />
            {scene.imageCount}
          </span>
        )}
        <div className="px-2.5 pt-2">
          <div className="truncate text-sm font-medium">{scene.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {scene.packName}
          </div>
        </div>
      </button>
      <div
        className="flex items-center gap-1 px-2.5 pb-2.5 pt-2"
        title={t('sceneView.reserveCount')}
      >
        <NumberStepper
          value={count}
          onChange={onCountChange}
          min={0}
          max={100}
          placeholder={String(defaultCount)}
        />
        {count != null && (
          <button
            onClick={() => onCountChange(null)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            title={t('sceneView.resetCount')}
            aria-label={t('sceneView.resetCount')}
          >
            &times;
          </button>
        )}
      </div>
    </div>
  )
}

function AddSceneInline({
  onAddScene,
}: {
  onAddScene: (name: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onAddScene(trimmed)
      setName('')
      setAdding(false)
    } catch {
      toast.error(t('scene.addSceneFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (!adding) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
        <HugeiconsIcon icon={Add01Icon} className="size-4" />
        {t('scene.addScene')}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') {
            setAdding(false)
            setName('')
          }
        }}
        placeholder={t('scene.sceneName')}
        aria-label={t('scene.sceneName')}
        className="h-8 w-40 text-sm"
        autoFocus
      />
      <Button size="sm" onClick={submit} disabled={!name.trim() || busy}>
        {t('common.add')}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          setAdding(false)
          setName('')
        }}
        aria-label={t('common.cancel')}
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </Button>
    </div>
  )
}
