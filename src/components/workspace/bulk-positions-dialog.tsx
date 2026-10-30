import { useEffect, useState } from 'react'
import { useSpecLabel } from './scene-positions-section'
import type { ScenePositionSpec } from '@/lib/character-positions'
import {
  PositionStage,
  formatPoint,
  usePositionSnap,
} from '@/components/characters/position-stage'
import { Segmented } from '@/components/common/segmented'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { AI_POSITION, parsePositionSpec } from '@/lib/character-positions'

export interface BulkPositionCharacter {
  id: number
  name: string
  position: string | null
}

/** Apply one character's position (or "default") to all checked scenes */
export function BulkPositionsDialog({
  open,
  onOpenChange,
  count,
  characters,
  aspect,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Checked scenes */
  count: number
  characters: Array<BulkPositionCharacter>
  aspect: number
  onApply: (characterId: number, position: ScenePositionSpec) => Promise<void>
}) {
  const { t } = useTranslation()
  const specLabel = useSpecLabel()
  const [snap, setSnap] = usePositionSnap()
  const [characterId, setCharacterId] = useState<number | null>(null)
  const [spec, setSpec] = useState<ScenePositionSpec>({ mode: 'inherit' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setCharacterId(characters[0]?.id ?? null)
    setSpec({ mode: 'inherit' })
  }, [open])

  const index = characters.findIndex((c) => c.id === characterId)
  const character = index >= 0 ? characters[index] : null
  const x = spec.x ?? 0.5
  const y = spec.y ?? 0.5

  async function apply() {
    if (characterId === null) return
    setBusy(true)
    try {
      await onApply(characterId, spec)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-bulk-positions>
        <DialogHeader>
          <DialogTitle>{t('positions.bulkTitle')}</DialogTitle>
          <DialogDescription>
            {t('positions.bulkDesc', { count })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {characters.map((c, i) => (
              <button
                key={c.id}
                type="button"
                data-bulk-character={c.id}
                aria-pressed={c.id === characterId}
                onClick={() => setCharacterId(c.id)}
                className={cn(
                  'h-7 max-w-[10rem] truncate rounded-full border px-3 text-sm transition-colors',
                  c.id === characterId
                    ? 'border-primary/50 bg-primary/15 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                {i + 1} · {c.name || t('characters.unnamed')}
              </button>
            ))}
          </div>
          <Segmented
            value={spec.mode}
            label={t('positions.title')}
            onChange={(mode) =>
              setSpec(mode === 'fixed' ? { mode, x, y } : { mode })
            }
            options={[
              { value: 'inherit', label: t('positions.default') },
              { value: 'ai', label: t('positions.ai') },
              { value: 'random', label: t('positions.random') },
              { value: 'fixed', label: t('positions.fixed') },
            ]}
          />
          {spec.mode === 'inherit' && character && (
            <p className="text-xs text-muted-foreground">
              {t('positions.defaultResolves', {
                value: specLabel(
                  parsePositionSpec(character.position) ?? AI_POSITION,
                ),
              })}
            </p>
          )}
          {spec.mode === 'fixed' && character && (
            <div className="space-y-2">
              <PositionStage
                aspect={aspect}
                snap={snap}
                activeId="self"
                dots={[
                  {
                    id: 'self',
                    index: index + 1,
                    name: character.name,
                    x,
                    y,
                    draggable: true,
                  },
                ]}
                onMove={(_, nx, ny) => setSpec({ mode: 'fixed', x: nx, y: ny })}
              />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span data-position-label>{formatPoint(x, y)}</span>
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={snap}
                    onCheckedChange={(v) => setSnap(v === true)}
                  />
                  {t('positions.snap')}
                </label>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            data-bulk-apply
            disabled={busy || characterId === null}
            onClick={() => void apply()}
          >
            {t('positions.bulkApply', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
