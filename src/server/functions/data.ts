import { createServerFn } from '@tanstack/react-start'
import {
  cancelInstall,
  checkForUpdates,
  deleteDataset,
  getDataStatus,
  startInstall,
} from '../services/data-files'
import type { DatasetKey } from '@/lib/data-manifest'
import { DATASET_KEYS } from '@/lib/data-manifest'

function validateKey(data: { key: DatasetKey }) {
  if (!DATASET_KEYS.includes(data.key)) throw new Error('Unknown dataset')
  return data
}

export type { DataStatus, DatasetStatus } from '../services/data-files'

/** Status of every optional dataset; polled by Settings > Data and the guidance panels. */
export const getDataFilesStatus = createServerFn({ method: 'GET' }).handler(
  () => getDataStatus(),
)

/** Re-fetch the remote manifest (falls back silently to the built-in one). */
export const checkDataUpdates = createServerFn({ method: 'POST' }).handler(() =>
  checkForUpdates(),
)

/** Install, update or re-download a dataset (verified against the manifest). */
export const installDataset = createServerFn({ method: 'POST' })
  .inputValidator(validateKey)
  .handler(({ data }) => startInstall(data.key))

export const cancelDatasetInstall = createServerFn({ method: 'POST' })
  .inputValidator(validateKey)
  .handler(({ data }) => cancelInstall(data.key))

export const deleteDatasetFiles = createServerFn({ method: 'POST' })
  .inputValidator(validateKey)
  .handler(({ data }) => deleteDataset(data.key))
