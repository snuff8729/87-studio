/** Checked-scene helpers shared by the rail and the selection grid. */

/** Copy of `ids` with `id` added or removed. */
export function setChecked(
  ids: ReadonlySet<number>,
  id: number,
  checked: boolean,
): Set<number> {
  const next = new Set(ids)
  if (checked) next.add(id)
  else next.delete(id)
  return next
}

/** Checked ids that are still visible (deleted / filtered-out ones drop out). */
export function visibleChecked(
  checked: ReadonlySet<number>,
  visibleIds: ReadonlyArray<number>,
): Array<number> {
  return visibleIds.filter((id) => checked.has(id))
}

export type SelectAllState = 'none' | 'some' | 'all'

export function selectAllState(
  checkedCount: number,
  visibleCount: number,
): SelectAllState {
  if (checkedCount === 0 || visibleCount === 0) return 'none'
  return checkedCount >= visibleCount ? 'all' : 'some'
}
