import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft02Icon, Image02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumberStepper } from '@/components/ui/number-stepper'
import { Skeleton } from '@/components/ui/skeleton'
import { getSceneDetail } from '@/server/functions/workspace'
import { updateProjectScene, upsertCharacterOverride } from '@/server/functions/project-scenes'
import { updateImage } from '@/server/functions/gallery'
import { extractPlaceholders } from '@/lib/placeholder'

interface SceneDetailProps {
  sceneId: number
  sceneName: string
  packName: string
  characters: Array<{
    id: number
    name: string
    charPrompt: string
    charNegative: string
  }>
  generalPrompt: string
  projectId: number
  onBack: () => void
  count: number | null
  defaultCount: number
  onCountChange: (count: number | null) => void
  thumbnailImageId: number | null
  onThumbnailChange: (imageId: number | null, thumbnailPath?: string | null) => void
  refreshKey?: number
}

type SceneData = Awaited<ReturnType<typeof getSceneDetail>>

export function SceneDetail({
  sceneId,
  sceneName,
  packName,
  characters,
  generalPrompt,
  onBack,
  count,
  defaultCount,
  onCountChange,
  thumbnailImageId,
  onThumbnailChange,
  refreshKey,
}: SceneDetailProps) {
  const [data, setData] = useState<SceneData | null>(null)
  const [loading, setLoading] = useState(true)
  const initialLoadDone = useRef(false)

  // Placeholder values (general)
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({})
  // Character override values
  const [charOverrides, setCharOverrides] = useState<Record<number, Record<string, string>>>({})

  const loadScene = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true)
    try {
      const result = await getSceneDetail({ data: sceneId })
      setData(result)

      // Only initialize form state on first load (don't overwrite user edits)
      if (!initialLoadDone.current) {
        setPlaceholderValues(JSON.parse(result.scene.placeholders || '{}'))
        const overrides: Record<number, Record<string, string>> = {}
        for (const o of result.characterOverrides) {
          overrides[o.characterId] = JSON.parse(o.placeholders || '{}')
        }
        setCharOverrides(overrides)
        initialLoadDone.current = true
      }
    } catch {
      toast.error('Failed to load scene')
    }
    if (!silent) setLoading(false)
  }, [sceneId])

  // Initial load
  useEffect(() => {
    initialLoadDone.current = false
    loadScene()
  }, [loadScene])

  // Silent refresh when new images are generated
  useEffect(() => {
    if (refreshKey && initialLoadDone.current) {
      loadScene(true)
    }
  }, [refreshKey, loadScene])

  // Extract placeholder keys from prompts
  const generalPlaceholders = extractPlaceholders(generalPrompt)
  const charPlaceholders = characters.flatMap((c) => [
    ...extractPlaceholders(c.charPrompt),
    ...extractPlaceholders(c.charNegative),
  ])
  const uniqueCharPlaceholders = [...new Set(charPlaceholders)]

  // Auto-save placeholders (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  function handlePlaceholderChange(key: string, value: string) {
    const updated = { ...placeholderValues, [key]: value }
    setPlaceholderValues(updated)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateProjectScene({
          data: { id: sceneId, placeholders: JSON.stringify(updated) },
        })
      } catch {
        toast.error('Failed to save placeholder')
      }
    }, 800)
  }

  function handleCharOverrideChange(charId: number, key: string, value: string) {
    const updated = {
      ...charOverrides,
      [charId]: { ...(charOverrides[charId] || {}), [key]: value },
    }
    setCharOverrides(updated)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await upsertCharacterOverride({
          data: {
            projectSceneId: sceneId,
            characterId: charId,
            placeholders: JSON.stringify(updated[charId] || {}),
          },
        })
      } catch {
        toast.error('Failed to save override')
      }
    }, 800)
  }

  async function handleToggleFavorite(imageId: number, current: number | null) {
    const newVal = current ? 0 : 1
    await updateImage({ data: { id: imageId, isFavorite: newVal } })
    if (data) {
      setData({
        ...data,
        images: data.images.map((img) =>
          img.id === imageId ? { ...img, isFavorite: newVal } : img,
        ),
      })
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
          Back
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{packName}</div>
          <h2 className="text-sm font-semibold truncate">{sceneName}</h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Label className="text-[10px] text-muted-foreground">Count</Label>
          <NumberStepper
            value={count}
            onChange={onCountChange}
            min={0}
            max={100}
            placeholder={String(defaultCount)}
            size="md"
          />
          {count !== null && (
            <button
              onClick={() => onCountChange(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
              title="Reset to default"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* General Placeholders */}
      {generalPlaceholders.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            General Placeholders
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {generalPlaceholders.map((key) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-mono text-muted-foreground">{`{{${key}}}`}</label>
                <Input
                  value={placeholderValues[key] ?? ''}
                  onChange={(e) => handlePlaceholderChange(key, e.target.value)}
                  className="h-8 text-sm"
                  placeholder={`Value for ${key}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Character Overrides */}
      {characters.length > 0 && uniqueCharPlaceholders.length > 0 && (
        <div className="space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Character Overrides
          </Label>
          {characters.map((char) => {
            const charSpecificPlaceholders = [
              ...new Set([
                ...extractPlaceholders(char.charPrompt),
                ...extractPlaceholders(char.charNegative),
              ]),
            ]
            if (charSpecificPlaceholders.length === 0) return null

            return (
              <div key={char.id} className="space-y-1.5 pl-3 border-l-2 border-border">
                <span className="text-xs font-medium">{char.name}</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {charSpecificPlaceholders.map((key) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-mono text-muted-foreground">{`{{${key}}}`}</label>
                      <Input
                        value={charOverrides[char.id]?.[key] ?? ''}
                        onChange={(e) => handleCharOverrideChange(char.id, key, e.target.value)}
                        className="h-8 text-sm"
                        placeholder={`Value for ${key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Generated Images */}
      {data && data.images.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Generated Images ({data.images.length})
            </Label>
            {thumbnailImageId !== null && (
              <button
                onClick={() => onThumbnailChange(null, null)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset thumbnail
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
            {data.images.map((img) => {
              const isThumbnail = thumbnailImageId === img.id
              return (
                <div
                  key={img.id}
                  className={`relative group aspect-square rounded-lg overflow-hidden bg-secondary cursor-pointer ${isThumbnail ? 'ring-2 ring-primary' : ''}`}
                >
                  {img.thumbnailPath ? (
                    <img
                      src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      No thumb
                    </div>
                  )}
                  {/* Overlay buttons */}
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Set as thumbnail */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onThumbnailChange(
                          isThumbnail ? null : img.id,
                          isThumbnail ? null : img.thumbnailPath,
                        )
                      }}
                      className={`p-0.5 ${isThumbnail ? 'text-primary' : 'text-white/70 hover:text-white'}`}
                      title={isThumbnail ? 'Remove as thumbnail' : 'Set as thumbnail'}
                    >
                      <HugeiconsIcon icon={Image02Icon} className="size-3.5" />
                    </button>
                    {/* Favorite */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleFavorite(img.id, img.isFavorite)
                      }}
                      aria-label={img.isFavorite ? 'Unfavorite' : 'Favorite'}
                    >
                      <span className={`text-sm ${img.isFavorite ? 'text-destructive' : 'text-white/70'}`}>
                        {img.isFavorite ? '\u2764' : '\u2661'}
                      </span>
                    </button>
                  </div>
                  {/* Thumbnail badge */}
                  {isThumbnail && (
                    <div className="absolute bottom-0 inset-x-0 bg-primary/80 text-primary-foreground text-[9px] text-center py-0.5">
                      Thumbnail
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {data && data.images.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No images generated for this scene yet.
        </div>
      )}
    </div>
  )
}
