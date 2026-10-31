import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DataStatus, DatasetStatus } from '@/server/functions/data'
import type { DatasetKey } from '@/lib/data-manifest'
import {
  cancelDatasetInstall,
  checkDataUpdates,
  deleteDatasetFiles,
  getDataFilesStatus,
  installDataset,
} from '@/server/functions/data'

export const DATA_STATUS_KEY = ['data-status']

let lastSig: string | null = null

function busy(s: DataStatus | undefined): boolean {
  return !!s && s.datasets.some((d) => d.state === 'downloading')
}

/** Server-side state, polled fast while a download runs and slowly otherwise. */
export function useDataStatus(opts?: { slow?: boolean }) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: DATA_STATUS_KEY,
    queryFn: async () => {
      const s = await getDataFilesStatus()
      // an install / delete finished (possibly in another tab): refresh dependents
      const sig = s.datasets
        .map((d) => `${d.key}:${d.installedVersion ?? '-'}`)
        .join('|')
      if (lastSig !== null && lastSig !== sig) refreshDependents(qc)
      lastSig = sig
      return s
    },
    refetchInterval: (q) =>
      busy(q.state.data) ? 800 : opts?.slow ? 30_000 : 4000,
    staleTime: 0,
  })
}

export function useDataset(key: DatasetKey): DatasetStatus | undefined {
  return useDataStatus({ slow: true }).data?.datasets.find((d) => d.key === key)
}

/** Refetch everything that depends on the installed data files. */
function refreshDependents(qc: ReturnType<typeof useQueryClient>) {
  for (const k of [
    'tag-db-installed',
    'tag-search',
    'tag-info',
    'ko-tag-categories',
    'ko-tags-status',
    'semantic-status',
    'tags-db',
  ]) {
    void qc.invalidateQueries({ queryKey: [k] })
  }
}

export function useDataActions() {
  const qc = useQueryClient()
  const set = (s: DataStatus) => {
    qc.setQueryData(DATA_STATUS_KEY, s)
    refreshDependents(qc)
  }
  const install = useMutation({
    mutationFn: (key: DatasetKey) => installDataset({ data: { key } }),
    onSuccess: set,
  })
  const cancel = useMutation({
    mutationFn: (key: DatasetKey) => cancelDatasetInstall({ data: { key } }),
    onSuccess: set,
  })
  const remove = useMutation({
    mutationFn: (key: DatasetKey) => deleteDatasetFiles({ data: { key } }),
    onSuccess: set,
  })
  const check = useMutation({
    mutationFn: () => checkDataUpdates(),
    onSuccess: set,
  })
  return { install, cancel, remove, check }
}
