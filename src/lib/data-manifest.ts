/**
 * Optional data files (Danbooru tag DB, Korean tag data, natural-language
 * search index): manifest format, built-in fallback and state derivation.
 * Pure, no I/O. The manifest `data-manifest.json` lives next to the files on
 * HuggingFace; see scripts/build-data-manifest.mjs.
 */

export const DATA_BASE_URL =
  'https://huggingface.co/datasets/snuff8729/87-studio/resolve/main/'
export const DATA_MANIFEST_FILE = 'data-manifest.json'

export type DatasetKey = 'danbooru' | 'ko' | 'semantic'
export const DATASET_KEYS: ReadonlyArray<DatasetKey> = [
  'danbooru',
  'ko',
  'semantic',
]

export interface ManifestFile {
  name: string
  size: number
  sha256: string
}

export interface ManifestEntry {
  version: string
  files: Array<ManifestFile>
  requires?: Array<DatasetKey>
}

export interface DataManifest {
  schema: 1
  files: Partial<Record<DatasetKey, ManifestEntry>>
}

/** Built-in copy: used when the remote manifest is unreachable. */
export const BUILTIN_MANIFEST: DataManifest = {
  schema: 1,
  files: {
    danbooru: {
      version: '1',
      files: [
        {
          name: 'danbooru.db',
          size: 290234368,
          sha256:
            '6857d5b0f365d57a847aa45fce11346e6cbad983f2126a0f8abffcf598650add',
        },
      ],
    },
    ko: {
      version: '1',
      requires: ['danbooru'],
      files: [
        {
          name: 'naia-ko-v1.db',
          size: 15499264,
          sha256:
            '5ac985ae856e654d9ed6fb12011fdf5b50604dd5e3371fd981ab73eb63fd329d',
        },
      ],
    },
    semantic: {
      version: '1',
      requires: ['danbooru'],
      files: [
        {
          name: 'tag-index-embeddinggemma-300m-q8-50000-256.bin',
          size: 12800000,
          sha256:
            'd9e04ec9c30fc8476655c6710f0739efca45571873ecb135e3904b4fbd1940d6',
        },
        {
          name: 'tag-index-embeddinggemma-300m-q8-50000-256.json',
          size: 938875,
          sha256:
            'e88d9405b55e0fe2fe9f744b36d6468673866c53a14bde38b16ca71c0641dd51',
        },
      ],
    },
  },
}

const SHA_RE = /^[0-9a-f]{64}$/
const NAME_RE = /^[A-Za-z0-9._-]+$/

function parseEntry(raw: unknown): ManifestEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.version !== 'string' || !r.version) return null
  if (!Array.isArray(r.files) || r.files.length === 0) return null
  const files: Array<ManifestFile> = []
  for (const f of r.files) {
    if (!f || typeof f !== 'object') return null
    const { name, size, sha256 } = f as Record<string, unknown>
    if (typeof name !== 'string' || !NAME_RE.test(name) || name.includes('..'))
      return null
    if (typeof size !== 'number' || !(size > 0)) return null
    if (typeof sha256 !== 'string' || !SHA_RE.test(sha256)) return null
    files.push({ name, size, sha256 })
  }
  const requires = Array.isArray(r.requires)
    ? r.requires.filter((k): k is DatasetKey =>
        DATASET_KEYS.includes(k as DatasetKey),
      )
    : undefined
  return {
    version: r.version,
    files,
    ...(requires?.length ? { requires } : {}),
  }
}

/** Validate a fetched manifest; unknown datasets are ignored. Null if unusable. */
export function parseManifest(raw: unknown): DataManifest | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.schema !== 1 || !r.files || typeof r.files !== 'object') return null
  const out: DataManifest = { schema: 1, files: {} }
  for (const key of DATASET_KEYS) {
    const entry = parseEntry((r.files as Record<string, unknown>)[key])
    if (entry) out.files[key] = entry
  }
  return Object.keys(out.files).length > 0 ? out : null
}

/**
 * Remote manifest merged over the built-in one: datasets the remote omits
 * keep their built-in entry.
 */
export function mergeManifest(
  remote: DataManifest | null,
  builtin: DataManifest = BUILTIN_MANIFEST,
): DataManifest {
  return { schema: 1, files: { ...builtin.files, ...(remote?.files ?? {}) } }
}

/** Negative / 0 / positive like a - b; dotted numbers compare numerically. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '0'
    const y = pb[i] ?? '0'
    const nx = Number(x)
    const ny = Number(y)
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      if (nx !== ny) return nx < ny ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

export function entrySize(entry: ManifestEntry | undefined): number {
  return entry ? entry.files.reduce((n, f) => n + f.size, 0) : 0
}

export type DatasetState =
  | 'notInstalled'
  | 'downloading'
  | 'installed'
  | 'updateAvailable'
  | 'error'

export interface DeriveInput {
  /** Installed version, null when not installed */
  installed: string | null
  /** Latest version in the manifest */
  latest: string | null
  downloading: boolean
  error: string | null
}

/**
 * UI state of one dataset. An error is shown only while nothing is
 * downloading; the installed file (if any) stays usable behind it.
 */
export function deriveState(i: DeriveInput): DatasetState {
  if (i.downloading) return 'downloading'
  if (i.error) return 'error'
  if (i.installed == null) return 'notInstalled'
  if (i.latest != null && compareVersions(i.installed, i.latest) < 0)
    return 'updateAvailable'
  return 'installed'
}

/** Missing prerequisites of a dataset given the installed ones. */
export function missingRequirements(
  requires: ReadonlyArray<DatasetKey> | undefined,
  installed: ReadonlySet<DatasetKey>,
): Array<DatasetKey> {
  return (requires ?? []).filter((k) => !installed.has(k))
}

/** Whether any installed dataset has a newer manifest version. */
export function anyUpdate(
  states: ReadonlyArray<{ state: DatasetState }>,
): boolean {
  return states.some((s) => s.state === 'updateAvailable')
}

/** Human-readable byte size (1024 base). */
export function formatBytes(n: number): string {
  if (n <= 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${i === 0 || v >= 100 ? Math.round(v) : v.toFixed(1)} ${u[i]}`
}
