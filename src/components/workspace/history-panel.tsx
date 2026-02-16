import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'

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
  return (
    <div className="p-2 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          History
        </h3>
        <span className="text-xs text-muted-foreground">{images.length}</span>
      </div>

      {images.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground text-center">No images yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          <div className="grid grid-cols-2 gap-1">
            {images.map((img) => (
              <Link
                key={img.id}
                to="/gallery/$imageId"
                params={{ imageId: String(img.id) }}
                search={{ project: projectId }}
                className="relative aspect-square rounded-md overflow-hidden bg-secondary group block"
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
      )}

      <div className="mt-2 pt-2 border-t border-border">
        <Link
          to="/gallery"
          search={{ project: projectId }}
          className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          Full gallery
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Link>
      </div>
    </div>
  )
}
