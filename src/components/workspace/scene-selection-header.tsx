import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  Delete02Icon,
  Download04Icon,
  FileExportIcon,
  Layers01Icon,
  MoreVerticalIcon,
  RotateLeft01Icon,
} from '@hugeicons/core-free-icons'
import { ReserveStepper } from './scene-card'
import { selectAllState } from './scene-selection'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const ICON_BUTTON =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

/**
 * Header shown while scenes are being selected (rail, board and selection
 * grid). One line: exit, select-all, "{n} selected", then icon actions that
 * are disabled while nothing is checked.
 */
export function SceneSelectionHeader({
  count,
  total,
  onExit,
  onToggleAll,
  onApplyCount,
  onResetCount,
  onSaveTemplate,
  onDelete,
  renderExport,
  end,
  className,
}: {
  /** Checked (visible) scenes */
  count: number
  /** Visible scenes */
  total: number
  onExit: () => void
  /** Checks every visible scene, or clears when all are checked */
  onToggleAll: () => void
  onApplyCount: (count: number) => void
  onResetCount: () => void
  onSaveTemplate: () => void
  onDelete: () => Promise<void> | void
  /** Wraps the export trigger in the export dialog (omitted = no export) */
  renderExport?: (trigger: ReactNode) => ReactNode
  /** Trailing slot (e.g. the card size slider) */
  end?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const [countOpen, setCountOpen] = useState(false)
  const [bulkCount, setBulkCount] = useState(1)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const empty = count === 0
  const state = selectAllState(count, total)

  const exportTrigger = (
    <button
      type="button"
      className={ICON_BUTTON}
      title={t('export.export')}
      aria-label={t('export.export')}
      disabled={empty}
    >
      <HugeiconsIcon icon={Download04Icon} className="size-4" />
    </button>
  )

  return (
    <div
      data-selection-header
      className={cn(
        'flex h-10 shrink-0 items-center gap-0.5 border-b bg-primary/10 px-1.5',
        className,
      )}
    >
      <button
        type="button"
        onClick={onExit}
        className={ICON_BUTTON}
        title={t('scene.exitSelectMode')}
        aria-label={t('scene.exitSelectMode')}
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </button>
      <Checkbox
        checked={
          state === 'all' ? true : state === 'some' ? 'indeterminate' : false
        }
        onCheckedChange={onToggleAll}
        disabled={total === 0}
        aria-label={t('scene.selectAllToggle')}
        title={state === 'all' ? t('scene.deselectAll') : t('scene.selectAll')}
        className="mx-1"
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium whitespace-nowrap">
        {t('scene.selectedCount', { count })}
      </span>

      <Popover open={countOpen} onOpenChange={setCountOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={ICON_BUTTON}
            title={t('scene.setCountTitle')}
            aria-label={t('scene.setCountTitle')}
            disabled={empty}
          >
            <HugeiconsIcon icon={Layers01Icon} className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto gap-2 p-2">
          <div className="text-xs text-muted-foreground">
            {t('scene.setCountTitle')}
          </div>
          <div className="flex items-center gap-2">
            <ReserveStepper
              value={bulkCount}
              onChange={setBulkCount}
              size="xs"
            />
            <Button
              size="xs"
              onClick={() => {
                onApplyCount(bulkCount)
                setCountOpen(false)
              }}
            >
              {t('scene.setCountApply')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {renderExport && !empty ? renderExport(exportTrigger) : exportTrigger}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={ICON_BUTTON}
            title={t('scene.selectionActions')}
            aria-label={t('scene.selectionActions')}
            disabled={empty}
          >
            <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem onSelect={() => setTimeout(onSaveTemplate, 0)}>
            <HugeiconsIcon icon={FileExportIcon} />
            {t('scene.convertToTemplate')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onResetCount}>
            <HugeiconsIcon icon={RotateLeft01Icon} />
            {t('scene.resetCount')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setTimeout(() => setDeleteOpen(true), 0)}
          >
            <HugeiconsIcon icon={Delete02Icon} />
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {end}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('scene.bulkDelete')}
        description={t('scene.bulkDeleteDesc', { count })}
        onConfirm={onDelete}
      />
    </div>
  )
}

/** Compact rail (56px): only the exit button and the count. */
export function CompactSelectionHeader({
  count,
  onExit,
}: {
  count: number
  onExit: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      data-selection-header
      className="flex shrink-0 flex-col items-center gap-1 border-b bg-primary/10 py-1.5"
    >
      <button
        type="button"
        onClick={onExit}
        className={ICON_BUTTON}
        title={t('scene.exitSelectMode')}
        aria-label={t('scene.exitSelectMode')}
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </button>
      <span
        className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[10px] leading-4 font-medium text-primary-foreground tabular-nums"
        title={t('scene.selectedCount', { count })}
      >
        {count}
      </span>
    </div>
  )
}
