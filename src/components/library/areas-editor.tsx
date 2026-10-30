import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import type { SortableId } from '@/components/common/sortable-list/sortable-list'
import {
  DragHandle,
  REVEAL_ON_ROW,
  RowRemoveButton,
  SortableList,
  SortableRow,
} from '@/components/common/sortable-list/sortable-list'
import { InlineName } from '@/components/common/sortable-list/inline-name'
import { AddNameRow } from '@/components/common/sortable-list/add-row'
import { useSortableOrder } from '@/components/common/sortable-list/use-sortable-order'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  createArea,
  deleteArea,
  renameArea,
  reorderAreas,
  setAreaParent,
} from '@/server/functions/library'
import { canSetParent, groupAreas } from '@/lib/character-parts'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type Area = { id: number; name: string; parentId: number | null }

/**
 * "Body areas" section of the Axes tab: a two-level tree. Drag reorders within
 * the same parent; the row menu sets the parent (an area with children cannot
 * get one). Covering a parent also covers its children.
 */
export function AreasEditor({
  areas: serverAreas,
  items,
}: {
  areas: Array<Area>
  items: Array<{
    areaIds: Array<number>
    fragments?: Array<{ areaIds?: Array<number> }>
  }>
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })
  const onError = (e: Error) => toast.error(e.message || t('library.failed'))
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(
    null,
  )

  const add = useMutation({
    mutationFn: (v: { name: string; parentId?: number }) =>
      createArea({ data: v }),
    onSuccess: () => refresh(),
    onError,
  })
  const rename = useMutation({
    mutationFn: (v: { id: number; name: string }) => renameArea({ data: v }),
    onSuccess: () => refresh(),
    onError,
  })
  const reparent = useMutation({
    mutationFn: (v: { id: number; parentId: number | null }) =>
      setAreaParent({ data: v }),
    onSuccess: () => refresh(),
    onError,
  })
  // One flat order for the whole tree; sibling drags rewrite their own slice
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

  const groups = groupAreas(order.items)
  const flatten = (
    tops: Array<SortableId>,
    childrenOf: (id: number) => Array<SortableId>,
  ) => tops.flatMap((id) => [id, ...childrenOf(id as number)])
  const childIdsOf = (id: number) =>
    order.items.filter((a) => a.parentId === id).map((a) => a.id)

  function reorderTops(ids: Array<SortableId>) {
    order.reorder(flatten(ids, childIdsOf))
  }
  function reorderChildren(parentId: number, ids: Array<SortableId>) {
    order.reorder(
      flatten(
        groups.map((g) => g.area.id),
        (id) => (id === parentId ? ids : childIdsOf(id)),
      ),
    )
  }

  const usage = deleting
    ? items.filter(
        (i) =>
          i.areaIds.includes(deleting.id) ||
          (i.fragments ?? []).some((f) => f.areaIds?.includes(deleting.id)),
      ).length
    : 0

  function rowMenu(a: Area) {
    const tops = groups.map((g) => g.area).filter((x) => x.id !== a.id)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('library.areaMenu')}
            data-area-menu
            className={cn(
              'size-6 shrink-0 text-muted-foreground',
              REVEAL_ON_ROW,
            )}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-set-parent>
              {t('library.setParent')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t('library.oneLevelOnly')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                disabled={a.parentId === null}
                onClick={() => reparent.mutate({ id: a.id, parentId: null })}
              >
                {t('library.parentNone')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {tops.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  data-parent-option={p.id}
                  disabled={
                    a.parentId === p.id ||
                    !canSetParent(order.items, a.id, p.id)
                  }
                  onClick={() => reparent.mutate({ id: a.id, parentId: p.id })}
                >
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const rowCls =
    'flex h-8 items-center gap-1 rounded-lg px-0.5 hover:bg-secondary/30'

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
        <SortableList
          ids={groups.map((g) => g.area.id)}
          onReorder={reorderTops}
        >
          <div className="space-y-0.5">
            {groups.map(({ area: a, children }) => (
              <SortableRow key={a.id} id={a.id} data-area-group={a.id}>
                <div className={rowCls} data-area-row>
                  <DragHandle />
                  <InlineName
                    value={a.name}
                    onCommit={(name) => rename.mutate({ id: a.id, name })}
                    ariaLabel={t('library.areaName')}
                  />
                  {rowMenu(a)}
                  <RowRemoveButton
                    label={t('library.deleteArea')}
                    onClick={() => setDeleting({ id: a.id, name: a.name })}
                  />
                </div>
                {children.length > 0 && (
                  <div className="ml-6 border-l border-border/60 pl-1.5">
                    <SortableList
                      ids={children.map((c) => c.id)}
                      onReorder={(ids) => reorderChildren(a.id, ids)}
                    >
                      <div className="space-y-0.5">
                        {children.map((c) => (
                          <SortableRow
                            key={c.id}
                            id={c.id}
                            data-area-row
                            data-area-child={c.id}
                            className={rowCls}
                          >
                            <DragHandle />
                            <InlineName
                              value={c.name}
                              onCommit={(name) =>
                                rename.mutate({ id: c.id, name })
                              }
                              ariaLabel={t('library.areaName')}
                            />
                            {rowMenu(c)}
                            <RowRemoveButton
                              label={t('library.deleteArea')}
                              onClick={() =>
                                setDeleting({ id: c.id, name: c.name })
                              }
                            />
                          </SortableRow>
                        ))}
                      </div>
                    </SortableList>
                  </div>
                )}
              </SortableRow>
            ))}
          </div>
        </SortableList>
        <AddNameRow
          label={t('library.addArea')}
          placeholder={t('library.areaNamePlaceholder')}
          onAdd={(name) => add.mutateAsync({ name })}
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
