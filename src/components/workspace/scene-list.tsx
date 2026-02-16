import { HugeiconsIcon } from '@hugeicons/react'
import { Image02Icon } from '@hugeicons/core-free-icons'
import { NumberStepper } from '@/components/ui/number-stepper'

interface SceneListProps {
  scenePacks: Array<{
    id: number
    name: string
    scenes: Array<{
      id: number
      name: string
      placeholders: string | null
      recentImageCount: number
      thumbnailPath: string | null
    }>
  }>
  onSelectScene: (id: number) => void
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
}

export function SceneList({
  scenePacks,
  onSelectScene,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
}: SceneListProps) {
  if (scenePacks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <p className="text-sm text-muted-foreground mb-1">No scene packs assigned</p>
        <p className="text-xs text-muted-foreground">
          Use the Scene Packs button in the bottom toolbar to import scenes.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      {scenePacks.map((pack) => (
        <div key={pack.id}>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {pack.name}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {pack.scenes.map((scene) => {
              const placeholders = JSON.parse(scene.placeholders || '{}')
              const placeholderCount = Object.keys(placeholders).length
              const sceneId = scene.id

              return (
                <div
                  key={scene.id}
                  className="rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent/50 transition-colors group overflow-hidden"
                >
                  <button
                    onClick={() => onSelectScene(scene.id)}
                    className="w-full text-left"
                  >
                    {scene.thumbnailPath ? (
                      <div className="aspect-[3/2] bg-secondary overflow-hidden">
                        <img
                          src={`/api/thumbnails/${scene.thumbnailPath.replace('data/thumbnails/', '')}`}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="aspect-[3/2] bg-secondary/40 flex items-center justify-center">
                        <HugeiconsIcon icon={Image02Icon} className="size-6 text-muted-foreground/20" />
                      </div>
                    )}
                    <div className="p-2 pb-1">
                      <div className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                        {scene.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {placeholderCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {placeholderCount} placeholder{placeholderCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {scene.recentImageCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <HugeiconsIcon icon={Image02Icon} className="size-3" />
                            {scene.recentImageCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="px-2 pb-2 pt-0 flex items-center gap-1.5">
                    <NumberStepper
                      value={sceneCounts[sceneId] ?? null}
                      onChange={(v) => {
                        // Clicking stops propagation implicitly (not a link)
                        onSceneCountChange(sceneId, v)
                      }}
                      min={0}
                      max={100}
                      placeholder={String(defaultCount)}
                    />
                    {sceneCounts[sceneId] != null && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSceneCountChange(sceneId, null)
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        title="Reset to default"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
