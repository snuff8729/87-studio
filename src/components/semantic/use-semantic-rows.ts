import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSemanticStatus } from './use-semantic'
import type { SemanticRow } from '@/server/functions/semantic'
import { semanticTagSearch } from '@/server/functions/semantic'

const DAN_TABS: Record<string, number> = {
  character: 4,
  artist: 1,
  copyright: 3,
}

/** Same tab semantics as the name search (see searchTagsFor). */
export function matchesTab(row: SemanticRow, tab: string): boolean {
  if (tab === 'all') return true
  if (tab in DAN_TABS) return row.category === DAN_TABS[tab]
  if (tab === 'general') return row.category === 0
  if (tab !== 'meta' && row.category !== 0) return false
  return row.top === tab || row.fine === tab
}

/**
 * Meaning-based hits for the Tag Search window. Only queries the server when
 * natural-language search is switched on AND ready: searching never turns it
 * on, so with the switch off the model is never touched.
 */
export function useSemanticRows(query: string, tab: string) {
  const { data: status } = useSemanticStatus()
  const ready = status?.enabled === true && status.phase === 'ready'
  const q = query.trim()
  const search = useQuery({
    queryKey: ['semantic-search', q],
    queryFn: () => semanticTagSearch({ data: { query: q, limit: 50 } }),
    enabled: ready && q.length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    retry: false,
  })
  const rows = useMemo(
    () =>
      ready && q.length >= 2
        ? (search.data ?? []).filter((r) => matchesTab(r, tab))
        : [],
    [ready, q, search.data, tab],
  )
  return { rows, ready, fetching: ready && search.isFetching, status }
}
