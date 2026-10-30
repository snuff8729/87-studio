export type ScenesTabView = 'list' | 'cards'
export type SceneCardSize = 'sm' | 'md' | 'lg'

export interface ScenesTabPrefs {
  view: ScenesTabView
  size: SceneCardSize
}

export const SCENES_TAB_PREFS_DEFAULT: ScenesTabPrefs = {
  view: 'list',
  size: 'md',
}

export const SCENE_CARD_SIZES: Array<SceneCardSize> = ['sm', 'md', 'lg']

/** Minimum card width (px) per size step. */
export const SCENE_CARD_MIN_WIDTH: Record<SceneCardSize, number> = {
  sm: 96,
  md: 128,
  lg: 168,
}

export function scenesTabPrefsKey(projectId: number): string {
  return `87studio-scenes-tab:${projectId}`
}

export function parseScenesTabPrefs(raw: string | null): ScenesTabPrefs {
  if (!raw) return { ...SCENES_TAB_PREFS_DEFAULT }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { ...SCENES_TAB_PREFS_DEFAULT }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...SCENES_TAB_PREFS_DEFAULT }
  }
  const obj = value as Record<string, unknown>
  return {
    view:
      obj.view === 'list' || obj.view === 'cards'
        ? obj.view
        : SCENES_TAB_PREFS_DEFAULT.view,
    size: SCENE_CARD_SIZES.includes(obj.size as SceneCardSize)
      ? (obj.size as SceneCardSize)
      : SCENES_TAB_PREFS_DEFAULT.size,
  }
}
