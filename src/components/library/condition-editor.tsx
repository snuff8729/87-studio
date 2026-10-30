import { HugeiconsIcon } from '@hugeicons/react'
import { FilterIcon } from '@hugeicons/core-free-icons'
import type { Condition, PartsAxis } from '@/lib/character-parts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** "View: Front, Side · Framing: Face" (only axes/values that still exist). */
export function conditionLabel(
  cond: Condition,
  axes: Array<PartsAxis>,
  noneLabel = '(none)',
): { label: string; broken: boolean } {
  const parts: Array<string> = []
  let broken = false
  for (const axis of axes) {
    const allowed = cond[String(axis.id)]
    if (!allowed) continue
    const names = axis.values
      .filter((v) => allowed.includes(v.id))
      .map((v) => v.name)
    if (names.length > 0) parts.push(`${axis.name}: ${names.join(', ')}`)
    else {
      // the axis exists but none of its allowed values do → never matches
      broken = true
      parts.push(`${axis.name}: ${noneLabel}`)
    }
  }
  return { label: parts.join(' · '), broken }
}

/**
 * Chip + popover that edits a condition: per axis a checkbox list.
 * Nothing checked for an axis = no restriction on that axis.
 */
export function ConditionEditor({
  condition,
  axes,
  onChange,
  prefix,
  className,
}: {
  condition: Condition
  /** Axes this condition may reference (global + the owner's locals) */
  axes: Array<PartsAxis>
  /** Receives an updater applied to the latest condition (no stale props) */
  onChange: (update: (cur: Condition) => Condition) => void
  /** Text before the label ("Only when") */
  prefix?: string
  className?: string
}) {
  const { t } = useTranslation()
  const { label, broken } = conditionLabel(
    condition,
    axes,
    t('library.conditionNone'),
  )

  function toggle(axis: PartsAxis, valueId: number, checked: boolean) {
    const key = String(axis.id)
    onChange((cur) => {
      const current = new Set(cur[key] ?? [])
      if (checked) current.add(valueId)
      else current.delete(valueId)
      const next: Condition = { ...cur }
      if (current.size === 0) delete next[key]
      else
        next[key] = axis.values
          .filter((v) => current.has(v.id))
          .map((v) => v.id)
      return next
    })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-7 max-w-full gap-1.5 px-2 text-xs',
            label && 'border-primary/40 bg-primary/10 text-primary',
            broken &&
              'border-destructive/50 bg-destructive/10 text-destructive',
            className,
          )}
          aria-label={t('library.condition')}
          data-condition-broken={broken || undefined}
        >
          <HugeiconsIcon icon={FilterIcon} strokeWidth={2} />
          <span className="truncate">
            {label
              ? `${prefix ? prefix + ' ' : ''}${label}`
              : t('library.always')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[70vh] w-72 gap-3 overflow-y-auto p-3"
        data-block-shortcuts
      >
        <div className="text-sm font-medium">{t('library.conditionTitle')}</div>
        {axes.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('library.noAxesForCondition')}
          </p>
        )}
        {axes.map((axis) => {
          const allowed = condition[String(axis.id)] ?? []
          return (
            <div key={axis.id} className="space-y-1.5">
              <div className="text-xs text-muted-foreground">{axis.name}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {axis.values.map((v) => (
                  <Label
                    key={v.id}
                    className="flex cursor-pointer items-center gap-1.5 text-sm font-normal"
                  >
                    <Checkbox
                      checked={allowed.includes(v.id)}
                      onCheckedChange={(c) => toggle(axis, v.id, c === true)}
                    />
                    {v.name}
                  </Label>
                ))}
              </div>
            </div>
          )
        })}
        <p className="text-xs text-muted-foreground">
          {t('library.conditionHint')}
        </p>
        {label && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => onChange(() => ({}))}
          >
            {t('library.clearCondition')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
