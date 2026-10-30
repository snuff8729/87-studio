import { groupAreas } from '@/lib/character-parts'
import { cn } from '@/lib/utils'

export type AreaOption = {
  id: number
  name: string
  parentId?: number | null
}

/** Area ids in tree order (parent, then its children). */
export function areaOrder(areas: Array<AreaOption>): Array<number> {
  return groupAreas(areas).flatMap((g) => [
    g.area.id,
    ...g.children.map((c) => c.id),
  ])
}

function Chip({
  area,
  on,
  onToggle,
  child,
}: {
  area: AreaOption
  on: boolean
  onToggle: (id: number) => void
  child?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-area-chip={area.id}
      data-area-child={child ? '' : undefined}
      onClick={() => onToggle(area.id)}
      className={cn(
        'h-7 rounded-lg border px-2.5 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        on
          ? 'border-primary/40 bg-primary/15 text-primary'
          : 'border-border bg-input/30 text-muted-foreground hover:text-foreground',
      )}
    >
      {area.name}
    </button>
  )
}

/**
 * Multi-select chips over the body areas; children are grouped right after
 * their parent (covering a parent also covers its children).
 */
export function AreaChips({
  areas,
  selected,
  onToggle,
  label,
}: {
  areas: Array<AreaOption>
  selected: Array<number>
  onToggle: (id: number) => void
  label: string
}) {
  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-1.5"
      role="group"
      aria-label={label}
    >
      {groupAreas(areas).map(({ area, children }) => (
        <div
          key={area.id}
          className="flex flex-wrap items-center gap-1.5"
          data-area-group={area.id}
        >
          <Chip
            area={area}
            on={selected.includes(area.id)}
            onToggle={onToggle}
          />
          {children.length > 0 && (
            <span className="text-xs text-muted-foreground/60" aria-hidden>
              ›
            </span>
          )}
          {children.map((c) => (
            <Chip
              key={c.id}
              area={c}
              child
              on={selected.includes(c.id)}
              onToggle={onToggle}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
