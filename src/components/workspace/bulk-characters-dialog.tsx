import { useEffect, useState } from 'react'
import type { BulkPresenceChoice } from '@/lib/scene-characters'
import { Segmented } from '@/components/common/segmented'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n'

export interface BulkCastCharacter {
  id: number
  name: string
}

export interface BulkCastChange {
  characterId: number
  presence: 'on' | 'off' | null
}

/** Set Default / On / Off per character on all checked scenes */
export function BulkCharactersDialog({
  open,
  onOpenChange,
  count,
  characters,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Checked scenes */
  count: number
  characters: Array<BulkCastCharacter>
  onApply: (changes: Array<BulkCastChange>) => Promise<void>
}) {
  const { t } = useTranslation()
  const [choices, setChoices] = useState<Record<number, BulkPresenceChoice>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setChoices({})
  }, [open])

  const changes: Array<BulkCastChange> = characters.flatMap((c) => {
    const choice = choices[c.id] ?? 'keep'
    return choice === 'keep'
      ? []
      : [
          {
            characterId: c.id,
            presence: choice === 'default' ? null : choice,
          },
        ]
  })

  async function apply() {
    setBusy(true)
    try {
      await onApply(changes)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-bulk-cast>
        <DialogHeader>
          <DialogTitle>{t('sceneCast.bulkTitle')}</DialogTitle>
          <DialogDescription>
            {t('sceneCast.bulkDesc', { count })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {characters.map((c, i) => (
            <div
              key={c.id}
              data-bulk-cast-row={c.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <span className="flex min-w-0 max-w-[10rem] items-center gap-1.5 text-sm">
                <span className="grid size-5 shrink-0 place-content-center rounded-full bg-secondary text-xs">
                  {i + 1}
                </span>
                <span className="truncate">
                  {c.name || t('characters.unnamed')}
                </span>
              </span>
              <Segmented
                value={choices[c.id] ?? 'keep'}
                label={c.name}
                onChange={(v) => setChoices((p) => ({ ...p, [c.id]: v }))}
                options={[
                  { value: 'keep', label: t('sceneCast.noChange') },
                  { value: 'default', label: t('sceneCast.default') },
                  { value: 'on', label: t('sceneCast.on') },
                  { value: 'off', label: t('sceneCast.off') },
                ]}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            data-bulk-cast-apply
            disabled={busy || changes.length === 0}
            onClick={() => void apply()}
          >
            {t('sceneCast.bulkApply', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
