import { useState, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { getImageDetail, updateImage, addTag, removeTag } from '@/server/functions/gallery'

interface HistoryPanelProps {
  images: Array<{
    id: number
    thumbnailPath: string | null
    seed: number | null
    projectSceneId: number | null
    isFavorite: number | null
    createdAt: string | null
  }>
  projectId: number
}

export function HistoryPanel({ images, projectId }: HistoryPanelProps) {
  const [lightboxId, setLightboxId] = useState<number | null>(null)

  // Keyboard navigation
  const currentIndex = lightboxId ? images.findIndex((img) => img.id === lightboxId) : -1

  const handlePrev = useCallback(() => {
    const idx = lightboxId ? images.findIndex((img) => img.id === lightboxId) : -1
    if (idx > 0) setLightboxId(images[idx - 1].id)
  }, [lightboxId, images])

  const handleNext = useCallback(() => {
    const idx = lightboxId ? images.findIndex((img) => img.id === lightboxId) : -1
    if (idx < images.length - 1) setLightboxId(images[idx + 1].id)
  }, [lightboxId, images])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (lightboxId === null) return
      if (e.key === 'Escape') setLightboxId(null)
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'ArrowRight') handleNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxId, handlePrev, handleNext])

  return (
    <div className="p-2 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          History
        </h3>
        <span className="text-[10px] text-muted-foreground">{images.length}</span>
      </div>

      {images.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground text-center">No images yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          <div className="grid grid-cols-2 gap-1">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => setLightboxId(img.id)}
                className="relative aspect-square rounded-md overflow-hidden bg-secondary group"
              >
                {img.thumbnailPath ? (
                  <img
                    src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px]">
                    ...
                  </div>
                )}
                {img.isFavorite ? (
                  <div className="absolute top-0.5 right-0.5 text-[10px] text-destructive">
                    {'\u2764'}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-border">
        <Link
          to="/gallery"
          search={{ project: projectId }}
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          Full gallery
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" />
        </Link>
      </div>

      {/* Lightbox */}
      {lightboxId !== null && (
        <HistoryLightbox
          imageId={lightboxId}
          onClose={() => setLightboxId(null)}
          onPrev={currentIndex > 0 ? handlePrev : undefined}
          onNext={currentIndex < images.length - 1 ? handleNext : undefined}
          currentIndex={currentIndex}
          totalCount={images.length}
        />
      )}
    </div>
  )
}

function HistoryLightbox({
  imageId,
  onClose,
  onPrev,
  onNext,
  currentIndex,
  totalCount,
}: {
  imageId: number
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  currentIndex: number
  totalCount: number
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getImageDetail>> | null>(null)
  const [memo, setMemo] = useState('')
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    setDetail(null)
    getImageDetail({ data: imageId }).then((d) => {
      setDetail(d)
      setMemo(d.memo || '')
    })
  }, [imageId])

  async function handleRating(rating: number) {
    if (!detail) return
    const newRating = detail.rating === rating ? null : rating
    await updateImage({ data: { id: imageId, rating: newRating } })
    setDetail({ ...detail, rating: newRating })
  }

  async function handleFavorite() {
    if (!detail) return
    const newVal = detail.isFavorite ? 0 : 1
    await updateImage({ data: { id: imageId, isFavorite: newVal } })
    setDetail({ ...detail, isFavorite: newVal })
  }

  async function handleSaveMemo() {
    await updateImage({ data: { id: imageId, memo } })
    if (detail) setDetail({ ...detail, memo })
  }

  async function handleAddTag() {
    if (!newTag.trim()) return
    try {
      const tag = await addTag({ data: { imageId, tagName: newTag.trim() } })
      if (detail) {
        setDetail({
          ...detail,
          tags: [...detail.tags, { tagId: tag.id, tagName: tag.name }],
        })
      }
      setNewTag('')
    } catch {
      toast.error('Failed to add tag')
    }
  }

  async function handleRemoveTag(tagId: number) {
    await removeTag({ data: { imageId, tagId } })
    if (detail) {
      setDetail({
        ...detail,
        tags: detail.tags.filter((t) => t.tagId !== tagId),
      })
    }
  }

  const imageSrc = detail?.filePath
    ? `/api/images/${detail.filePath.replace('data/images/', '')}`
    : ''

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col lg:flex-row animate-in fade-in-0 duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Image area */}
      <div
        className="flex-1 flex items-center justify-center relative min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 text-3xl transition-colors z-10"
          >
            &lsaquo;
          </button>
        )}
        {detail ? (
          <img src={imageSrc} alt="" className="max-h-full max-w-full object-contain p-4 lg:max-w-[calc(100%-20rem)]" />
        ) : (
          <Skeleton className="w-64 h-96 rounded-lg" />
        )}
        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 text-3xl transition-colors z-10"
          >
            &rsaquo;
          </button>
        )}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/50">
          {currentIndex + 1} / {totalCount}
        </div>
      </div>

      {/* Detail panel */}
      <div
        className="h-[40vh] lg:h-auto lg:w-80 bg-card border-t lg:border-t-0 lg:border-l border-border p-4 overflow-y-auto shrink-0 animate-in slide-in-from-bottom lg:slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Details</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </button>
        </div>

        {!detail ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Favorite */}
            <Button
              size="sm"
              variant={detail.isFavorite ? 'default' : 'outline'}
              onClick={handleFavorite}
              className="w-full"
            >
              {detail.isFavorite ? '\u2764 Favorited' : '\u2661 Favorite'}
            </Button>

            {/* Rating */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRating(r)}
                    className={`text-lg transition-colors ${
                      detail.rating && r <= detail.rating
                        ? 'text-primary'
                        : 'text-muted-foreground/40 hover:text-muted-foreground'
                    }`}
                  >
                    {'\u2605'}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Memo */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Memo</label>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onBlur={handleSaveMemo}
                placeholder="Add a note..."
                className="text-sm min-h-16"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {detail.tags.map((t) => (
                  <Badge key={t.tagId} variant="secondary" className="gap-1">
                    {t.tagName}
                    <button onClick={() => handleRemoveTag(t.tagId)} className="ml-0.5 opacity-60 hover:opacity-100">
                      <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add tag..."
                  className="h-7 text-xs"
                />
                <Button size="xs" variant="outline" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
            </div>

            <Separator />

            {/* Metadata */}
            <div className="text-xs space-y-1 text-muted-foreground">
              <p>Seed: {detail.seed ?? 'N/A'}</p>
              <p>Created: {new Date(detail.createdAt!).toLocaleString()}</p>
            </div>

            {/* Download */}
            <a href={imageSrc} download>
              <Button variant="outline" size="sm" className="w-full">
                Download
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
