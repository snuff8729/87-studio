import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import type { GridSize } from '@/lib/use-image-grid-size'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { WIN_RATE_PRESETS } from '@/lib/win-rate'
import { useTranslation } from '@/lib/i18n'

import type { GalleryFilters, GallerySort } from '@/lib/gallery-filters'

export type { GalleryFilters, GallerySort }

export const GRID_SIZES: Array<GridSize> = ['sm', 'md', 'lg']

type Option = { id: number; name: string }

/** Filters that appear as removable chips (sort is its own control). */
export function activeFilterCount(f: GalleryFilters) {
  return [
    f.project,
    f.projectSceneId,
    f.tag,
    f.bundle,
    f.favorite,
    f.minRating,
    f.minWinRate,
    f.quick,
  ].filter(Boolean).length
}

function Chip({
  kind,
  label,
  onRemove,
}: {
  kind: string
  label: string
  onRemove: () => void
}) {
  const { t } = useTranslation()
  return (
    <span
      data-filter-chip={kind}
      className="inline-flex h-7 max-w-48 items-center gap-1 rounded-full bg-primary/15 pr-1 pl-2.5 text-xs font-medium text-primary"
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('gallery.removeFilter', { name: label })}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full hover:bg-primary/20"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
      </button>
    </span>
  )
}

/**
 * Filter chip row under the app header: active filter chips, a "+ Filter"
 * menu, and on the right the sort select and card size slider.
 */
export function GalleryToolbar({
  filters,
  projects,
  scenes,
  tags,
  bundles,
  gridSize,
  onGridSizeChange,
  onChange,
  onClear,
}: {
  filters: GalleryFilters
  projects: Array<Option>
  scenes: Array<Option>
  tags: Array<Option>
  bundles: Array<Option>
  gridSize: GridSize
  onGridSizeChange: (size: GridSize) => void
  /** Merges a partial filter set; `undefined` values remove a filter */
  onChange: (patch: Partial<GalleryFilters>) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const projectName = projects.find((p) => p.id === filters.project)?.name
  const sceneName = scenes.find((s) => s.id === filters.projectSceneId)?.name
  const tagName = tags.find((x) => x.id === filters.tag)?.name
  const bundleName = bundles.find((x) => x.id === filters.bundle)?.name
  const chipCount = activeFilterCount(filters)

  return (
    <div
      data-gallery-toolbar
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      {filters.quick && (
        <Chip
          kind="quick"
          label={t('gallery.quickGenerate')}
          onRemove={() => onChange({ quick: undefined })}
        />
      )}
      {filters.project && (
        <Chip
          kind="project"
          label={projectName ?? String(filters.project)}
          onRemove={() =>
            onChange({ project: undefined, projectSceneId: undefined })
          }
        />
      )}
      {filters.projectSceneId && (
        <Chip
          kind="scene"
          label={sceneName ?? String(filters.projectSceneId)}
          onRemove={() => onChange({ projectSceneId: undefined })}
        />
      )}
      {filters.favorite && (
        <Chip
          kind="favorite"
          label={t('gallery.favorites')}
          onRemove={() => onChange({ favorite: undefined })}
        />
      )}
      {filters.minRating && (
        <Chip
          kind="rating"
          label={t('gallery.starsPlus', { count: filters.minRating })}
          onRemove={() => onChange({ minRating: undefined })}
        />
      )}
      {filters.minWinRate && (
        <Chip
          kind="winrate"
          label={t('gallery.winRatePlus', { count: filters.minWinRate })}
          onRemove={() => onChange({ minWinRate: undefined })}
        />
      )}
      {filters.bundle && (
        <Chip
          kind="bundle"
          label={bundleName ?? String(filters.bundle)}
          onRemove={() => onChange({ bundle: undefined })}
        />
      )}
      {filters.tag && (
        <Chip
          kind="tag"
          label={tagName ?? String(filters.tag)}
          onRemove={() => onChange({ tag: undefined })}
        />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-dashed text-xs"
            data-add-filter
          >
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            {t('gallery.addFilter')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-44">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-filter-menu="project">
              {t('gallery.filterProject')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              <DropdownMenuItem
                onSelect={() =>
                  onChange({
                    quick: true,
                    project: undefined,
                    projectSceneId: undefined,
                  })
                }
              >
                {t('gallery.quickGenerate')}
                {filters.quick && <HugeiconsIcon icon={Tick02Icon} />}
              </DropdownMenuItem>
              {projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  data-filter-option={`project-${p.id}`}
                  onSelect={() =>
                    onChange({
                      project: p.id,
                      projectSceneId: undefined,
                      quick: undefined,
                    })
                  }
                >
                  {p.name}
                  {filters.project === p.id && (
                    <HugeiconsIcon icon={Tick02Icon} />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {filters.project && scenes.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {t('gallery.filterScene')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {scenes.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() => onChange({ projectSceneId: s.id })}
                  >
                    {s.name}
                    {filters.projectSceneId === s.id && (
                      <HugeiconsIcon icon={Tick02Icon} />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuItem
            data-filter-option="favorite"
            onSelect={() =>
              onChange({ favorite: filters.favorite ? undefined : true })
            }
          >
            {t('gallery.favorites')}
            {filters.favorite && <HugeiconsIcon icon={Tick02Icon} />}
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {t('gallery.filterRating')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {[1, 2, 3, 4, 5].map((r) => (
                <DropdownMenuItem
                  key={r}
                  onSelect={() => onChange({ minRating: r })}
                >
                  {t('gallery.starsPlus', { count: r })}
                  {filters.minRating === r && (
                    <HugeiconsIcon icon={Tick02Icon} />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-filter-menu="winrate">
              {t('gallery.filterWinRate')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {WIN_RATE_PRESETS.map((p) => (
                <DropdownMenuItem
                  key={p}
                  data-filter-option={`winrate-${p}`}
                  onSelect={() => onChange({ minWinRate: p })}
                >
                  {t('gallery.winRatePlus', { count: p })}
                  {filters.minWinRate === p && (
                    <HugeiconsIcon icon={Tick02Icon} />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {bundles.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-filter-menu="bundle">
                {t('gallery.filterBundle')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {bundles.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    data-filter-option={`bundle-${b.id}`}
                    onSelect={() => onChange({ bundle: b.id })}
                  >
                    {b.name}
                    {filters.bundle === b.id && (
                      <HugeiconsIcon icon={Tick02Icon} />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {tags.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {t('gallery.filterTag')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {tags.map((x) => (
                  <DropdownMenuItem
                    key={x.id}
                    onSelect={() => onChange({ tag: x.id })}
                  >
                    {x.name}
                    {filters.tag === x.id && (
                      <HugeiconsIcon icon={Tick02Icon} />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {chipCount > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onClear}
          data-clear-filters
        >
          {t('common.clear')}
        </Button>
      )}

      <div className="ml-auto flex items-center gap-3">
        <Select
          value={filters.sortBy ?? 'newest'}
          onValueChange={(v) =>
            onChange({
              sortBy: v === 'newest' ? undefined : (v as GallerySort),
            })
          }
        >
          <SelectTrigger
            size="sm"
            className="h-7 text-xs"
            aria-label={t('gallery.sort')}
            data-gallery-sort
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t('gallery.newestFirst')}</SelectItem>
            <SelectItem value="oldest">{t('gallery.oldestFirst')}</SelectItem>
            <SelectItem value="rating">{t('gallery.highestRated')}</SelectItem>
            <SelectItem value="favorites">
              {t('gallery.favoritesFirst')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Slider
          className="w-16"
          min={0}
          max={GRID_SIZES.length - 1}
          step={1}
          value={[GRID_SIZES.indexOf(gridSize)]}
          onValueChange={([v]) => onGridSizeChange(GRID_SIZES[v] ?? 'md')}
          aria-label={t('sceneView.imageSize')}
          title={t('sceneView.imageSize')}
          data-gallery-size
        />
      </div>
    </div>
  )
}
