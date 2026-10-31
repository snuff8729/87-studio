import { createHash } from 'node:crypto'
import {
  closeSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { createLogger } from './logger'
import {
  checkManifest,
  dataBaseUrl,
  dataFile,
  getManifestState,
  installedVersion,
  koFileNames,
  setInstalledVersion,
} from './data-registry'
import { closeDanbooruDb } from './tag-index'
import { closeKoDb } from './ko-tags'
import * as semantic from './semantic'
import type { DatasetKey, DatasetState } from '@/lib/data-manifest'
import {
  deriveState,
  entrySize,
  missingRequirements,
} from '@/lib/data-manifest'

/**
 * Install / update / delete of the optional data files. Nothing here runs by
 * itself: every call is an explicit user action from Settings > Data.
 * State lives in the server so a page reload keeps showing the progress.
 */

const log = createLogger('data-files')

interface Job {
  received: number
  total: number
  abort: AbortController
}

const G = globalThis as unknown as {
  __dataJobs?: Map<DatasetKey, Job>
  __dataErrors?: Map<DatasetKey, string>
}
const jobs = (G.__dataJobs ??= new Map<DatasetKey, Job>())
const errors = (G.__dataErrors ??= new Map<DatasetKey, string>())

export interface DatasetStatus {
  key: DatasetKey
  state: DatasetState
  installedVersion: string | null
  latestVersion: string | null
  /** Download size from the manifest (semantic: index only, the model comes on top) */
  size: number
  received: number
  total: number
  pct: number | null
  error: string | null
  /** Prerequisites that are not installed */
  missing: Array<DatasetKey>
}

export interface DataStatus {
  datasets: Array<DatasetStatus>
  source: 'builtin' | 'remote'
  checkedAt: string | null
  checking: boolean
  updateAvailable: boolean
}

const KEYS = ['danbooru', 'ko', 'semantic'] as const

function semanticInfo() {
  const s = semantic.getStatus()
  return {
    s,
    installed: s.indexDownloaded && s.modelBytes > 0,
    downloading:
      s.phase === 'downloadingIndex' || s.phase === 'downloadingModel',
  }
}

export function getDataStatus(): DataStatus {
  const ms = getManifestState()
  const sem = semanticInfo()
  const versions: Record<DatasetKey, string | null> = {
    danbooru: installedVersion('danbooru'),
    ko: installedVersion('ko'),
    semantic: sem.installed ? installedVersion('semantic') : null,
  }
  const installed = new Set<DatasetKey>(KEYS.filter((k) => versions[k] != null))
  const datasets = KEYS.map((key): DatasetStatus => {
    const entry = ms.manifest.files[key]
    const job = jobs.get(key)
    const isSem = key === 'semantic'
    const downloading = isSem ? sem.downloading : !!job
    const error = isSem
      ? sem.s.phase === 'error'
        ? sem.s.error
        : null
      : (errors.get(key) ?? null)
    const received = job?.received ?? 0
    const total = job?.total ?? 0
    let pct: number | null = null
    if (isSem) pct = sem.downloading ? sem.s.pct : null
    else if (job && total > 0)
      pct = Math.min(99, Math.floor((received / total) * 100))
    return {
      key,
      state: deriveState({
        installed: versions[key],
        latest: entry?.version ?? null,
        downloading,
        error,
      }),
      installedVersion: versions[key],
      latestVersion: entry?.version ?? null,
      size: entrySize(entry),
      received,
      total,
      pct,
      error,
      missing: missingRequirements(entry?.requires, installed),
    }
  })
  return {
    datasets,
    source: ms.source,
    checkedAt: ms.checkedAt,
    checking: ms.checking,
    updateAvailable: datasets.some((d) => d.state === 'updateAvailable'),
  }
}

/** Re-check the remote manifest now (the "check for updates" button). */
export async function checkForUpdates(): Promise<DataStatus> {
  await checkManifest()
  return getDataStatus()
}

// ── download ─────────────────────────────────────────────────────────────────

const sidecars = (path: string) => [path + '-wal', path + '-shm']

/** Close the open handle (and reset caches) so the file can be replaced. */
function closeHandles(key: DatasetKey) {
  if (key === 'danbooru') closeDanbooruDb()
  else if (key === 'ko') closeKoDb()
}

async function fetchVerified(
  name: string,
  size: number,
  sha256: string,
  job: Job,
  base: number,
): Promise<string> {
  const dest = dataFile(name)
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = dest + '.tmp'
  rmSync(tmp, { force: true })
  const res = await fetch(dataBaseUrl() + name, { signal: job.abort.signal })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}): ${name}`)
  }
  const fd = openSync(tmp, 'w')
  const hash = createHash('sha256')
  let got = 0
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      writeSync(fd, value)
      got += value.length
      job.received = base + got
    }
  } catch (err) {
    closeSync(fd)
    rmSync(tmp, { force: true })
    throw err
  }
  closeSync(fd)
  if (got !== size || hash.digest('hex') !== sha256) {
    rmSync(tmp, { force: true })
    throw new Error(`Checksum mismatch (corrupt download): ${name}`)
  }
  return tmp
}

async function runInstall(key: 'danbooru' | 'ko', job: Job) {
  const entry = getManifestState().manifest.files[key]
  if (!entry) throw new Error('Not listed in the data manifest')
  job.total = entrySize(entry)
  const staged: Array<{ tmp: string; name: string }> = []
  try {
    let base = 0
    for (const f of entry.files) {
      const tmp = await fetchVerified(f.name, f.size, f.sha256, job, base)
      staged.push({ tmp, name: f.name })
      base += f.size
    }
  } catch (err) {
    for (const s of staged) rmSync(s.tmp, { force: true })
    throw err
  }
  // everything verified: swap in; the old file stays until this point
  closeHandles(key)
  for (const s of staged) {
    const dest = dataFile(s.name)
    for (const sc of sidecars(dest)) rmSync(sc, { force: true })
    renameSync(s.tmp, dest)
  }
  if (key === 'ko') {
    const keep = new Set(entry.files.map((f) => f.name))
    for (const n of koFileNames()) {
      if (!keep.has(n)) rmSync(dataFile(n), { force: true })
    }
  }
  setInstalledVersion(key, entry.version)
  closeHandles(key) // caches built from the old file are stale
  log.info('install', `${key} installed`, { version: entry.version })
}

/** Install, update or re-download (same thing: fetch, verify, replace). */
export async function startInstall(key: DatasetKey): Promise<DataStatus> {
  if (key === 'semantic') {
    if (semanticInfo().installed) await semantic.reinstallIndex()
    else semantic.enable()
    return getDataStatus()
  }
  if (jobs.has(key)) return getDataStatus()
  const entry = getManifestState().manifest.files[key]
  const present = new Set<DatasetKey>(
    (['danbooru', 'ko'] as const).filter((k) => installedVersion(k) != null),
  )
  const missing = missingRequirements(entry?.requires, present)
  if (missing.length > 0) {
    errors.set(key, `Requires: ${missing.join(', ')}`)
    return getDataStatus()
  }
  errors.delete(key)
  const job: Job = { received: 0, total: 0, abort: new AbortController() }
  jobs.set(key, job)
  void runInstall(key, job)
    .catch((err) => {
      if (job.abort.signal.aborted) return
      const message = err instanceof Error ? err.message : String(err)
      log.warn('install', `${key} install failed`, { error: message })
      errors.set(key, message)
    })
    .finally(() => {
      jobs.delete(key)
    })
  return getDataStatus()
}

export async function cancelInstall(key: DatasetKey): Promise<DataStatus> {
  if (key === 'semantic') await semantic.disable()
  else jobs.get(key)?.abort.abort()
  errors.delete(key)
  return getDataStatus()
}

/** Remove the installed files of a dataset. */
export async function deleteDataset(key: DatasetKey): Promise<DataStatus> {
  if (jobs.has(key)) {
    throw new Error('Cancel the running download first')
  }
  errors.delete(key)
  if (key === 'semantic') {
    await semantic.deleteFiles()
    return getDataStatus()
  }
  closeHandles(key)
  if (key === 'danbooru') {
    const p = dataFile('danbooru.db')
    for (const f of [p, ...sidecars(p), p + '.tmp']) rmSync(f, { force: true })
    setInstalledVersion('danbooru', null)
  } else {
    for (const n of koFileNames()) {
      const p = dataFile(n)
      for (const f of [p, ...sidecars(p)]) rmSync(f, { force: true })
    }
    setInstalledVersion('ko', null)
  }
  closeHandles(key)
  return getDataStatus()
}
