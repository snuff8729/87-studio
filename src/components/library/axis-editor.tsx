import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon } from '@hugeicons/core-free-icons'
import type { QueryClient } from '@tanstack/react-query'
import type { PartsAxis } from '@/lib/character-parts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DragHandle,
  RowRemoveButton,
  SortableList,
  SortableRow,
} from '@/components/common/sortable-list/sortable-list'
import { InlineName } from '@/components/common/sortable-list/inline-name'
import { AddNameRow } from '@/components/common/sortable-list/add-row'
import { useSortableOrder } from '@/components/common/sortable-list/use-sortable-order'
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

interface CachedLibrary {
  items?: Array<{
    id: number
    conditions?: Record<string, Array<number>>
    fragments: Array<{ id: number; conditions: Record<string, Array<number>> }>
  }>
  characters?: Array<{
    fragments: Array<{ id: number; conditions: Record<string, Array<number>> }>
  }>
}

/** Fragments + items (from the cached library queries) that allow this value. */
function countValueRefs(
  qc: QueryClient,
  axisId: number,
  valueId: number,
): number {
  const key = String(axisId)
  const frags = new Set<number>()
  const items = new Set<number>()
  for (const [, data] of qc.getQueriesData<CachedLibrary>({
    queryKey: ['library'],
  })) {
    for (const owner of [...(data?.characters ?? []), ...(data?.items ?? [])])
      for (const f of owner.fragments)
        if (f.conditions[key]?.includes(valueId)) frags.add(f.id)
    for (const i of data?.items ?? [])
      if (i.conditions?.[key]?.includes(valueId)) items.add(i.id)
  }
  return frags.size + items.size
}

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
    onSuccess: refresh,
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
  const remove = useMutation({
    mutationFn: () => deleteAxis({ data: axis.id }),
    onSuccess: () => {
      void refresh()
      onDeleted?.()
    },
    onError,
  })

  const order = useSortableOrder(
    axis.values,
    (v) => v.id,
    async (ids) => {
      await reorderAxisValues({ data: { ids: ids as Array<number> } })
      await refresh()
    },
    () => toast.error(t('library.failed')),
  )

  return (
    <div className="space-y-3" data-axis-editor>
      {!hideName && (
        <InlineName
          value={axis.name}
          onCommit={(name) => rename.mutate(name)}
          ariaLabel={t('library.renameAxis')}
          className="h-8 text-sm font-medium"
        />
      )}
      <div className="max-w-[32rem]">
        <SortableList ids={order.ids} onReorder={(ids) => order.reorder(ids)}>
          <ul className="space-y-0.5">
            {order.items.map((v, i) => (
              <SortableRow
                as="li"
                key={v.id}
                id={v.id}
                data-value-row
                className="flex h-8 items-center gap-1 rounded-lg px-0.5 hover:bg-secondary/30"
              >
                <DragHandle label={t('common.dragToReorder')} />
                <InlineName
                  value={v.name}
                  onCommit={(name) => renameValue.mutate({ id: v.id, name })}
                  ariaLabel={t('library.valueName')}
                />
                {i === 0 && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {t('library.defaultBadge')}
                  </Badge>
                )}
                <ConfirmDialog
                  title={t('library.deleteValueTitle', { name: v.name })}
                  description={(() => {
                    const n = countValueRefs(qc, axis.id, v.id)
                    return n > 0
                      ? t('library.deleteValueDesc', { count: n })
                      : t('library.deleteValueDescNone')
                  })()}
                  onConfirm={async () => {
                    await removeValue.mutateAsync(v.id)
                  }}
                  trigger={
                    <RowRemoveButton
                      disabled={axis.values.length <= 1}
                      label={t('library.deleteValue')}
                    />
                  }
                />
              </SortableRow>
            ))}
          </ul>
        </SortableList>
        <AddNameRow
          label={t('library.addValue')}
          onAdd={(name) => addValue.mutateAsync(name)}
        />
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
