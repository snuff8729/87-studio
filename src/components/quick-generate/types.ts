export interface CharacterEntry {
  id: string
  name: string
  prompt: string
  negative: string
}

export interface QuickGenerateState {
  generalPrompt: string
  negativePrompt: string
  characters: Array<CharacterEntry>
  parameters: Record<string, unknown>
  count: number
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
