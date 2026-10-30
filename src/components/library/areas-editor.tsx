import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { Label } from '@/components/ui/label'
import {
  createArea,
  deleteArea,
  renameArea,
  reorderAreas,
} from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'

/** "Body areas" section of the Axes tab: add / rename / reorder / delete. */
export function AreasEditor({
  areas: serverAreas,
  items,
}: {
  areas: Array<{ id: number; name: string }>
  items: Array<{ areaIds: Array<number> }>
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })
  const onError = (e: Error) => toast.error(e.message || t('library.failed'))
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(
    null,
  )

  const add = useMutation({
    mutationFn: (name: string) => createArea({ data: { name } }),
    onSuccess: () => refresh(),
    onError,
  })
  const rename = useMutation({
    mutationFn: (v: { id: number; name: string }) => renameArea({ data: v }),
    onSuccess: () => refresh(),
    onError,
  })
  const order = useSortableOrder(
    serverAreas,
    (a) => a.id,
    async (ids) => {
      await reorderAreas({ data: { ids: ids as Array<number> } })
      await refresh()
    },
    () => toast.error(t('library.failed')),
  )
  const remove = useMutation({
    mutationFn: (id: number) => deleteArea({ data: id }),
    onSuccess: () => refresh(),
    onError,
  })

  const usage = deleting
    ? items.filter((i) => i.areaIds.includes(deleting.id)).length
    : 0

  return (
    <div className="space-y-4 p-4 md:p-6" data-areas-editor>
      <div>
        <Label className="text-base font-medium">
          {t('library.areasTitle')}
        </Label>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t('library.areasHint')}
        </p>
      </div>

      {order.items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('library.emptyAreas')}
        </p>
      )}
      <div className="max-w-[32rem]">
        <SortableList ids={order.ids} onReorder={(ids) => order.reorder(ids)}>
          <div className="space-y-0.5">
            {order.items.map((a) => (
              <SortableRow
                key={a.id}
                id={a.id}
                data-area-row
                className="flex h-8 items-center gap-1 rounded-lg px-0.5 hover:bg-secondary/30"
              >
                <DragHandle />
                <InlineName
                  value={a.name}
                  onCommit={(name) => rename.mutate({ id: a.id, name })}
                  ariaLabel={t('library.areaName')}
                />
                <RowRemoveButton
                  label={t('library.deleteArea')}
                  onClick={() => setDeleting({ id: a.id, name: a.name })}
                />
              </SortableRow>
            ))}
          </div>
        </SortableList>
        <AddNameRow
          label={t('library.addArea')}
          placeholder={t('library.areaNamePlaceholder')}
          onAdd={(name) => add.mutateAsync(name)}
        />
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('library.deleteAreaTitle', { name: deleting?.name ?? '' })}
        description={
          usage > 0
            ? t('library.deleteAreaDesc', { count: usage })
            : t('library.deleteAreaDescNone')
        }
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id)
        }}
      />
    </div>
  )
}
