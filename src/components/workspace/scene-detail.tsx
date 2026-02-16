import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Image02Icon, FolderOpenIcon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { getSceneDetail, getSceneImages } from '@/server/functions/workspace'
import { updateProjectScene, upsertCharacterOverride } from '@/server/functions/project-scenes'
import { updateImage } from '@/server/functions/gallery'
import { extractPlaceholders } from '@/lib/placeholder'

interface SceneDetailProps {
  sceneId: number
  characters: Array<{
    id: number
    name: string
    charPrompt: string
    charNegative: string
  }>
  generalPrompt: string
  projectId: number
  thumbnailImageId: number | null
  onThumbnailChange: (imageId: number | null, thumbnailPath?: string | null) => void
  projectThumbnailImageId?: number | null
  onProjectThumbnailChange?: (imageId: number | null) => void
  refreshKey?: number
  hidePlaceholders?: boolean
}

type SceneData = Awaited<ReturnType<typeof getSceneDetail>>
type ImageItem = SceneData['images'][number]

const GAP = 6 // gap-1.5 = 6px

function useGridColumns() {
  const [cols, setCols] = useState(4)
  useEffect(() => {
    function update() {
      const w = window.innerWidth
      // Match: grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5
      if (w >= 1280) setCols(5)
      else if (w >= 1024) setCols(4)
      else if (w >= 768) setCols(5)
      else if (w >= 640) setCols(4)
      else setCols(3)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return cols
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let current = el?.parentElement ?? null
  while (current) {
    const { overflowY } = getComputedStyle(current)
    if (overflowY === 'auto' || overflowY === 'scroll') return current
    current = current.parentElement
  }
  return null
}

export function SceneDetail({
  sceneId,
  characters,
  generalPrompt,
  projectId,
  thumbnailImageId,
  onThumbnailChange,
  projectThumbnailImageId,
  onProjectThumbnailChange,
  refreshKey,
  hidePlaceholders,
}: SceneDetailProps) {
  const [loading, setLoading] = useState(true)
  const initialLoadDone = useRef(false)

  // Images with pagination
  const [images, setImages] = useState<ImageItem[]>([])
  const [totalImageCount, setTotalImageCount] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const hasMore = images.length < totalImageCount

  // Placeholder values (general)
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({})
  // Character override values
  const [charOverrides, setCharOverrides] = useState<Record<number, Record<string, string>>>({})

  const loadScene = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true)
    try {
      const result = await getSceneDetail({ data: sceneId })
      setTotalImageCount(result.totalImageCount)

      if (silent) {
        setImages((prev) => {
          const existingIds = new Set(prev.map((img) => img.id))
          const newImages = result.images.filter((img) => !existingIds.has(img.id))
          if (newImages.length === 0) return prev
          const updatedMap = new Map(result.images.map((img) => [img.id, img]))
          const updated = prev.map((img) => updatedMap.get(img.id) ?? img)
          return [...newImages, ...updated]
        })
      } else {
        setImages(result.images)
      }

      if (!initialLoadDone.current) {
        setPlaceholderValues(JSON.parse(result.scene.placeholders || '{}'))
        const ov: Record<number, Record<string, string>> = {}
        for (const o of result.characterOverrides) {
          ov[o.characterId] = JSON.parse(o.placeholders || '{}')
        }
        setCharOverrides(ov)
        initialLoadDone.current = true
      }
    } catch {
      toast.error('Failed to load scene')
    }
    if (!silent) setLoading(false)
  }, [sceneId])

  useEffect(() => {
    initialLoadDone.current = false
    loadScene()
  }, [loadScene])

  useEffect(() => {
    if (refreshKey && initialLoadDone.current) {
      loadScene(true)
    }
  }, [refreshKey, loadScene])

  // Load more images
  const loadMoreRef = useRef(false)
  const handleLoadMore = useCallback(async () => {
    if (loadMoreRef.current) return
    loadMoreRef.current = true
    setLoadingMore(true)
    try {
      const more = await getSceneImages({ data: { sceneId, offset: images.length } })
      setImages((prev) => {
        const existingIds = new Set(prev.map((img) => img.id))
        const deduped = more.filter((img) => !existingIds.has(img.id))
        return [...prev, ...deduped]
      })
    } catch {
      toast.error('Failed to load more images')
    }
    setLoadingMore(false)
    loadMoreRef.current = false
  }, [sceneId, images.length])

  // ── Virtualized grid setup ──
  const cols = useGridColumns()
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Scroll container
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setScrollEl(findScrollParent(rootRef.current))
  }, [loading])

  // Grid container width for cell sizing
  const [gridWidth, setGridWidth] = useState(400)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setGridWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [images.length > 0]) // re-observe when images first appear

  const cellSize = Math.floor((gridWidth - GAP * (cols - 1)) / cols)
  const rowHeight = cellSize + GAP

  // Scroll margin: offset from scroll container top to grid top
  const [scrollMargin, setScrollMargin] = useState(0)
  useEffect(() => {
    const grid = gridRef.current
    if (!grid || !scrollEl) return
    const measure = () => {
      const gridRect = grid.getBoundingClientRect()
      const scrollRect = scrollEl.getBoundingClientRect()
      setScrollMargin(gridRect.top - scrollRect.top + scrollEl.scrollTop)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (rootRef.current) ro.observe(rootRef.current)
    return () => ro.disconnect()
  }, [scrollEl])

  // Row virtualizer
  const rowCount = Math.ceil(images.length / cols)
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin,
    gap: 0,
  })

  // Force re-measurement when dimensions stabilize after mount
  useEffect(() => {
    rowVirtualizer.measure()
  }, [rowVirtualizer, cellSize, scrollMargin])

  // Trigger load more when nearing the end
  const virtualItems = rowVirtualizer.getVirtualItems()
  const lastVirtualRow = virtualItems.at(-1)
  useEffect(() => {
    if (!lastVirtualRow || !hasMore || loadMoreRef.current) return
    if (lastVirtualRow.index >= rowCount - 3) {
      handleLoadMore()
    }
  }, [lastVirtualRow?.index, rowCount, hasMore, handleLoadMore])

  // ── Placeholder / override editing ──
  const generalPlaceholders = extractPlaceholders(generalPrompt)
  const charPlaceholders = characters.flatMap((c) => [
    ...extractPlaceholders(c.charPrompt),
    ...extractPlaceholders(c.charNegative),
  ])
  const uniqueCharPlaceholders = [...new Set(charPlaceholders)]

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
    setImages((prev) =>
      prev.map((img) =>
        img.id === imageId ? { ...img, isFavorite: newVal } : img,
      ),
    )
  }

  // ── Render ──
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
    <div ref={rootRef} className="p-4 space-y-4">
      {/* General Placeholders */}
      {!hidePlaceholders && generalPlaceholders.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground uppercase tracking-wider">
            General Placeholders
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {generalPlaceholders.map((key) => (
              <div key={key} className="space-y-1">
                <label className="text-sm font-mono text-muted-foreground">{`{{${key}}}`}</label>
                <Input
                  value={placeholderValues[key] ?? ''}
                  onChange={(e) => handlePlaceholderChange(key, e.target.value)}
                  className="h-8 text-base"
                  placeholder={`Value for ${key}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Character Overrides */}
      {!hidePlaceholders && characters.length > 0 && uniqueCharPlaceholders.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm text-muted-foreground uppercase tracking-wider">
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
                <span className="text-sm font-medium">{char.name}</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {charSpecificPlaceholders.map((key) => (
                    <div key={key} className="space-y-1">
                      <label className="text-sm font-mono text-muted-foreground">{`{{${key}}}`}</label>
                      <Input
                        value={charOverrides[char.id]?.[key] ?? ''}
                        onChange={(e) => handleCharOverrideChange(char.id, key, e.target.value)}
                        className="h-8 text-base"
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

      {/* Generated Images — Virtualized Grid */}
      {images.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground uppercase tracking-wider">
              Generated Images ({totalImageCount})
            </Label>
            {thumbnailImageId !== null && (
              <button
                onClick={() => onThumbnailChange(null, null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset thumbnail
              </button>
            )}
          </div>

          <div ref={gridRef}>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: 'relative',
                width: '100%',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const startIdx = virtualRow.index * cols
                const rowImages = images.slice(startIdx, startIdx + cols)

                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                    }}
                  >
                    <div style={{ display: 'flex', gap: `${GAP}px` }}>
                      {rowImages.map((img) => {
                        const isThumbnail = thumbnailImageId === img.id
                        return (
                          <div
                            key={img.id}
                            style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                            className={`relative group rounded-lg overflow-hidden bg-secondary shrink-0 ${isThumbnail ? 'ring-2 ring-primary' : ''}`}
                          >
                            <Link
                              to="/gallery/$imageId"
                              params={{ imageId: String(img.id) }}
                              search={{ project: projectId, projectSceneId: sceneId }}
                              className="absolute inset-0 z-0"
                            />
                            {img.thumbnailPath ? (
                              <img
                                src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                                No thumb
                              </div>
                            )}
                            {/* Overlay buttons */}
                            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onThumbnailChange(
                                      isThumbnail ? null : img.id,
                                      isThumbnail ? null : img.thumbnailPath,
                                    )
                                  }}
                                  className={`p-0.5 ${isThumbnail ? 'text-primary' : 'text-white/70 hover:text-white'}`}
                                  title={isThumbnail ? 'Remove as scene thumbnail' : 'Set as scene thumbnail'}
                                >
                                  <HugeiconsIcon icon={Image02Icon} className="size-5" />
                                </button>
                                {onProjectThumbnailChange && (() => {
                                  const isProjectThumb = projectThumbnailImageId === img.id
                                  return (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        onProjectThumbnailChange(isProjectThumb ? null : img.id)
                                      }}
                                      className={`p-0.5 ${isProjectThumb ? 'text-primary' : 'text-white/70 hover:text-white'}`}
                                      title={isProjectThumb ? 'Remove as project thumbnail' : 'Set as project thumbnail'}
                                    >
                                      <HugeiconsIcon icon={FolderOpenIcon} className="size-5" />
                                    </button>
                                  )
                                })()}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleToggleFavorite(img.id, img.isFavorite)
                                }}
                                aria-label={img.isFavorite ? 'Unfavorite' : 'Favorite'}
                              >
                                <span className={`text-base ${img.isFavorite ? 'text-destructive' : 'text-white/70'}`}>
                                  {img.isFavorite ? '\u2764' : '\u2661'}
                                </span>
                              </button>
                            </div>
                            {(isThumbnail || projectThumbnailImageId === img.id) && (
                              <div className="absolute bottom-0 inset-x-0 bg-primary/80 text-primary-foreground text-[10px] text-center py-0.5">
                                {isThumbnail && projectThumbnailImageId === img.id
                                  ? 'Scene + Project Thumb'
                                  : isThumbnail
                                    ? 'Scene Thumbnail'
                                    : 'Project Thumbnail'}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Load more indicator */}
          {hasMore && (
            <div className="flex justify-center py-2">
              {loadingMore ? (
                <span className="text-sm text-muted-foreground">Loading...</span>
              ) : (
                <button
                  onClick={handleLoadMore}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Load more ({images.length} / {totalImageCount})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && images.length === 0 && (
        <div className="text-center py-8 text-base text-muted-foreground">
          No images generated for this scene yet.
        </div>
      )}
    </div>
  )
}
