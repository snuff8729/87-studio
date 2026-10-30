/** Pure helpers for the scene templates dialog (global scene packs). */

export function parsePlaceholders(json: string | null): Record<string, string> {
  if (!json) return {}
  try {
    const value: unknown = JSON.parse(json)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = typeof v === 'string' ? v : ''
    }
    return out
  } catch {
    return {}
  }
}

/** `Smile` → `Smile (copy)` → `Smile (copy 2)` …, unique among `existing`. */
export function nextCopyName(
  name: string,
  existing: ReadonlyArray<string>,
): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()))
  const base = name.replace(/ \(copy(?: \d+)?\)$/, '')
  let candidate = `${base} (copy)`
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) {
    candidate = `${base} (copy ${i})`
  }
  return candidate
}

export function isDuplicateName(
  names: ReadonlyArray<string>,
  name: string,
  exceptName?: string,
): boolean {
  const wanted = name.trim().toLowerCase()
  const except = exceptName?.trim().toLowerCase()
  return names.some((n) => {
    const lower = n.trim().toLowerCase()
    return lower === wanted && lower !== except
  })
}

/** New id order after moving `id` one step; null when it cannot move. */
export function moveId(
  ids: ReadonlyArray<number>,
  id: number,
  direction: 'up' | 'down',
): Array<number> | null {
  const index = ids.indexOf(id)
  if (index < 0) return null
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= ids.length) return null
  const next = [...ids]
  next[index] = ids[target]
  next[target] = id
  return next
}

/**
 * Key suggestions for "Add key": keys used by other scenes of the pack first,
 * then the project's `@{slot:…}` names; excludes keys already present.
 */
export function suggestKeys(
  otherScenes: ReadonlyArray<Record<string, string>>,
  slotNames: ReadonlyArray<string>,
  existingKeys: ReadonlyArray<string>,
): Array<string> {
  const skip = new Set(existingKeys)
  const out = new Set<string>()
  for (const scene of otherScenes) {
    for (const k of Object.keys(scene)) if (!skip.has(k)) out.add(k)
  }
  for (const k of slotNames) if (!skip.has(k)) out.add(k)
  return [...out]
}

/** Renames a key keeping its position; null when invalid or conflicting. */
export function renameKey(
  values: Record<string, string>,
  from: string,
  to: string,
): Record<string, string> | null {
  const next = to.trim()
  if (!next || next === from || !(from in values) || next in values) {
    return null
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(values)) out[k === from ? next : k] = v
  return out
}

export function filterByName<T extends { name: string }>(
  items: ReadonlyArray<T>,
  query: string,
): Array<T> {
  const q = query.trim().toLowerCase()
  if (!q) return [...items]
  return items.filter((i) => i.name.toLowerCase().includes(q))
}

/** ↑/↓ selection step within `ids`; stays put at the ends. */
export function stepSelection(
  ids: ReadonlyArray<number>,
  current: number | null,
  delta: 1 | -1,
): number | null {
  if (ids.length === 0) return null
  const index = current == null ? -1 : ids.indexOf(current)
  if (index < 0) return delta === 1 ? ids[0] : ids[ids.length - 1]
  return ids[Math.min(ids.length - 1, Math.max(0, index + delta))]
}

export interface TemplatesLayout {
  packs: number
  scenes: number
  editor: number
}

export const TEMPLATES_LAYOUT_DEFAULT: TemplatesLayout = {
  packs: 17,
  scenes: 22,
  editor: 61,
}

export function parseTemplatesLayout(
  raw: string | null,
): TemplatesLayout | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    const { packs, scenes, editor } = v
    if (
      typeof packs !== 'number' ||
      typeof scenes !== 'number' ||
      typeof editor !== 'number'
    ) {
      return null
    }
    if (![packs, scenes, editor].every(Number.isFinite)) return null
    if (Math.abs(packs + scenes + editor - 100) > 1) return null
    if (packs < 10 || scenes < 14 || editor < 30) return null
    return { packs, scenes, editor }
  } catch {
    return null
  }
}
