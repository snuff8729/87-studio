import { PositionStage, formatPoint, usePositionSnap } from './position-stage'
import type { PositionMode, PositionSpec } from '@/lib/character-positions'
import { Segmented } from '@/components/common/segmented'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n'

/** Position row of one character: AI / Random / Fixed (+ picker for Fixed) */
export function CharacterPositionField({
  name,
  index,
  position,
  aspect,
  onChange,
}: {
  name: string
  /** 1-based number shown in the dot */
  index: number
  position: PositionSpec
  aspect: number
  onChange: (position: PositionSpec) => void
}) {
  const { t } = useTranslation()
  const [snap, setSnap] = usePositionSnap()
  const x = position.x ?? 0.5
  const y = position.y ?? 0.5

  function setMode(mode: PositionMode) {
    if (mode === 'fixed') onChange({ mode, x, y })
    else onChange({ mode })
  }

  return (
    <div className="space-y-1.5" data-character-position>
      <Label className="text-sm text-muted-foreground uppercase tracking-wider">
        {t('positions.title')}
      </Label>
      <Segmented
        value={position.mode}
        className="w-full"
        label={t('positions.title')}
        onChange={setMode}
        options={[
          { value: 'ai', label: t('positions.ai') },
          { value: 'random', label: t('positions.random') },
          { value: 'fixed', label: t('positions.fixed') },
        ]}
      />
      {position.mode === 'ai' && (
        <p className="text-xs text-muted-foreground">{t('positions.hintAi')}</p>
      )}
      {position.mode === 'random' && (
        <p className="text-xs text-muted-foreground">
          {t('positions.hintRandom')}
        </p>
      )}
      {position.mode === 'fixed' && (
        <div className="space-y-2">
          <PositionStage
            aspect={aspect}
            snap={snap}
            activeId="self"
            dots={[{ id: 'self', index, name, x, y, draggable: true }]}
            onMove={(_, nx, ny) => onChange({ mode: 'fixed', x: nx, y: ny })}
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
  )
}
