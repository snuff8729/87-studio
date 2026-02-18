import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Copy01Icon,
  Delete02Icon,
  Image02Icon,
  PencilEdit02Icon,
  Tick01Icon,
  Cancel01Icon,
  GridIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useTranslation } from '@/lib/i18n'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  bulkUpdatePlaceholders,
  upsertCharacterOverride,
} from '@/server/functions/project-scenes'
import { PlaceholderEditor } from './placeholder-editor'

interface SceneData {
  id: number
  name: string
  placeholders: string | null
  sortOrder: number | null
  recentImageCount: number
  thumbnailPath: string | null
  thumbnailImageId: number | null
}

interface ScenePackData {
  id: number
  name: string
  scenes: SceneData[]
}

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

interface SceneMatrixProps {
  scenePacks: ScenePackData[]
  projectId: number
  generalPlaceholderKeys: string[]
  characterPlaceholderKeys: CharacterPlaceholderKeyEntry[]
  characters: Array<{ id: number; name: string; charPrompt: string; charNegative: string }>
  characterOverrides: Record<number, CharacterOverride[]>
  selectedScene: number | null
  onSelectedSceneChange: (id: number | null) => void
  onDeleteScene: (sceneId: number) => Promise<void>
  onRenameScene: (id: number, name: string) => Promise<void>
  onDuplicateScene: (sceneId: number) => Promise<void>
  onPlaceholdersChange: () => void
  getPrompts?: () => { generalPrompt: string; negativePrompt: string }
  addingScene: boolean
  newSceneName: string
  newSceneInputRef: React.RefObject<HTMLInputElement | null>
  onNewSceneNameChange: (name: string) => void
  onSubmitAddScene: () => void
  onCancelAdd: () => void
}

export const SceneMatrix = memo(function SceneMatrix({
  scenePacks,
  projectId,
  generalPlaceholderKeys,
  characterPlaceholderKeys,
  characters,
  characterOverrides,
  selectedScene,
  onSelectedSceneChange: setSelectedScene,
  onDeleteScene,
  onRenameScene,
  onDuplicateScene,
  onPlaceholdersChange,
  getPrompts,
  addingScene,
  newSceneName,
  newSceneInputRef,
  onNewSceneNameChange,
  onSubmitAddScene,
  onCancelAdd,
}: SceneMatrixProps) {
  const { t } = useTranslation()
  const [editingName, setEditingName] = useState<number | null>(null)
  const [editNameValue, setEditNameValue] = useState('')

  const allScenes = useMemo(
    () => scenePacks.flatMap((pack) => pack.scenes),
    [scenePacks],
  )

  // Auto-select first scene
  useEffect(() => {
    if (selectedScene == null && allScenes.length > 0) {
      setSelectedScene(allScenes[0].id)
    }
    if (selectedScene != null && !allScenes.some((s) => s.id === selectedScene)) {
      setSelectedScene(allScenes[0]?.id ?? null)
    }
  }, [allScenes, selectedScene])

  // ── Cached JSON parsing for PlaceholderEditor props ──
  const parsedPlaceholders = useMemo(() => {
    const result: Record<number, Record<string, string>> = {}
    for (const scene of allScenes) {
      result[scene.id] = JSON.parse(scene.placeholders || '{}')
    }
    return result
  }, [allScenes])

  const parsedCharOverrides = useMemo(() => {
    const result: Record<number, Record<number, Record<string, string>>> = {}
    for (const [sceneId, overrides] of Object.entries(characterOverrides)) {
      result[Number(sceneId)] = {}
      for (const o of overrides) {
        result[Number(sceneId)][o.characterId] = JSON.parse(o.placeholders || '{}')
      }
    }
    return result
  }, [characterOverrides])

  const selectedSceneData = allScenes.find((s) => s.id === selectedScene)

  // ── Save callbacks for PlaceholderEditor ──
  const handleSaveGeneral = useCallback(async (mergedJson: string) => {
    if (!selectedScene) return
    await bulkUpdatePlaceholders({
      data: { updates: [{ sceneId: selectedScene, placeholders: mergedJson }] },
    })
  }, [selectedScene])

  const handleSaveCharOverride = useCallback(async (charId: number, mergedJson: string) => {
    if (!selectedScene) return
    await upsertCharacterOverride({
      data: { projectSceneId: selectedScene, characterId: charId, placeholders: mergedJson },
    })
  }, [selectedScene])

  // ── Actions ──
  async function handleRename(id: number) {
    const name = editNameValue.trim()
    if (!name) return
    try {
      await onRenameScene(id, name)
      setEditingName(null)
    } catch {
      toast.error(t('scene.failedToRename'))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col sm:flex-row min-h-0">
        {/* ── Mobile: scene selector dropdown ── */}
        <div className="sm:hidden px-3 py-2.5 border-b border-border shrink-0">
          <div className="flex gap-2 items-center">
            <Select
              value={selectedScene != null ? String(selectedScene) : undefined}
              onValueChange={(v) => setSelectedScene(Number(v))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={t('scene.selectAScene')} />
              </SelectTrigger>
              <SelectContent>
                {scenePacks.map((pack) =>
                  pack.scenes.map((scene) => (
                    <SelectItem key={scene.id} value={String(scene.id)}>
                      {scene.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          {addingScene && (
            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5">
              <Input
                ref={newSceneInputRef}
                value={newSceneName}
                onChange={(e) => onNewSceneNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSubmitAddScene()
                  if (e.key === 'Escape') onCancelAdd()
                }}
                placeholder={t('scene.sceneName')}
                className="h-8 text-base"
                autoFocus
              />
              <div className="flex gap-1">
                <Button size="sm" onClick={onSubmitAddScene} disabled={!newSceneName.trim()} className="flex-1">
                  {t('common.add')}
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelAdd} className="flex-1">
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Left: scene list (desktop only) ── */}
        <VirtualSceneList
          allScenes={allScenes}
          selectedScene={selectedScene}
          setSelectedScene={setSelectedScene}
          onDuplicateScene={onDuplicateScene}
          onDeleteScene={onDeleteScene}
          addingScene={addingScene}
          newSceneName={newSceneName}
          newSceneInputRef={newSceneInputRef}
          onNewSceneNameChange={onNewSceneNameChange}
          onSubmitAddScene={onSubmitAddScene}
          onCancelAdd={onCancelAdd}
        />

        {/* ── Right: placeholder editor ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedSceneData ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border shrink-0">
                <div className="size-8 rounded-md overflow-hidden shrink-0 bg-secondary/60">
                  {selectedSceneData.thumbnailPath ? (
                    <img
                      src={`/api/thumbnails/${selectedSceneData.thumbnailPath.replace('data/thumbnails/', '')}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <HugeiconsIcon icon={Image02Icon} className="size-5 text-muted-foreground/20" />
                    </div>
                  )}
                </div>

                {editingName === selectedSceneData.id ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Input
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(selectedSceneData.id)
                        if (e.key === 'Escape') setEditingName(null)
                      }}
                      className="h-7 text-base flex-1"
                      autoFocus
                    />
                    <button onClick={() => handleRename(selectedSceneData.id)} className="text-primary hover:text-primary/80 transition-colors shrink-0 p-1">
                      <HugeiconsIcon icon={Tick01Icon} className="size-5" />
                    </button>
                    <button onClick={() => setEditingName(null)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1">
                      <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => {
                        setEditingName(selectedSceneData.id)
                        setEditNameValue(selectedSceneData.name)
                      }}
                      className="flex items-center gap-1.5 text-base font-semibold hover:text-primary transition-colors truncate group/rename"
                      title={t('scene.clickToRename')}
                    >
                      <span className="truncate">{selectedSceneData.name}</span>
                      <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5 text-muted-foreground/40 group-hover/rename:text-primary shrink-0" />
                    </button>
                    {selectedSceneData.recentImageCount > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {t('scene.images', { count: selectedSceneData.recentImageCount })}
                      </span>
                    )}
                  </div>
                )}

                <Link
                  to="/workspace/$projectId/scenes/$sceneId"
                  params={{
                    projectId: String(projectId),
                    sceneId: String(selectedSceneData.id),
                  }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 px-2 py-1 rounded-md hover:bg-secondary/80"
                >
                  {t('scene.galleryArrow')} &rarr;
                </Link>
              </div>

              {/* Placeholder Editor */}
              <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 sm:py-4">
                <PlaceholderEditor
                  sceneId={selectedSceneData.id}
                  scenePlaceholders={parsedPlaceholders[selectedSceneData.id] ?? {}}
                  characterOverrides={parsedCharOverrides[selectedSceneData.id] ?? {}}
                  generalPlaceholderKeys={generalPlaceholderKeys}
                  characterPlaceholderKeys={characterPlaceholderKeys}
                  characters={characters}
                  onSaveGeneral={handleSaveGeneral}
                  onSaveCharOverride={handleSaveCharOverride}
                  onPlaceholdersChange={onPlaceholdersChange}
                  getPrompts={getPrompts}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="space-y-4 max-w-xs">
                <div className="rounded-2xl bg-secondary/20 p-5 inline-block">
                  <HugeiconsIcon icon={GridIcon} className="size-8 text-muted-foreground/25" />
                </div>
                <p className="text-sm text-muted-foreground/60">
                  <span className="hidden sm:inline">{t('scene.selectSceneLeft')}</span>
                  <span className="sm:hidden">{t('scene.selectScene')}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

// ── Virtualized scene list for SceneMatrix left sidebar ──

const SCENE_LIST_ITEM_HEIGHT = 240 // approximate: aspect-[3/4] on ~192px wide + info area
const SCENE_LIST_GAP = 4 // space-y-1 = 4px

interface VirtualSceneListProps {
  allScenes: SceneData[]
  selectedScene: number | null
  setSelectedScene: (id: number | null) => void
  onDuplicateScene: (sceneId: number) => Promise<void>
  onDeleteScene: (sceneId: number) => Promise<void>
  addingScene: boolean
  newSceneName: string
  newSceneInputRef: React.RefObject<HTMLInputElement | null>
  onNewSceneNameChange: (name: string) => void
  onSubmitAddScene: () => void
  onCancelAdd: () => void
}

function VirtualSceneList({
  allScenes,
  selectedScene,
  setSelectedScene,
  onDuplicateScene,
  onDeleteScene,
  addingScene,
  newSceneName,
  newSceneInputRef,
  onNewSceneNameChange,
  onSubmitAddScene,
  onCancelAdd,
}: VirtualSceneListProps) {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const [itemHeight, setItemHeight] = useState(SCENE_LIST_ITEM_HEIGHT)

  // Measure actual item height based on sidebar width
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth - 16 // px-2 = 8px each side
      // thumbnail height (aspect 3:4) + info area (~36px) + gap
      setItemHeight(Math.floor(w * 4 / 3) + 36 + SCENE_LIST_GAP)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const virtualizer = useVirtualizer({
    count: allScenes.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => itemHeight,
    overscan: 3,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, itemHeight])

  return (
    <div className="hidden sm:flex w-52 shrink-0 bg-secondary/10 flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {t('scene.scenes')}
        </span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-2 pb-2">
        {addingScene && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5 mb-1">
            <Input
              ref={newSceneInputRef}
              value={newSceneName}
              onChange={(e) => onNewSceneNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmitAddScene()
                if (e.key === 'Escape') onCancelAdd()
              }}
              placeholder={t('scene.sceneName')}
              className="h-7 text-sm"
              autoFocus
            />
            <div className="flex gap-1">
              <Button size="xs" onClick={onSubmitAddScene} disabled={!newSceneName.trim()} className="flex-1">
                {t('common.add')}
              </Button>
              <Button size="xs" variant="ghost" onClick={onCancelAdd} className="flex-1">
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}

        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const scene = allScenes[vItem.index]
            return (
              <MatrixSceneItem
                key={scene.id}
                scene={scene}
                isSelected={selectedScene === scene.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vItem.start}px)`,
                  paddingBottom: `${SCENE_LIST_GAP}px`,
                }}
                onSelect={() => setSelectedScene(scene.id)}
                onDuplicate={() => onDuplicateScene(scene.id)}
                onDelete={() => {
                  if (selectedScene === scene.id) setSelectedScene(null)
                  onDeleteScene(scene.id)
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Memoized matrix scene list item ──

interface MatrixSceneItemProps {
  scene: SceneData
  isSelected: boolean
  style: React.CSSProperties
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}

const MatrixSceneItem = memo(function MatrixSceneItem({
  scene,
  isSelected,
  style,
  onSelect,
  onDuplicate,
  onDelete,
}: MatrixSceneItemProps) {
  const { t } = useTranslation()
  return (
    <div style={style}>
      <div
        onClick={onSelect}
        className={`rounded-lg cursor-pointer transition-all group/item ${
          isSelected
            ? 'bg-secondary ring-1 ring-primary/30'
            : 'hover:bg-secondary/60'
        }`}
      >
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
            <div className="aspect-[3/4] rounded-t-lg bg-secondary/60 flex items-center justify-center">
              <HugeiconsIcon icon={Image02Icon} className="size-5 text-muted-foreground/15" />
            </div>
          )}
          {scene.recentImageCount > 0 && (
            <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-xs text-white/80 tabular-nums">
              <HugeiconsIcon icon={Image02Icon} className="size-2.5" />
              {scene.recentImageCount}
            </span>
          )}
        </div>

        <div className="px-2.5 pt-1.5 pb-2">
          <div className="flex items-center gap-1">
            <div className={`text-sm font-medium truncate flex-1 ${isSelected ? 'text-primary' : 'text-foreground/90'}`}>
              {scene.name}
            </div>
            <button
              className="text-muted-foreground/40 hover:text-foreground transition-all p-0.5 rounded shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate()
              }}
              title={t('scene.duplicateScene')}
            >
              <HugeiconsIcon icon={Copy01Icon} className="size-4" />
            </button>
            <ConfirmDialog
              trigger={
                <button
                  className="text-muted-foreground/40 hover:text-destructive transition-all p-0.5 rounded shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </button>
              }
              title={t('scene.deleteScene')}
              description={t('scene.deleteSceneDesc', { name: scene.name })}
              onConfirm={onDelete}
            />
          </div>
        </div>
      </div>
    </div>
  )
})
