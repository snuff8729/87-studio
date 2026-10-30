import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { selectAllState } from '@/components/workspace/scene-selection'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export const SELECTION_ICON_BUTTON =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

/**
 * Selection header rendered into the app header (via `HeaderActions`) while
 * a browse page is in select mode: exit, select-all, "{n} selected", then
 * page-specific actions as children.
 */
export function SelectionBar({
  count,
  total,
  onExit,
  onToggleAll,
  selectAllLabel,
  deselectAllLabel,
  children,
  className,
}: {
  count: number
  total: number
  onExit: () => void
  onToggleAll: () => void
  /** Overrides the select-all tooltip / aria label (e.g. "Select loaded") */
  selectAllLabel?: string
  deselectAllLabel?: string
  children?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const state = selectAllState(count, total)
  return (
    <div
      data-selection-header
      className={cn('flex min-w-0 flex-1 items-center gap-0.5', className)}
    >
      <button
        type="button"
        onClick={onExit}
        className={SELECTION_ICON_BUTTON}
        title={t('common.exitSelectMode')}
        aria-label={t('common.exitSelectMode')}
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </button>
      <Checkbox
        checked={
          state === 'all' ? true : state === 'some' ? 'indeterminate' : false
        }
        onCheckedChange={onToggleAll}
        disabled={total === 0}
        aria-label={selectAllLabel ?? t('common.selectAll')}
        title={
          state === 'all'
            ? (deselectAllLabel ?? t('common.deselectAll'))
            : (selectAllLabel ?? t('common.selectAll'))
        }
        className="mx-1"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium whitespace-nowrap">
        {t('common.selectedCount', { count })}
      </span>
      {children}
    </div>
  )
}
