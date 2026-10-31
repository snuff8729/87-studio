import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname } from 'node:path'
import { dataPath } from '../data-dir'
import { createLogger } from './logger'
import { NAI_MOCK } from './nai-mock'
import type { DataManifest, DatasetKey } from '@/lib/data-manifest'
import {
  BUILTIN_MANIFEST,
  DATA_BASE_URL,
  DATA_MANIFEST_FILE,
  mergeManifest,
  parseManifest,
} from '@/lib/data-manifest'

/**
 * Where the optional data files live, which version of each is installed and
 * the (remote or built-in) manifest describing the latest versions.
 *
 * DATA_BASE_URL overrides the download base (must end with `/`). NAI_MOCK
 * servers never contact the network unless it is set.
 */

const log = createLogger('data-registry')

export function dataLogical(name: string): string {
  return `./data/${name}`
}
export const dataFile = (name: string) => dataPath(dataLogical(name))

export function dataBaseUrl(): string {
  const u = process.env.DATA_BASE_URL || DATA_BASE_URL
  return u.endsWith('/') ? u : u + '/'
}

// ── installed versions ───────────────────────────────────────────────────────

const REGISTRY = 'data-versions.json'
const KO_FILE_RE = /^naia-ko-v(\d+)\.db$/

interface Registry {
  [key: string]: { version: string } | undefined
}

function readRegistry(): Registry {
  try {
    const p = dataFile(REGISTRY)
    return existsSync(p)
      ? (JSON.parse(readFileSync(p, 'utf8')) as Registry)
      : {}
  } catch {
    return {}
  }
}

export function setInstalledVersion(key: DatasetKey, version: string | null) {
  if (key === 'danbooru') {
    const p = dataFile('danbooru.db.version')
    if (version == null) rmSync(p, { force: true })
    else writeFileSync(p, version)
    return
  }
  const reg = readRegistry()
  if (version == null) delete reg[key]
  else reg[key] = { version }
  mkdirSync(dirname(dataFile(REGISTRY)), { recursive: true })
  writeFileSync(dataFile(REGISTRY), JSON.stringify(reg))
}

/** Path of the installed Korean data file (newest naia-ko-v<N>.db), or null. */
export function koFilePath(): string | null {
  try {
    const dir = dirname(dataFile(REGISTRY))
    const names = readdirSync(dir)
      .filter((f) => KO_FILE_RE.test(f))
      .sort(
        (a, b) =>
          Number(KO_FILE_RE.exec(b)![1]) - Number(KO_FILE_RE.exec(a)![1]),
      )
    return names.length > 0 ? dataFile(names[0]) : null
  } catch {
    return null
  }
}

export function koFileNames(): Array<string> {
  try {
    return readdirSync(dirname(dataFile(REGISTRY))).filter((f) =>
      KO_FILE_RE.test(f),
    )
  } catch {
    return []
  }
}

/** Installed version of a dataset, null when not installed. */
export function installedVersion(key: DatasetKey): string | null {
  if (key === 'danbooru') {
    if (!existsSync(dataFile('danbooru.db'))) return null
    try {
      const p = dataFile('danbooru.db.version')
      return (existsSync(p) && readFileSync(p, 'utf8').trim()) || '1'
    } catch {
      return '1'
    }
  }
  if (key === 'ko') {
    const f = koFilePath()
    if (!f) return null
    const reg = readRegistry().ko?.version
    if (reg) return reg
    const m = KO_FILE_RE.exec(basename(f))
    return m ? m[1] : '1'
  }
  // semantic: the caller (semantic.ts) knows whether the files exist
  return readRegistry().semantic?.version ?? '1'
}

// ── manifest ─────────────────────────────────────────────────────────────────

export interface ManifestState {
  manifest: DataManifest
  source: 'builtin' | 'remote'
  checkedAt: string | null
  checking: boolean
}

const G = globalThis as unknown as { __dataManifest?: ManifestState }
const M: ManifestState = (G.__dataManifest ??= {
  manifest: BUILTIN_MANIFEST,
  source: 'builtin',
  checkedAt: null,
  checking: false,
})
let started = false

function networkAllowed(): boolean {
  return !NAI_MOCK || !!process.env.DATA_BASE_URL
}

/** Fetch the remote manifest; any failure keeps what we have, silently. */
export async function checkManifest(): Promise<ManifestState> {
  if (M.checking) return M
  M.checking = true
  try {
    if (networkAllowed()) {
      const res = await fetch(dataBaseUrl() + DATA_MANIFEST_FILE, {
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      })
      if (res.ok) {
        const parsed = parseManifest(await res.json())
        if (parsed) {
          M.manifest = mergeManifest(parsed)
          M.source = 'remote'
        }
      }
    }
  } catch (err) {
    log.info('manifest', 'remote manifest unreachable', {
      error: String(err),
    })
  } finally {
    M.checkedAt = new Date().toISOString()
    M.checking = false
  }
  return M
}

/** Current manifest; kicks off the once-per-start remote check. */
export function getManifestState(): ManifestState {
  if (!started) {
    started = true
    void checkManifest()
  }
  return M
}
