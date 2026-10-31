import type { QuickPartsFields } from '@/lib/quick-parts'
import type { AxisValues } from '@/lib/character-parts'
import type { PositionSpec } from '@/lib/character-positions'

export interface CharacterEntry extends QuickPartsFields {
  id: string
  name: string
  prompt: string
  negative: string
  /** Absent = ai */
  position?: PositionSpec
}

export interface QuickGenerateState {
  generalPrompt: string
  negativePrompt: string
  characters: Array<CharacterEntry>
  parameters: Record<string, unknown>
  count: number
  /** Global axis values (View, Framing, ...) applied to every parts character */
  globalAxisValues?: AxisValues
}

export interface QuickImage {
  id: number
  thumbnailPath: string | null
  filePath: string
  seed: number | null
  isFavorite: number | null
  rating: number | null
  metadata: string | null
  createdAt: string | null
}
