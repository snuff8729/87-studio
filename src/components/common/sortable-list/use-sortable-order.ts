import { useMemo } from 'react'
import type { SortableId } from './sortable-list'
import { useSerialSave } from '@/components/library/use-serial-save'

/**
 * Optimistic local order for server-backed lists: drags show immediately,
 * saves are serialized (rapid drags compose) and a failed save falls back to
 * the latest server order. Items missing from the local order (just added)
 * are appended.
 */
export function useSortableOrder<T>(
  items: Array<T>,
  getId: (item: T) => SortableId,
  save: (ids: Array<SortableId>) => Promise<unknown>,
  onError?: () => void,
) {
  const order = useSerialSave<Array<SortableId>>(
    items.map(getId),
    async (ids) => {
      await save(ids)
    },
    onError,
  )
  const ordered = useMemo(() => {
    const byId = new Map(items.map((i) => [getId(i), i]))
    const out: Array<T> = []
    for (const id of order.value) {
      const item = byId.get(id)
      if (item !== undefined) {
        out.push(item)
        byId.delete(id)
      }
    }
    return [...out, ...byId.values()]
  }, [items, order.value])
  return {
    items: ordered,
    ids: ordered.map(getId),
    reorder: (ids: Array<SortableId>) => order.commit(() => ids),
  }
}
