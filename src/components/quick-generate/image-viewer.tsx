import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, Image02Icon } from '@hugeicons/core-free-icons'
import { useTranslation } from '@/lib/i18n'

interface ViewerImage {
  id: number
  filePath: string
  seed: number | null
  isFavorite: number | null
  rating: number | null
  metadata: string | null
}

interface ImageViewerProps {
  image: ViewerImage | null
  imageParams: Record<string, unknown> | null
  onToggleFavorite: () => void
  onSetRating: (rating: number) => void
  /** Newer image in history (ArrowUp / ArrowLeft) */
  onPrev?: () => void
  /** Older image in history (ArrowDown / ArrowRight) */
  onNext?: () => void
  generating?: boolean
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.closest('.cm-editor') !== null
  )
}

export function ImageViewer({
  image,
  imageParams,
  onToggleFavorite,
  onSetRating,
  onPrev,
  onNext,
  generating,
}: ImageViewerProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Keep latest handlers in a ref so the listener is attached once
  const handlersRef = useRef({
    onToggleFavorite,
    onSetRating,
    onPrev,
    onNext,
    hasImage: !!image,
  })
  handlersRef.current = {
    onToggleFavorite,
    onSetRating,
    onPrev,
    onNext,
    hasImage: !!image,
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      const h = handlersRef.current

      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          if (h.onPrev) {
            e.preventDefault()
            h.onPrev()
          }
          return
        case 'ArrowDown':
        case 'ArrowRight':
          if (h.onNext) {
            e.preventDefault()
            h.onNext()
          }
          return
        case 'f':
        case 'F':
          if (h.hasImage) {
            e.preventDefault()
            h.onToggleFavorite()
          }
          return
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          if (h.hasImage) {
            e.preventDefault()
            h.onSetRating(Number(e.key))
          }
          return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  async function copySeed(seed: number) {
    try {
      await navigator.clipboard.writeText(String(seed))
      toast.success(t('quickGenerate.seedCopied'))
    } catch {
      /* clipboard unavailable */
    }
  }

  if (!image) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        {generating && <GeneratingLine />}
        <HugeiconsIcon
          icon={Image02Icon}
          className="size-12 text-muted-foreground/30"
        />
        <p className="text-sm">{t('quickGenerate.emptyState')}</p>
      </div>
    )
  }

  const width = imageParams?.width as number | undefined
  const height = imageParams?.height as number | undefined

  return (
    <div className="relative flex flex-col h-full">
      {generating && <GeneratingLine />}

      {/* Image */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0 bg-[radial-gradient(ellipse_at_center,var(--secondary)_0%,transparent_70%)]">
        <img
          src={`/api/images/${image.filePath.replace('data/images/', '')}`}
          alt=""
          className="max-h-full max-w-full object-contain rounded"
          draggable={false}
        />
      </div>

      {/* Info bar */}
      <div className="shrink-0 border-t border-border px-4 h-9 flex items-center gap-3 text-sm">
        {/* Favorite */}
        <button onClick={onToggleFavorite} className="transition-colors">
          <span
            className={
              image.isFavorite
                ? 'text-destructive'
                : 'text-muted-foreground hover:text-destructive'
            }
          >
            {image.isFavorite ? '❤' : '♡'}
          </span>
        </button>

        {/* Rating */}
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              onClick={() => onSetRating(r)}
              className={`text-sm transition-colors ${
                (image.rating ?? 0) >= r
                  ? 'text-primary'
                  : 'text-muted-foreground/30 hover:text-primary/50'
              }`}
            >
              {'★'}
            </button>
          ))}
        </div>

        <div className="h-3 w-px bg-border" />

        {/* Seed (click to copy) */}
        {image.seed != null && (
          <button
            type="button"
            onClick={() => copySeed(image.seed as number)}
            className="text-xs text-muted-foreground tabular-nums hover:text-primary transition-colors cursor-pointer"
          >
            {t('quickGenerate.seed')}: {image.seed}
          </button>
        )}

        {/* Resolution */}
        {width && height && (
          <>
            <div className="h-3 w-px bg-border" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {width} x {height}
            </span>
          </>
        )}

        <div className="flex-1" />

        {/* Details overlay */}
        <button
          onClick={() =>
            navigate({
              search: (prev: Record<string, unknown>) => ({
                ...prev,
                imageDetail: image.id,
              }),
            } as any)
          }
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 cursor-pointer"
        >
          {t('imageDetail.details')}
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function GeneratingLine() {
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 top-0 h-0.5 overflow-hidden z-10"
    >
      <div className="h-full w-full bg-brand-gradient" />
    </div>
  )
}
