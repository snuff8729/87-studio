/** Pure helpers for project scene pack management (shared by server + UI). */

const norm = (s: string) => s.trim().toLowerCase()

/** True when `name` (trimmed, case-insensitive) is already used by `others`. */
export function isNameTaken(
  name: string,
  others: ReadonlyArray<string>,
): boolean {
  const wanted = norm(name)
  return others.some((n) => norm(n) === wanted)
}

/**
 * Free name in a target pack: `name`, else `name (2)`, `name (3)`, ...
 * (case-insensitive against `taken`).
 */
export function uniqueSuffixedName(
  name: string,
  taken: ReadonlyArray<string>,
): string {
  if (!isNameTaken(name, taken)) return name
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`
    if (!isNameTaken(candidate, taken)) return candidate
  }
}

/**
 * Moves `id` one step up/down in `ids`. Returns the new order, or `null`
 * when `id` is missing or already at that edge.
 */
export function swapNeighbor(
  ids: ReadonlyArray<number>,
  id: number,
  direction: 'up' | 'down',
): Array<number> | null {
  const idx = ids.indexOf(id)
  if (idx < 0) return null
  const target = direction === 'up' ? idx - 1 : idx + 1
  if (target < 0 || target >= ids.length) return null
  const next = [...ids]
  next[idx] = next[target]
  next[target] = id
  return next
}

/** Edge flags for disabling "Move up" / "Move down". */
export function moveAvailability(
  ids: ReadonlyArray<number>,
  id: number,
): { up: boolean; down: boolean } {
  const idx = ids.indexOf(id)
  return { up: idx > 0, down: idx >= 0 && idx < ids.length - 1 }
}
