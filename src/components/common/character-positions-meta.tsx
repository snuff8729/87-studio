import { formatPoint } from '@/components/characters/position-stage'
import { useTranslation } from '@/lib/i18n'

interface Meta {
  characterPositions?: {
    useCoords?: boolean
    centers?: Array<{ x: number; y: number }>
  }
  prompts?: { characterPrompts?: Array<{ name?: string }> }
}

/** Positions actually used for an image (random ones included); null when AI placed everything */
export function CharacterPositionsMeta({ meta }: { meta: Meta | null }) {
  const { t } = useTranslation()
  const positions = meta?.characterPositions
  if (!positions?.useCoords || !positions.centers?.length) return null
  const names = meta?.prompts?.characterPrompts ?? []
  return (
    <div data-character-positions-meta>
      <label className="text-sm text-muted-foreground mb-1.5 block">
        {t('positions.detail')}
      </label>
      <div className="text-sm space-y-0.5 text-muted-foreground">
        {positions.centers.map((c, i) => (
          <p key={i}>
            {i + 1} · {names[i]?.name || t('characters.unnamed')}:{' '}
            {formatPoint(c.x, c.y)}
          </p>
        ))}
      </div>
    </div>
  )
}
