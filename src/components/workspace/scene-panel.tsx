import { useState, useRef, memo } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  Image02Icon,
  GridIcon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberStepper } from '@/components/ui/number-stepper'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { SceneMatrix } from './scene-matrix'
import { useTranslation } from '@/lib/i18n'

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
  onPlaceholdersChange: () => void
  viewMode: 'reserve' | 'edit'
  onViewModeChange: (mode: 'reserve' | 'edit') => void
  getPrompts?: () => { generalPrompt: string; negativePrompt: string }
}

export const ScenePanel = memo(function ScenePanel({
  scenePacks,
  projectId,
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
  onPlaceholdersChange,
  viewMode,
  onViewModeChange,
  getPrompts,
}: ScenePanelProps) {
  const allScenes = scenePacks.flatMap((pack) => pack.scenes)
  const { t } = useTranslation()

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

  // ── Empty state ──
  if (allScenes.length === 0 && !addingScene) {
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

        {/* Add scene button */}
        <button
          onClick={() => {
            setAddingScene(true)
            setTimeout(() => newSceneInputRef.current?.focus(), 50)
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
          title="Add Scene"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-5" />
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0">
        {viewMode === 'reserve' ? (
          <ReserveGrid
            scenes={allScenes}
            projectId={projectId}
            sceneCounts={sceneCounts}
            defaultCount={defaultCount}
            onSceneCountChange={onSceneCountChange}
            onDeleteScene={onDeleteScene}
            addingScene={addingScene}
            newSceneName={newSceneName}
            newSceneInputRef={newSceneInputRef}
            onNewSceneNameChange={setNewSceneName}
            onAddScene={handleAddScene}
            onCancelAdd={() => { setAddingScene(false); setNewSceneName('') }}
          />
        ) : (
          <SceneMatrix
            scenePacks={scenePacks}
            projectId={projectId}
            generalPlaceholderKeys={generalPlaceholderKeys}
            characterPlaceholderKeys={characterPlaceholderKeys}
            characters={characters}
            characterOverrides={characterOverrides}
            onAddScene={onAddScene}
            onDeleteScene={onDeleteScene}
            onRenameScene={onRenameScene}
            onPlaceholdersChange={onPlaceholdersChange}
            getPrompts={getPrompts}
          />
        )}
      </div>
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
  addingScene: boolean
  newSceneName: string
  newSceneInputRef: React.RefObject<HTMLInputElement | null>
  onNewSceneNameChange: (name: string) => void
  onAddScene: () => void
  onCancelAdd: () => void
}

function ReserveGrid({
  scenes,
  projectId,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
  onDeleteScene,
  addingScene,
  newSceneName,
  newSceneInputRef,
  onNewSceneNameChange,
  onAddScene,
  onCancelAdd,
}: ReserveGridProps) {
  const { t } = useTranslation()
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {scenes.map((scene) => {
          const count = sceneCounts[scene.id] ?? null
          const effectiveCount = count ?? defaultCount

          return (
            <div
              key={scene.id}
              className={`rounded-lg border transition-all group/card ${
                effectiveCount > 0
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-secondary/10'
              }`}
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
                  <Link
                    to="/workspace/$projectId/scenes/$sceneId"
                    params={{ projectId: String(projectId), sceneId: String(scene.id) }}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-secondary/80 transition-colors"
                    title="View gallery"
                  >
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                  </Link>
                </div>

                {/* Count stepper + delete */}
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
              </div>
            </div>
          )
        })}

        {/* Add scene inline form / button */}
        {addingScene ? (
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 flex flex-col justify-center">
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
