import { useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { PinIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  listLibraryImages,
  updateLibraryCharacter,
  updateOutfitItem,
} from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const LIMIT = 24

export function libraryThumbUrl(path: string): string {
  return `/api/thumbnails/${path.replace('data/thumbnails/', '')}`
}

async function setThumbnail(
  kind: 'character' | 'item',
  id: number,
  thumbnailImageId: number | null,
) {
  const payload = { id, thumbnailImageId }
  if (kind === 'character') await updateLibraryCharacter({ data: payload })
  else await updateOutfitItem({ data: payload })
}

/** "Images (N)" grid for a library character / outfit item + thumbnail actions. */
export function LibraryImagesSection({
  kind,
  id,
  imageCount,
  thumbnailImageId,
}: {
  kind: 'character' | 'item'
  id: number
  imageCount: number
  thumbnailImageId: number | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })

  const { data: images } = useQuery({
    queryKey: ['library', 'images', kind, id, imageCount],
    queryFn: () => listLibraryImages({ data: { kind, id, limit: LIMIT } }),
  })

  // The detail overlay can change the thumbnail too
  useEffect(() => {
    window.addEventListener('library-thumbnail-changed', refresh)
    return () =>
      window.removeEventListener('library-thumbnail-changed', refresh)
  })

  function openImage(imageId: number) {
    void navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        imageDetail: imageId,
        ...(kind === 'character'
          ? { detailLibChar: id }
          : { detailOutfitItem: id }),
      }),
    } as any)
  }

  async function pin(imageId: number | null) {
    try {
      await setThumbnail(kind, id, imageId)
      toast.success(
        imageId === null
          ? t('library.thumbnailReset')
          : t('library.thumbnailSet'),
      )
      await refresh()
    } catch {
      toast.error(t('library.thumbnailFailed'))
    }
  }

  return (
    <section className="space-y-2" data-library-images>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-sm text-muted-foreground">
          {t('library.imagesTitle', { count: imageCount })}
        </Label>
        <div className="flex items-center gap-1.5">
          {thumbnailImageId !== null && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              data-reset-thumbnail
              onClick={() => void pin(null)}
            >
              {t('library.resetThumbnail')}
            </Button>
          )}
          {imageCount > 0 && (
            <Button size="xs" variant="outline" asChild>
              <Link
                to="/gallery"
                search={
                  kind === 'character'
                    ? { libraryCharacter: id, imageDetail: undefined }
                    : { outfitItem: id, imageDetail: undefined }
                }
                data-view-in-gallery
              >
                {t('library.viewInGallery')}
              </Link>
            </Button>
          )}
        </div>
      </div>
      {imageCount === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {kind === 'character'
            ? t('library.imagesEmptyCharacter')
            : t('library.imagesEmptyItem')}
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 md:grid-cols-6">
          {(images ?? []).map((img) => (
            <div
              key={img.id}
              className="group relative aspect-square overflow-hidden rounded-md bg-secondary"
            >
              <button
                type="button"
                onClick={() => openImage(img.id)}
                className="size-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                data-library-image={img.id}
                aria-label={t('library.openGalleryImage')}
              >
                {img.thumbnailPath && (
                  <img
                    src={libraryThumbUrl(img.thumbnailPath)}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                )}
              </button>
              <button
                type="button"
                title={t('library.setThumbnail')}
                aria-label={t('library.setThumbnail')}
                data-set-thumbnail={img.id}
                onClick={() => void pin(img.id)}
                className={cn(
                  'absolute right-1 top-1 flex size-6 items-center justify-center rounded-md bg-background/80 text-foreground backdrop-blur transition-opacity hover:bg-background',
                  'md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100',
                  thumbnailImageId === img.id && 'text-primary md:opacity-100',
                )}
              >
                <HugeiconsIcon icon={PinIcon} className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
