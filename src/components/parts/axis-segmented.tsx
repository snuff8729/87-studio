import { ToggleGroup } from 'radix-ui'
import type { PartsAxis } from '@/lib/character-parts'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

const INHERIT = '__inherit__'

interface AxisSegmentedProps {
  axis: PartsAxis
  /** Selected value id; null = inherit (only meaningful with inheritLabel) */
  value: number | null
  onChange: (v: number | null) => void
  /** Adds a first "inherit" option with this label (e.g. "Scene", "Default") */
  inheritLabel?: string
  /** Marks the axis' first value with a "default" badge */
  defaultBadge?: boolean
  className?: string
}

/** One axis as a segmented control. Wraps on narrow screens. */
export function AxisSegmented({
  axis,
  value,
  onChange,
  inheritLabel,
  defaultBadge,
  className,
}: AxisSegmentedProps) {
  const { t } = useTranslation()
  const current =
    value === null || !axis.values.some((v) => v.id === value)
      ? inheritLabel
        ? INHERIT
        : ''
      : String(value)

  const itemClass = cn(
    'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap',
    'text-muted-foreground transition-colors hover:text-foreground',
    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'data-[state=on]:bg-primary/15 data-[state=on]:text-primary',
  )

  return (
    <div
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5', className)}
    >
      <span className="min-w-14 text-xs text-muted-foreground">
        {axis.name}
      </span>
      <ToggleGroup.Root
        type="single"
        value={current}
        onValueChange={(v) => {
          // Radix emits '' when the active item is clicked again: keep it
          if (!v) return
          onChange(v === INHERIT ? null : Number(v))
        }}
        aria-label={axis.name}
        className="inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-input/30 p-0.5"
      >
        {inheritLabel && (
          <ToggleGroup.Item value={INHERIT} className={itemClass}>
            {inheritLabel}
          </ToggleGroup.Item>
        )}
        {axis.values.map((v, i) => (
          <ToggleGroup.Item
            key={v.id}
            value={String(v.id)}
            className={itemClass}
          >
            {v.name}
            {defaultBadge && i === 0 && (
              <Badge
                variant="outline"
                className="h-4 px-1 text-[10px] font-normal"
              >
                {t('parts.default')}
              </Badge>
            )}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  )
}
