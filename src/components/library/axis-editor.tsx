import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { CommitInput } from './commit-input'
import type { PartsAxis } from '@/lib/character-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  createAxisValue,
  deleteAxis,
  deleteAxisValue,
  renameAxis,
  renameAxisValue,
  reorderAxisValues,
} from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'

/** Rename an axis, edit its values (add / rename / delete / reorder), delete it. */
export function AxisEditor({
  axis,
  onDeleted,
  hideName,
}: {
  axis: PartsAxis
  onDeleted?: () => void
  /** The caller already shows/edits the axis name */
  hideName?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [newValue, setNewValue] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })
  const onError = (e: Error) => toast.error(e.message || t('library.failed'))

  const rename = useMutation({
    mutationFn: (name: string) => renameAxis({ data: { id: axis.id, name } }),
    onSuccess: refresh,
    onError,
  })
  const addValue = useMutation({
    mutationFn: (name: string) =>
      createAxisValue({ data: { axisId: axis.id, name } }),
    onSuccess: () => {
      setNewValue('')
      return refresh()
    },
    onError,
  })
  const renameValue = useMutation({
    mutationFn: (v: { id: number; name: string }) =>
      renameAxisValue({ data: v }),
    onSuccess: refresh,
    onError,
  })
  const removeValue = useMutation({
    mutationFn: (id: number) => deleteAxisValue({ data: id }),
    onSuccess: refresh,
    onError,
  })
  const reorder = useMutation({
    mutationFn: (ids: Array<number>) => reorderAxisValues({ data: { ids } }),
    onSuccess: refresh,
    onError,
  })
  const remove = useMutation({
    mutationFn: () => deleteAxis({ data: axis.id }),
    onSuccess: () => {
      void refresh()
      onDeleted?.()
    },
    onError,
  })

  function move(index: number, dir: -1 | 1) {
    const ids = axis.values.map((v) => v.id)
    const target = index + dir
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate(ids)
  }

  function submitNew() {
    const name = newValue.trim()
    if (name) addValue.mutate(name)
  }

  return (
    <div className="space-y-3">
      {!hideName && (
        <CommitInput
          value={axis.name}
          onCommit={(name) => rename.mutate(name)}
          aria-label={t('library.renameAxis')}
          className="h-8 text-sm font-medium"
        />
      )}
      <ul className="space-y-1">
        {axis.values.map((v, i) => (
          <li key={v.id} className="flex items-center gap-1">
            <CommitInput
              value={v.name}
              onCommit={(name) => renameValue.mutate({ id: v.id, name })}
              aria-label={t('library.valueName')}
              className="h-7 min-w-0 flex-1 text-sm"
            />
            {i === 0 && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {t('library.defaultBadge')}
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={t('library.moveUp')}
            >
              <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={i === axis.values.length - 1}
              onClick={() => move(i, 1)}
              aria-label={t('library.moveDown')}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={axis.values.length <= 1}
              onClick={() => removeValue.mutate(v.id)}
              aria-label={t('library.deleteValue')}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitNew()
            }
          }}
          placeholder={t('library.addValue')}
          aria-label={t('library.addValue')}
          className="h-7 flex-1 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!newValue.trim() || addValue.isPending}
          onClick={submitNew}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          {t('common.add')}
        </Button>
      </div>
      <ConfirmDialog
        title={t('library.deleteTitle', { name: axis.name })}
        description={t('library.deleteAxisDesc')}
        onConfirm={async () => {
          await remove.mutateAsync()
        }}
        trigger={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            {t('library.deleteAxis')}
          </Button>
        }
      />
    </div>
  )
}
