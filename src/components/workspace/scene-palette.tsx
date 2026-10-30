import { HugeiconsIcon } from '@hugeicons/react'
import { Image02Icon } from '@hugeicons/core-free-icons'
import { sceneThumbnailUrl } from './scene-card'
import type { RailPack } from './scene-rail'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export interface ScenePaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** All scenes grouped by pack (sorted, unfiltered). */
  packs: Array<RailPack>
  sceneCounts: Record<number, number>
  defaultCount: number
  selectedSceneId: number | null
  onSelect: (sceneId: number) => void
}

/** Ctrl/Cmd+K "go to scene": fuzzy search over scene + pack names. */
export function ScenePalette({
  open,
  onOpenChange,
  packs,
  sceneCounts,
  defaultCount,
  selectedSceneId,
  onSelect,
}: ScenePaletteProps) {
  const { t } = useTranslation()

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('sceneRail.paletteTitle')}
      description={t('sceneRail.paletteDescription')}
      className="sm:max-w-lg"
    >
      <CommandInput placeholder={t('sceneRail.palettePlaceholder')} />
      <CommandList className="max-h-[min(24rem,60vh)]">
        <CommandEmpty>{t('sceneRail.paletteEmpty')}</CommandEmpty>
        {packs.map((pack) => (
          <CommandGroup key={pack.id} heading={pack.name}>
            {pack.scenes.map((scene) => {
              const count = sceneCounts[scene.id] ?? defaultCount
              return (
                <CommandItem
                  key={scene.id}
                  // Unique per scene; the id sits behind a separator nobody types
                  value={`${scene.name}\u001f${scene.id}`}
                  keywords={[pack.name]}
                  data-checked={scene.id === selectedSceneId}
                  onSelect={() => {
                    onSelect(scene.id)
                    onOpenChange(false)
                  }}
                >
                  <div className="flex h-7 w-5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-secondary/50">
                    {scene.thumbnailPath ? (
                      <img
                        src={sceneThumbnailUrl(scene.thumbnailPath)}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <HugeiconsIcon
                        icon={Image02Icon}
                        className="size-3 text-muted-foreground/30"
                      />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate">{scene.name}</span>
                  <span
                    className={cn(
                      'shrink-0 text-xs tabular-nums',
                      count > 0 ? 'text-primary' : 'text-muted-foreground/60',
                    )}
                  >
                    ×{count}
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
