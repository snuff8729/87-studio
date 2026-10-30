import type { ResolvedPositions } from '@/lib/character-positions'

interface CharacterInput {
  prompt: string
  negative: string
}

const CENTERED = { x: 0.5, y: 0.5 }

/** Character-related NAI payload parts; without positions it is the centered, no-coords payload */
export function buildCharacterPayload(
  characters: ReadonlyArray<CharacterInput>,
  positions?: ResolvedPositions,
) {
  const useCoords = positions?.useCoords ?? false
  const centerOf = (i: number) =>
    useCoords ? (positions?.centers[i] ?? CENTERED) : CENTERED
  return {
    useCoords,
    charCaptions: characters.map((cp, i) => ({
      char_caption: cp.prompt,
      centers: [centerOf(i)],
    })),
    negCharCaptions: characters.map((cp, i) => ({
      char_caption: cp.negative,
      centers: [centerOf(i)],
    })),
    characterPrompts: characters.map((cp, i) => ({
      center: centerOf(i),
      enabled: true,
      prompt: cp.prompt,
      uc: cp.negative,
    })),
  }
}
