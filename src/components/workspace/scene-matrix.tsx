import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Delete02Icon,
  Image02Icon,
  Tick01Icon,
  Cancel01Icon,
  GridIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
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
  onAddScene: (name: string) => Promise<void>
  onDeleteScene: (sceneId: number) => Promise<void>
  onRenameScene: (id: number, name: string) => Promise<void>
  onPlaceholdersChange: () => void
  getPrompts?: () => { generalPrompt: string; negativePrompt: string }
}

export const SceneMatrix = memo(function SceneMatrix({
  scenePacks,
  projectId,
  generalPlaceholderKeys,
  characterPlaceholderKeys,
  characters,
  characterOverrides,
  onAddScene,
  onDeleteScene,
  onRenameScene,
  onPlaceholdersChange,
  getPrompts,
}: SceneMatrixProps) {
  const [selectedScene, setSelectedScene] = useState<number | null>(null)
  const [addingScene, setAddingScene] = useState(false)
  const [newSceneName, setNewSceneName] = useState('')
  const [editingName, setEditingName] = useState<number | null>(null)
  const [editNameValue, setEditNameValue] = useState('')
  const newSceneInputRef = useRef<HTMLInputElement>(null)

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
  async function handleAddScene() {
    const name = newSceneName.trim()
    if (!name) return
    try {
      await onAddScene(name)
      setNewSceneName('')
      setAddingScene(false)
    } catch {
      toast.error('Failed to add scene')
    }
  }

  async function handleRename(id: number) {
    const name = editNameValue.trim()
    if (!name) return
    try {
      await onRenameScene(id, name)
      setEditingName(null)
    } catch {
      toast.error('Failed to rename scene')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex min-h-0">
        {/* ── Mobile: scene selector dropdown ── */}
        <div className="sm:hidden px-3 py-2.5 border-b border-border shrink-0">
          <div className="flex gap-2 items-center">
            <Select
              value={selectedScene != null ? String(selectedScene) : undefined}
              onValueChange={(v) => setSelectedScene(Number(v))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a scene..." />
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
            <button
              onClick={() => {
                setAddingScene(true)
                setTimeout(() => newSceneInputRef.current?.focus(), 50)
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors shrink-0"
              title="Add Scene"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-5" />
            </button>
          </div>
          {addingScene && (
            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5">
              <Input
                ref={newSceneInputRef}
                value={newSceneName}
                onChange={(e) => setNewSceneName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddScene()
                  if (e.key === 'Escape') { setAddingScene(false); setNewSceneName('') }
                }}
                placeholder="Scene name"
                className="h-8 text-base"
                autoFocus
              />
              <div className="flex gap-1">
                <Button size="sm" onClick={handleAddScene} disabled={!newSceneName.trim()} className="flex-1">
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAddingScene(false); setNewSceneName('') }} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Left: scene list (desktop only) ── */}
        <div className="hidden sm:flex w-52 shrink-0 bg-secondary/10 flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Scenes
            </span>
            <button
              onClick={() => {
                setAddingScene(true)
                setTimeout(() => newSceneInputRef.current?.focus(), 50)
              }}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              title="Add Scene"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {addingScene && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                <Input
                  ref={newSceneInputRef}
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddScene()
                    if (e.key === 'Escape') { setAddingScene(false); setNewSceneName('') }
                  }}
                  placeholder="Scene name"
                  className="h-7 text-sm"
                  autoFocus
                />
                <div className="flex gap-1">
                  <Button size="xs" onClick={handleAddScene} disabled={!newSceneName.trim()} className="flex-1">
                    Add
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => { setAddingScene(false); setNewSceneName('') }} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {allScenes.map((scene) => {
              const isSelected = selectedScene === scene.id
              return (
                <div
                  key={scene.id}
                  onClick={() => setSelectedScene(scene.id)}
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
                      <ConfirmDialog
                        trigger={
                          <button
                            className="text-muted-foreground/40 hover:text-destructive transition-all p-0.5 rounded shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                          </button>
                        }
                        title="Delete Scene"
                        description={`Delete "${scene.name}" and all associated images data?`}
                        onConfirm={() => {
                          if (selectedScene === scene.id) setSelectedScene(null)
                          onDeleteScene(scene.id)
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right: placeholder editor ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedSceneData ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
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
                      className="text-base font-semibold hover:text-primary transition-colors truncate block"
                      title="Click to rename"
                    >
                      {selectedSceneData.name}
                    </button>
                    {selectedSceneData.recentImageCount > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {selectedSceneData.recentImageCount} images
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
                  Gallery &rarr;
                </Link>
              </div>

              {/* Placeholder Editor */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
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
                  Select a scene <span className="hidden sm:inline">from the left </span>to edit its placeholders.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
