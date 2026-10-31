/**
 * Per-scene character presence (pure).
 *
 * A project character has an appearance default ('all' scenes or only
 * 'selected' scenes). A scene override can set presence to on / off / replace
 * (null = follow the character's default).
 */

export type Appearance = 'all' | 'selected'
export type Presence = 'on' | 'off' | 'replace'
/** null = Default (follow the character) */
export type PresenceSetting = Presence | null

export function parseAppearance(raw: unknown): Appearance {
  return raw === 'selected' ? 'selected' : 'all'
}

export function parsePresenceSetting(raw: unknown): PresenceSetting {
  return raw === 'on' || raw === 'off' || raw === 'replace' ? raw : null
}

/** The presence a character has in a scene (never null) */
export function effectivePresence(
  appearance: unknown,
  presence: unknown,
): Presence {
  const setting = parsePresenceSetting(presence)
  if (setting) return setting
  return parseAppearance(appearance) === 'selected' ? 'off' : 'on'
}

/** Is the character part of the image (on or replaced)? */
export function isPresent(appearance: unknown, presence: unknown): boolean {
  return effectivePresence(appearance, presence) !== 'off'
}

/** Number of scenes the character appears in */
export function countAppearances(
  appearance: unknown,
  presences: Array<unknown>,
  sceneCount: number,
): number {
  // scenes without an override row behave as presence = null
  const missing = Math.max(0, sceneCount - presences.length)
  let n = isPresent(appearance, null) ? missing : 0
  for (const p of presences) if (isPresent(appearance, p)) n++
  return n
}

export type BulkPresenceChoice = 'keep' | 'default' | 'on' | 'off'

/** Apply a bulk choice to the current setting */
export function applyBulkPresence(
  current: PresenceSetting,
  choice: BulkPresenceChoice,
): PresenceSetting {
  if (choice === 'keep') return current
  if (choice === 'default') return null
  return choice
}
