import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

interface CompareImage {
  id: number
  filePath: string
  thumbnailPath: string | null
  seed: number | null
  isFavorite: number | null
  rating: number | null
  tournamentWins: number | null
  tournamentLosses: number | null
}

interface CompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  images: CompareImage[]
}

const PAGE_SIZE = 4

function winRate(wins: number, losses: number): string {
  const total = wins + losses
  if (total === 0) return '-'
  return `${Math.round((wins / total) * 100)}%`
}

export function CompareDialog({ open, onOpenChange, images }: CompareDialogProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState(0)

  const totalPages = Math.ceil(images.length / PAGE_SIZE)
  const pageImages = images.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when images change
  useEffect(() => {
    setPage(0)
  }, [images.length])

  const goNext = useCallback(() => {
    setPage((p) => Math.min(p + 1, totalPages - 1))
  }, [totalPages])

  const goPrev = useCallback(() => {
    setPage((p) => Math.max(p - 1, 0))
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      } else if (e.key === 'ArrowLeft' && totalPages > 1) {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight' && totalPages > 1) {
        e.preventDefault()
        goNext()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, totalPages, goNext, goPrev, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="h-12 border-b border-border flex items-center px-3 shrink-0 gap-3">
        <div className="flex-1 text-center min-w-0 flex items-center justify-center gap-3">
          {totalPages > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goPrev}
              disabled={page === 0}
            >
              &larr;
            </Button>
          )}
          <span className="text-sm font-semibold">
            {t('scene.compareImages', { count: images.length })}
            {totalPages > 1 && (
              <span className="text-muted-foreground font-normal ml-2">
                {t('scene.page', { current: page + 1, total: totalPages })}
              </span>
            )}
          </span>
          {totalPages > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goNext}
              disabled={page === totalPages - 1}
            >
              &rarr;
            </Button>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
          &times;
        </Button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Desktop: horizontal layout */}
        <div className="hidden md:flex flex-1 items-stretch gap-2 p-3 min-h-0 overflow-hidden">
          {pageImages.map((img) => (
            <div key={img.id} className="flex-1 flex flex-col items-center min-h-0 min-w-0">
              <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
                <img
                  src={`/api/images/${img.filePath.replace('data/images/', '')}`}
                  alt=""
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              </div>
              <ImageMeta img={img} />
            </div>
          ))}
        </div>

        {/* Mobile: 2 images → vertical split, 3+ → horizontal scroll with snap */}
        <div className="flex md:hidden flex-1 min-h-0 overflow-hidden">
          {pageImages.length <= 2 ? (
            <div className="flex flex-col flex-1 items-stretch gap-2 p-3 min-h-0 overflow-hidden">
              {pageImages.map((img) => (
                <div key={img.id} className="flex-1 flex flex-col items-center min-h-0 min-w-0">
                  <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
                    <img
                      src={`/api/images/${img.filePath.replace('data/images/', '')}`}
                      alt=""
                      className="max-w-full max-h-full object-contain rounded-lg"
                    />
                  </div>
                  <ImageMeta img={img} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex overflow-x-auto snap-x snap-mandatory p-3 gap-3 min-h-0">
              {pageImages.map((img) => (
                <div
                  key={img.id}
                  className="snap-center shrink-0 w-[85vw] flex flex-col items-center min-h-0"
                >
                  <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
                    <img
                      src={`/api/images/${img.filePath.replace('data/images/', '')}`}
                      alt=""
                      className="max-w-full max-h-full object-contain rounded-lg"
                    />
                  </div>
                  <ImageMeta img={img} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ImageMeta({ img }: { img: CompareImage }) {
  const wins = img.tournamentWins ?? 0
  const losses = img.tournamentLosses ?? 0
  const hasWL = wins > 0 || losses > 0

  return (
    <div className="text-xs text-muted-foreground text-center py-1.5 shrink-0 flex items-center gap-2 justify-center flex-wrap">
      {img.seed != null && <span>seed: {img.seed}</span>}
      {hasWL && (
        <span>
          {wins}W-{losses}L ({winRate(wins, losses)})
        </span>
      )}
      {img.rating != null && img.rating > 0 && (
        <span>{'★'.repeat(img.rating)}</span>
      )}
      {img.isFavorite ? <span className="text-destructive">♥</span> : null}
    </div>
  )
}
