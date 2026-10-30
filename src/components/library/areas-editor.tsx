import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { CommitInput } from './commit-input'
import { NameForm } from './name-form'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
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
  // Local optimistic order + serialized saves so rapid ↑/↓ clicks compose
  const [localOrder, setLocalOrder] = useState<Array<number> | null>(null)
  const orderRef = useRef<Array<number> | null>(null)
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())
  const areas = localOrder
    ? localOrder
        .map((id) => serverAreas.find((a) => a.id === id))
        .filter((a): a is { id: number; name: string } => !!a)
    : serverAreas
  const serverKey = serverAreas.map((a) => a.id).join(',')
  useEffect(() => {
    // server truth arrived (once every queued save settled) — drop the override
    const chain = saveChain.current
    void chain.then(() => {
      if (saveChain.current !== chain) return
      orderRef.current = null
      setLocalOrder(null)
    })
  }, [serverKey])
  const reorder = {
    mutate(ids: Array<number>) {
      orderRef.current = ids
      setLocalOrder(ids)
      saveChain.current = saveChain.current
        .then(() => reorderAreas({ data: { ids } }))
        .then(() => refresh())
        .catch((e: Error) => {
          orderRef.current = null
          setLocalOrder(null)
          onError(e)
        })
    },
  }
  const remove = useMutation({
    mutationFn: (id: number) => deleteArea({ data: id }),
    onSuccess: () => refresh(),
    onError,
  })

  function move(index: number, dir: -1 | 1) {
    const ids = [...(orderRef.current ?? serverAreas.map((a) => a.id))]
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorder.mutate(ids)
  }

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

      {areas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('library.emptyAreas')}
        </p>
      )}
      <div className="space-y-1.5">
        {areas.map((a, i) => (
          <div key={a.id} className="flex items-center gap-1" data-area-row>
            <CommitInput
              value={a.name}
              onCommit={(name) => rename.mutate({ id: a.id, name })}
              aria-label={t('library.areaName')}
              className="h-8 min-w-0 flex-1 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-8"
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
              className="size-8"
              disabled={i === areas.length - 1}
              onClick={() => move(i, 1)}
              aria-label={t('library.moveDown')}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleting({ id: a.id, name: a.name })}
              aria-label={t('library.deleteArea')}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </Button>
          </div>
        ))}
      </div>

      <div className="max-w-sm">
        <NameForm
          key={areas.length}
          placeholder={t('library.areaNamePlaceholder')}
          actionLabel={t('library.addArea')}
          onSubmit={async (name) => {
            await add.mutateAsync(name)
          }}
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
