import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { listImagesByPromptTag } from '@/server/functions/gallery'
import { useTranslation } from '@/lib/i18n'

const PREVIEW_LIMIT = 24

type Result = Awaited<ReturnType<typeof listImagesByPromptTag>>

/** Gallery images whose positive prompt contains the bookmarked tag. */
export function PromptTagImages({ tag }: { tag: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    listImagesByPromptTag({ data: { tag, limit: PREVIEW_LIMIT } })
      .then((r) => {
        if (!cancelled) setResult(r)
      })
      .catch(() => {
        if (!cancelled) setResult({ total: 0, images: [] })
      })
    return () => {
      cancelled = true
    }
  }, [tag])

  function openImage(imageId: number) {
    // Opens the image overlay; prev/next walk this tag's images
    navigate({
      to: '.',
      search: (prev) => ({ ...prev, imageDetail: imageId, detailTag: tag }),
    })
  }

  return (
    <div className="space-y-2" data-prompt-tag-images>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm text-muted-foreground uppercase tracking-wider">
          {t('tagGallery.promptImages')}
        </Label>
        {result && result.total > 0 && (
          <Button size="xs" variant="outline" asChild>
            <Link
              to="/gallery"
              search={{ promptTag: tag, imageDetail: undefined }}
              data-view-in-gallery
            >
              {t('tagGallery.viewInGallery')}
            </Link>
          </Button>
        )}
      </div>
      {result && result.total === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t('tagGallery.promptImagesNone')}
        </p>
      )}
      {result && result.total > 0 && (
        <>
          <p className="text-xs text-muted-foreground" data-prompt-tag-count>
            {t('tagGallery.promptImagesCount', { count: result.total })}
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
            {result.images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => openImage(img.id)}
                className="relative aspect-square rounded-md overflow-hidden bg-secondary"
                data-prompt-tag-image={img.id}
              >
                {img.thumbnailPath && (
                  <img
                    src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
