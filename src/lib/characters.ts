/** Move the item at `index` one step left (-1) or right (1). Out of range = no-op. */
export function moveItem<T>(
  items: ReadonlyArray<T>,
  index: number,
  direction: -1 | 1,
): Array<T> {
  const target = index + direction
  if (index < 0 || index >= items.length) return [...items]
  if (target < 0 || target >= items.length) return [...items]
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** "Character N" with the smallest N (> count) not already used. */
export function nextCharacterName(existing: ReadonlyArray<string>): string {
  const used = new Set(existing.map((n) => n.trim().toLowerCase()))
  let n = existing.length + 1
  while (used.has(`character ${n}`)) n++
  return `Character ${n}`
}

/** Name for a duplicate: "X copy", "X copy 2", ... */
export function duplicateName(
  name: string,
  existing: ReadonlyArray<string>,
): string {
  const used = new Set(existing.map((n) => n.trim().toLowerCase()))
  const base = `${name} copy`
  if (!used.has(base.toLowerCase())) return base
  let n = 2
  while (used.has(`${base} ${n}`.toLowerCase())) n++
  return `${base} ${n}`
}
