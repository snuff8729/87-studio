import { memo, useRef, useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { useTranslation } from '@/lib/i18n'
import { GridSizeToggle } from '@/components/common/grid-size-toggle'
import { useImageGridSize, type GridSize } from '@/lib/use-image-grid-size'

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

const historyColsMap: Record<GridSize, number> = { sm: 3, md: 2, lg: 1 }
const GAP = 4 // gap-1 = 4px

export const HistoryPanel = memo(function HistoryPanel({ images, projectId }: HistoryPanelProps) {
  const { t } = useTranslation()
  const { gridSize, setGridSize } = useImageGridSize('history')
  const cols = historyColsMap[gridSize]

  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cellSize = containerWidth > 0 ? Math.floor((containerWidth - 8 - GAP * (cols - 1)) / cols) : 80 // -8 for px-1 padding (4px each side)
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

  return (
    <div className="p-2 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {t('history.title')}
        </h3>
        <div className="flex items-center gap-1.5">
          <GridSizeToggle value={gridSize} onChange={setGridSize} />
          <span className="text-xs text-muted-foreground">{images.length}</span>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground text-center">{t('history.noImagesYet')}</p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto -mx-1 px-1">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
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
                      <Link
                        key={img.id}
                        to="/gallery/$imageId"
                        params={{ imageId: String(img.id) }}
                        search={{ project: projectId }}
                        className="relative rounded-md overflow-hidden bg-secondary group block shrink-0"
                        style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
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
                            {'\u2764'}
                          </div>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-border">
        <Link
          to="/gallery"
          search={{ project: projectId }}
          className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          {t('history.fullGallery')}
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Link>
      </div>
    </div>
  )
})
