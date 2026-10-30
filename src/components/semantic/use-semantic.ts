import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SemanticStatus } from '@/server/functions/semantic'
import type { TranslationKeys } from '@/lib/i18n/types'
import {
  deleteSemanticFiles,
  getSemanticStatus,
  setSemanticEnabled,
} from '@/server/functions/semantic'

export const SEMANTIC_STATUS_KEY = ['semantic-status']

export function isSemanticBusy(s: SemanticStatus | undefined): boolean {
  return (
    !!s &&
    (s.phase === 'downloadingIndex' ||
      s.phase === 'downloadingModel' ||
      s.phase === 'loading')
  )
}

/**
 * Polls while mounted: quickly during downloads/loading, slowly otherwise
 * (so a switch flipped elsewhere is mirrored).
 */
export function useSemanticStatus() {
  return useQuery({
    queryKey: SEMANTIC_STATUS_KEY,
    queryFn: () => getSemanticStatus(),
    refetchInterval: (q) => (isSemanticBusy(q.state.data) ? 700 : 3000),
    staleTime: 0,
  })
}

export function useSemanticActions() {
  const qc = useQueryClient()
  const set = (s: SemanticStatus) => qc.setQueryData(SEMANTIC_STATUS_KEY, s)
  const toggle = useMutation({
    mutationFn: (on: boolean) => setSemanticEnabled({ data: { on } }),
    onSuccess: set,
  })
  const remove = useMutation({
    mutationFn: () => deleteSemanticFiles(),
    onSuccess: (s) => {
      set(s)
      void qc.invalidateQueries({ queryKey: ['semantic-search'] })
    },
  })
  return { toggle, remove }
}

/** One-line status text for the current phase. */
export function semanticStatusText(
  t: (k: TranslationKeys, p?: Record<string, string | number>) => string,
  s: SemanticStatus | undefined,
): string {
  if (!s) return ''
  switch (s.phase) {
    case 'downloadingIndex':
      return t('semantic.statusDownloadingIndex', { pct: s.pct ?? 0 })
    case 'downloadingModel':
      return t('semantic.statusDownloadingModel', { pct: s.pct ?? 0 })
    case 'loading':
      return t('semantic.statusLoading')
    case 'ready':
      return t('semantic.statusReady')
    case 'error':
      return t('semantic.statusError', { error: s.error ?? '' })
    default:
      return t('semantic.statusOff')
  }
}
