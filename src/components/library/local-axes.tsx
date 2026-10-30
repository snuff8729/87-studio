import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import { AxisEditor } from './axis-editor'
import type { PartsAxis } from '@/lib/character-parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { createAxis } from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'

export function splitValues(text: string): Array<string> {
  return text
    .split(/[,，、]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

/** Axis creation form (name + comma-separated values). */
export function NewAxisForm({
  owner,
  onCreated,
  autoFocus,
}: {
  owner?: { characterId?: number; itemId?: number }
  onCreated: (axis: PartsAxis) => void
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [values, setValues] = useState('')
  const list = splitValues(values)
  const create = useMutation({
    mutationFn: () =>
      createAxis({
        data: {
          name: name.trim(),
          ownerCharacterId: owner?.characterId,
          ownerItemId: owner?.itemId,
          values: list,
        },
      }),
    onSuccess: (axis) => {
      void qc.invalidateQueries({ queryKey: ['library'] })
      setName('')
      setValues('')
      onCreated(axis)
    },
    onError: (e: Error) => toast.error(e.message || t('library.failed')),
  })
  const canCreate = !!name.trim() && list.length > 0 && !create.isPending

  return (
    <div
      className="flex flex-col gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && canCreate) {
          e.preventDefault()
          create.mutate()
        }
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('library.axisNamePlaceholder')}
        aria-label={t('library.axisName')}
        className="h-8 text-sm"
        autoFocus={autoFocus}
      />
      <Input
        value={values}
        onChange={(e) => setValues(e.target.value)}
        placeholder={t('library.axisValuesPlaceholder')}
        aria-label={t('library.axisValues')}
        className="h-8 text-sm"
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!canCreate}
          onClick={() => create.mutate()}
        >
          {t('common.create')}
        </Button>
      </div>
    </div>
  )
}

/** Local axes of one library character / outfit item as editable chips. */
export function LocalAxes({
  axes,
  owner,
}: {
  axes: Array<PartsAxis>
  owner: { characterId?: number; itemId?: number }
}) {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {axes.map((axis) => (
        <Popover key={axis.id}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 max-w-full px-2 text-xs"
              aria-label={t('library.editAxis', { name: axis.name })}
            >
              <span className="truncate">
                <span className="text-muted-foreground">{axis.name}:</span>{' '}
                {axis.values.map((v) => v.name).join(' · ')}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-[70vh] w-80 overflow-y-auto p-3"
            data-block-shortcuts
          >
            <AxisEditor axis={axis} />
          </PopoverContent>
        </Popover>
      ))}
      <Popover open={addOpen} onOpenChange={setAddOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            {t('library.addAxis')}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 gap-3 p-3"
          data-block-shortcuts
        >
          <div className="text-sm font-medium">{t('library.addAxisTitle')}</div>
          <NewAxisForm
            owner={owner}
            autoFocus
            onCreated={() => setAddOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
