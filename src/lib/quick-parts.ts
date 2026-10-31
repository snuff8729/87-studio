import type { AxisValues, OutfitEntry } from '@/lib/character-parts'
import type { PositionSpec } from '@/lib/character-positions'

/** Quick Generate character fields that carry library parts. */
export interface QuickPartsFields {
  /** Live link to a global library character */
  libraryCharacterId?: number | null
  /** Default outfit entries */
  outfit?: Array<OutfitEntry>
  /** Local (character/item) axis values, keyed by axis id */
  axisValues?: AxisValues
}

interface QuickCharacterLike extends QuickPartsFields {
  name: string
  prompt: string
  negative: string
  position?: PositionSpec
}

/** Whether the character gets library text composed into its prompt. */
export function quickCharHasParts(c: QuickPartsFields): boolean {
  return (c.libraryCharacterId ?? null) !== null || (c.outfit ?? []).length > 0
}

/**
 * Server input for composing / generating: characters with parts keep their
 * parts fields, plain characters are sent unchanged.
 */
export function buildQuickPromptInput(state: {
  generalPrompt: string
  negativePrompt: string
  characters: Array<QuickCharacterLike>
  globalAxisValues?: AxisValues
}) {
  const anyParts = state.characters.some(quickCharHasParts)
  return {
    generalPrompt: state.generalPrompt,
    negativePrompt: state.negativePrompt,
    characters: state.characters.map((c) => ({
      name: c.name,
      prompt: c.prompt,
      negative: c.negative,
      position: c.position,
      ...(quickCharHasParts(c) && {
        libraryCharacterId: c.libraryCharacterId ?? null,
        outfit: c.outfit ?? [],
        axisValues: c.axisValues ?? {},
      }),
    })),
    // Global axes only matter when a character uses parts
    ...(anyParts && { globalAxisValues: state.globalAxisValues ?? {} }),
  }
}

/** Set (or with null clear) one axis in an axis-value map. */
export function setAxisValue(
  values: AxisValues | undefined,
  axisId: number,
  valueId: number | null,
): AxisValues {
  const next = { ...values }
  if (valueId === null) delete next[String(axisId)]
  else next[String(axisId)] = valueId
  return next
}
