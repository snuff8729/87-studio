import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  FilterHorizontalIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { SCENE_FILTERS } from './scene-filters'
import type { SceneFilter, SceneFilterCounts } from './scene-filters'
import type { TranslationKeys } from '@/lib/i18n/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const FILTER_LABEL_KEYS: Record<SceneFilter, TranslationKeys> = {
  all: 'sceneRail.filterAll',
  reserved: 'sceneRail.filterReserved',
  noImages: 'sceneRail.filterNoImages',
}

/**
 * Scene search input with the filter inside it: an icon button while the
 * filter is "All", a label chip once a filter is active. Shared by the rail
 * and the board toolbar.
 */
export function SceneSearchFilter({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  counts,
  className,
}: {
  query: string
  onQueryChange: (q: string) => void
  filter: SceneFilter
  onFilterChange: (filter: SceneFilter) => void
  counts: SceneFilterCounts
  className?: string
}) {
  const { t } = useTranslation()
  const active = filter !== 'all'

  return (
    <InputGroup className={cn('h-7', className)}>
      <InputGroupAddon>
        <HugeiconsIcon icon={Search01Icon} className="size-3.5" />
      </InputGroupAddon>
      <InputGroupInput
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && query) {
            e.stopPropagation()
            onQueryChange('')
          }
        }}
        placeholder={t('scene.searchPlaceholder')}
        aria-label={t('scene.searchScenes')}
        className="h-7 px-0 text-xs"
      />
      {query && (
        <InputGroupAddon align="inline-end">
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="text-muted-foreground hover:text-foreground"
            aria-label={t('common.clear')}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          </button>
        </InputGroupAddon>
      )}
      <InputGroupAddon align="inline-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-scene-filter
              data-active={active || undefined}
              title={t('sceneRail.filterMenu')}
              aria-label={t('sceneRail.filterMenu')}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full transition-colors',
                active
                  ? 'h-5 bg-primary/15 px-2 text-[11px] whitespace-nowrap text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active ? (
                t(FILTER_LABEL_KEYS[filter])
              ) : (
                <HugeiconsIcon
                  icon={FilterHorizontalIcon}
                  className="size-3.5"
                />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-40">
            <DropdownMenuRadioGroup
              value={filter}
              onValueChange={(v) => onFilterChange(v as SceneFilter)}
            >
              {SCENE_FILTERS.map((f) => (
                <DropdownMenuRadioItem key={f} value={f}>
                  {t(FILTER_LABEL_KEYS[f])}
                  <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                    {counts[f]}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </InputGroupAddon>
    </InputGroup>
  )
}
