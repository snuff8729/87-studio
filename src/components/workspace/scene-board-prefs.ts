export type SceneCardSize = 'sm' | 'md' | 'lg'

export const SCENE_CARD_SIZES: Array<SceneCardSize> = ['sm', 'md', 'lg']

export const SCENE_CARD_SIZE_DEFAULT: SceneCardSize = 'lg'

/** Minimum card width (px) per size step. */
export const SCENE_CARD_MIN_WIDTH: Record<SceneCardSize, number> = {
  sm: 96,
  md: 128,
  lg: 168,
}

export function sceneBoardSizeKey(projectId: number): string {
  return `87studio-scene-board-size:${projectId}`
}

export function parseSceneCardSize(raw: string | null): SceneCardSize {
  return SCENE_CARD_SIZES.includes(raw as SceneCardSize)
    ? (raw as SceneCardSize)
    : SCENE_CARD_SIZE_DEFAULT
}
