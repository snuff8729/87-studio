import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n'
import {
  HISTORY_GAP as GAP,
  HISTORY_MIN_THUMB as MIN_THUMB,
  historyColumns,
} from '@/components/editor-shell/history-columns'

interface HistoryImage {
  id: number
  thumbnailPath: string | null
  isFavorite: number | null
}

export function HistoryStrip({
  images,
  selectedImageId,
  onSelect,
  footer,
}: {
  images: Array<HistoryImage>
  selectedImageId: number | null
  onSelect: (id: number) => void
  footer?: ReactNode
}) {
  const { t } = useTranslation()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const hasImages = images.length > 0

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasImages])

  const cols = containerWidth > 0 ? historyColumns(containerWidth) : 1
  const cellSize =
    containerWidth > 0
      ? Math.floor((containerWidth - GAP * (cols - 1)) / cols)
      : MIN_THUMB
  const rowHeight = cellSize + GAP
  const rowCount = Math.ceil(images.length / cols)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, rowHeight])

  // Keep the selection visible (e.g. during keyboard navigation)
  useEffect(() => {
    if (selectedImageId == null) return
    const idx = images.findIndex((img) => img.id === selectedImageId)
    if (idx < 0) return
    virtualizer.scrollToIndex(Math.floor(idx / cols), { align: 'auto' })
    // only when the selection changes
  }, [selectedImageId])

  return (
    <div className="p-2 flex flex-col h-full">
      {images.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground text-center">
            {t('quickGenerate.noImagesYet')}
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const startIdx = vRow.index * cols
              const rowImages = images.slice(startIdx, startIdx + cols)

              return (
                <div
                  key={vRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div style={{ display: 'flex', gap: `${GAP}px` }}>
                    {rowImages.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => onSelect(img.id)}
                        className={`relative rounded-md overflow-hidden bg-secondary group block shrink-0 ${
                          img.id === selectedImageId
                            ? 'outline-2 -outline-offset-2 outline-primary'
                            : ''
                        }`}
                        style={{
                          width: `${cellSize}px`,
                          height: `${cellSize}px`,
                        }}
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
                            ...
                          </div>
                        )}
                        {img.isFavorite ? (
                          <div className="absolute top-0.5 right-0.5 text-xs text-destructive">
                            {'❤'}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-border">
        {footer ?? (
          <Link
            to="/gallery"
            search={{ quick: true, imageDetail: undefined }}
            className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            {t('quickGenerate.viewInGallery')}
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Link>
        )}
      </div>
    </div>
  )
}
