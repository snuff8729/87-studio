import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fork } from 'node:child_process'
import {
  closeSync,
  existsSync as fsExists,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { settings } from '../db/schema'
import { dataPath } from '../data-dir'
import { categorize, getDanbooruDb } from './tag-index'
import { createLogger } from './logger'
import type { IndexMeta } from '@/lib/semantic'
import {
  SEMANTIC_DIMS,
  SEMANTIC_INDEX_SIZE,
  SEMANTIC_MODEL_DTYPE,
  SEMANTIC_MODEL_ID,
  SEMANTIC_MODEL_KEY,
  TAG_INDEX_BASE_URL,
  TAG_INDEX_VERSION,
  indexBaseName,
  isIndexCompatible,
  mockEmbed,
  parseIndexMeta,
  queryPrompt,
  topK,
  truncateNormalize,
} from '@/lib/semantic'

type WorkerMsg =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; data: Float32Array; dim: number }
  | { type: 'error'; id?: number; message: string }

const log = createLogger('semantic')

/** Deterministic fake embedder; no model download (smoke tests). */
export const SEMANTIC_MOCK = process.env.SEMANTIC_MOCK === '1'

const MODEL_KEY = SEMANTIC_MOCK ? 'mock' : SEMANTIC_MODEL_KEY
const MOCK_DELAY_MS = Number(process.env.SEMANTIC_MOCK_DELAY_MS ?? 600)

export type SemanticPhase =
  | 'off'
  | 'downloadingIndex'
  | 'downloadingModel'
  | 'loading'
  | 'ready'
  | 'error'

export interface SemanticStatus {
  enabled: boolean
  phase: SemanticPhase
  /** 0..100 for the download phases, else null */
  pct: number | null
  error: string | null
  mock: boolean
  indexDownloaded: boolean
  indexBytes: number
  modelBytes: number
  /** Tags in the loaded/downloaded index */
  count: number
  builtAt: string | null
  /** The index was built from another danbooru.db version (informational) */
  dbMismatch: boolean
}

export interface SemanticRow {
  name: string
  postCount: number
  category: number
  top: string
  fine: string
  score: number
}

interface State {
  enabled: boolean
  phase: SemanticPhase
  pct: number | null
  error: string | null
  token: number
  abort: AbortController | null
  /** Child process hosting the model (killed on off: frees all its memory) */
  worker: ChildProcess | null
  extractor: ((t: Array<string>) => Promise<Float32Array>) | null
  matrix: Int8Array | null
  meta: IndexMeta | null
  booted: boolean
}

const G = globalThis as unknown as { __semanticState?: State }
const S: State = (G.__semanticState ??= {
  enabled: false,
  phase: 'off',
  pct: null,
  error: null,
  token: 0,
  abort: null,
  worker: null,
  extractor: null,
  matrix: null,
  meta: null,
  booted: false,
})

// ── paths / settings ─────────────────────────────────────────────────────────

const modelsDir = () => dataPath('./data/models')
const hfCacheDir = () => join(modelsDir(), 'hf')
const baseName = () =>
  indexBaseName(MODEL_KEY, SEMANTIC_INDEX_SIZE, SEMANTIC_DIMS)
const binPath = () => join(modelsDir(), baseName() + '.bin')
const metaPath = () => join(modelsDir(), baseName() + '.json')

function indexBaseUrl(): string {
  const u = process.env.SEMANTIC_INDEX_URL || TAG_INDEX_BASE_URL
  return u.endsWith('/') ? u : u + '/'
}

function getSetting(key: string): string | null {
  return (
    db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
  )
}
function putSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date().toISOString() },
    })
    .run()
}

function dirBytes(dir: string): number {
  let total = 0
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      total += e.isDirectory() ? dirBytes(p) : statSync(p).size
    }
  } catch {
    /* missing */
  }
  return total
}

function readLocalMeta(): IndexMeta | null {
  try {
    if (!fsExists(metaPath()) || !fsExists(binPath())) return null
    const meta = parseIndexMeta(JSON.parse(readFileSync(metaPath(), 'utf8')))
    if (!meta) return null
    const ok = isIndexCompatible(
      meta,
      {
        indexVersion: TAG_INDEX_VERSION,
        model: MODEL_KEY,
        dims: SEMANTIC_DIMS,
        size: SEMANTIC_INDEX_SIZE,
      },
      statSync(binPath()).size,
    )
    return ok ? meta : null
  } catch {
    return null
  }
}

function localDbVersion(): string | null {
  try {
    const p = dataPath('./data/danbooru.db.version')
    return fsExists(p) ? readFileSync(p, 'utf8').trim() : null
  } catch {
    return null
  }
}

// ── status ───────────────────────────────────────────────────────────────────

export function getStatus(): SemanticStatus {
  if (!S.booted) {
    S.booted = true
    S.enabled = getSetting('semantic_enabled') === '1'
    // A persisted "on" resumes lazily, the first time a UI asks for status.
    if (S.enabled) void startRun()
  }
  const local = S.meta ?? readLocalMeta()
  const dbv = localDbVersion()
  return {
    enabled: S.enabled,
    phase: S.phase,
    pct: S.pct,
    error: S.error,
    mock: SEMANTIC_MOCK,
    indexDownloaded: !!local,
    indexBytes: local ? local.bytes : 0,
    modelBytes: dirBytes(hfCacheDir()),
    count: local?.count ?? 0,
    builtAt: local?.builtAt ?? null,
    dbMismatch: !!local && !!dbv && local.dbVersion !== dbv,
  }
}

// ── lifecycle ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function disposeLoaded() {
  const w = S.worker
  S.worker = null // detach first so its exit handler ignores the kill
  S.extractor = null
  S.matrix = null
  S.meta = null
  if (w && w.exitCode === null) w.kill()
}

async function downloadIndex(token: number, signal: AbortSignal) {
  mkdirSync(modelsDir(), { recursive: true })
  const base = indexBaseUrl() + baseName()
  const metaRes = await fetch(base + '.json', { signal })
  if (!metaRes.ok) {
    throw new Error(`Index download failed (${metaRes.status}): ${base}.json`)
  }
  const meta = parseIndexMeta(await metaRes.json())
  if (
    !meta ||
    !isIndexCompatible(
      meta,
      {
        indexVersion: TAG_INDEX_VERSION,
        model: MODEL_KEY,
        dims: SEMANTIC_DIMS,
        size: SEMANTIC_INDEX_SIZE,
      },
      meta.bytes,
    )
  ) {
    throw new Error(
      'The published tag index is not compatible with this app version',
    )
  }
  const binRes = await fetch(base + '.bin', { signal })
  if (!binRes.ok || !binRes.body) {
    throw new Error(`Index download failed (${binRes.status}): ${base}.bin`)
  }
  const total = Number(binRes.headers.get('content-length')) || meta.bytes
  const tmp = binPath() + '.tmp'
  const fd = openSync(tmp, 'w')
  const hash = createHash('sha256')
  let got = 0
  try {
    const reader = binRes.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (S.token !== token) throw new Error('cancelled')
      hash.update(value)
      writeSync(fd, value)
      got += value.length
      S.pct = Math.min(99, Math.round((got / total) * 100))
    }
  } finally {
    closeSync(fd)
  }
  if (got !== meta.bytes || hash.digest('hex') !== meta.sha256) {
    rmSync(tmp, { force: true })
    throw new Error('Index checksum mismatch (corrupt download)')
  }
  renameSync(tmp, binPath())
  const metaTmp = metaPath() + '.tmp'
  // write meta last: its presence marks a complete index
  writeFileSync(metaTmp, JSON.stringify(meta))
  renameSync(metaTmp, metaPath())
  log.info('downloadIndex', 'Tag index downloaded', { bytes: got })
}

async function loadModel(token: number) {
  if (SEMANTIC_MOCK) {
    for (let i = 1; i <= 5; i++) {
      await sleep(MOCK_DELAY_MS / 5)
      if (S.token !== token) return
      S.pct = i * 20
    }
    S.extractor = (texts) => {
      const out = new Float32Array(texts.length * 768)
      texts.forEach((t, i) => out.set(mockEmbed(t), i * 768))
      return Promise.resolve(out)
    }
    return
  }
  const script = resolve(
    process.cwd(),
    'src/server/workers/semantic-worker.mjs',
  )
  if (!fsExists(script)) {
    throw new Error(
      'Worker script not found (run the app from its project folder)',
    )
  }
  const w = fork(script, [], {
    serialization: 'advanced',
    execArgv: [],
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  S.worker = w
  const pending = new Map<
    number,
    { resolve: (v: Float32Array) => void; reject: (e: Error) => void }
  >()
  let nextId = 1
  const failAll = (err: Error) => {
    for (const p of pending.values()) p.reject(err)
    pending.clear()
  }
  const files = new Map<string, { loaded: number; total: number }>()
  await new Promise<void>((resolveReady, rejectReady) => {
    w.on('message', (m: WorkerMsg) => {
      if (m.type === 'progress') {
        files.set(m.file, { loaded: m.loaded, total: m.total })
        // the big weights file dominates: report its progress
        let big = { loaded: 0, total: 1 }
        for (const f of files.values()) if (f.total > big.total) big = f
        if (S.token === token) {
          S.pct = Math.min(99, Math.round((big.loaded / big.total) * 100))
        }
      } else if (m.type === 'ready') {
        resolveReady()
      } else if (m.type === 'result') {
        pending.get(m.id)?.resolve(m.data)
        pending.delete(m.id)
      } else if (m.type === 'error') {
        const err = new Error(m.message)
        if (m.id != null) {
          pending.get(m.id)?.reject(err)
          pending.delete(m.id)
        } else rejectReady(err)
      }
    })
    w.on('exit', (code, signal) => {
      const err = new Error(
        `Model process exited unexpectedly (${signal ?? code})`,
      )
      failAll(err)
      rejectReady(err)
      if (S.worker === w) {
        // crashed after loading: surface as error with Retry
        S.worker = null
        S.extractor = null
        S.matrix = null
        S.meta = null
        if (S.enabled) {
          S.phase = 'error'
          S.pct = null
          S.error = err.message
          log.error('worker', err.message)
        }
      }
    })
    w.send({
      type: 'init',
      cacheDir: hfCacheDir(),
      modelId: SEMANTIC_MODEL_ID,
      dtype: SEMANTIC_MODEL_DTYPE,
    })
  })
  if (S.token !== token) {
    if (S.worker === w) S.worker = null
    w.kill()
    return
  }
  S.extractor = (texts) =>
    new Promise<Float32Array>((res, rej) => {
      if (S.worker !== w) return rej(new Error('SEMANTIC_NOT_READY'))
      const id = nextId++
      pending.set(id, { resolve: res, reject: rej })
      w.send({ type: 'embed', id, texts })
    })
}

async function run(token: number, signal: AbortSignal) {
  try {
    S.error = null
    if (!readLocalMeta()) {
      S.phase = 'downloadingIndex'
      S.pct = 0
      await downloadIndex(token, signal)
    }
    if (S.token !== token) return
    S.phase = 'downloadingModel'
    S.pct = 0
    await loadModel(token)
    if (S.token !== token) return
    S.phase = 'loading'
    S.pct = null
    const meta = readLocalMeta()
    if (!meta) throw new Error('Tag index is missing')
    const buf = readFileSync(binPath())
    S.matrix = new Int8Array(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
    )
    S.meta = meta
    if (S.token !== token) return
    S.phase = 'ready'
    log.info('run', 'Semantic search ready', { count: meta.count })
  } catch (e) {
    if (S.token !== token) return
    const msg = e instanceof Error ? e.message : String(e)
    log.error('run', 'Semantic enable failed', { error: msg })
    disposeLoaded()
    S.phase = 'error'
    S.pct = null
    S.error = msg
  }
}

function startRun(): Promise<void> {
  const token = ++S.token
  S.abort?.abort()
  S.abort = new AbortController()
  return run(token, S.abort.signal)
}

export function enable(): SemanticStatus {
  S.booted = true
  S.enabled = true
  putSetting('semantic_enabled', '1')
  if (S.phase === 'off' || S.phase === 'error') void startRun()
  return getStatus()
}

export async function disable(): Promise<SemanticStatus> {
  S.booted = true
  S.enabled = false
  putSetting('semantic_enabled', '0')
  S.token++
  S.abort?.abort()
  S.abort = null
  disposeLoaded()
  S.phase = 'off'
  S.pct = null
  S.error = null
  return getStatus()
}

/** Switch off and remove the model cache and the downloaded index. */
export async function deleteFiles(): Promise<SemanticStatus> {
  await disable()
  rmSync(modelsDir(), { recursive: true, force: true })
  return getStatus()
}

// ── search ───────────────────────────────────────────────────────────────────

export async function semanticSearch(
  query: string,
  limit = 50,
): Promise<Array<SemanticRow>> {
  if (S.phase !== 'ready' || !S.extractor || !S.matrix || !S.meta) {
    throw new Error('SEMANTIC_NOT_READY')
  }
  const q = query.trim()
  if (!q) return []
  const meta = S.meta
  const matrix = S.matrix
  const raw = await S.extractor([queryPrompt(q)])
  const qv = truncateNormalize(raw, SEMANTIC_DIMS)
  // over-fetch: some index names may be absent from the local danbooru.db
  const hits = topK(matrix, SEMANTIC_DIMS, qv, Math.min(limit, 100) + 20)
  const d = getDanbooruDb()
  if (!d) return []
  const stmt = d.prepare(
    'SELECT name, post_count, category FROM tags WHERE name = ? AND is_deprecated = 0',
  )
  const out: Array<SemanticRow> = []
  for (const h of hits) {
    const r = stmt.get(meta.names[h.index]) as
      | { name: string; post_count: number; category: number }
      | undefined
    if (!r) continue
    const c = categorize(d, r.name, r.category)
    out.push({
      name: r.name,
      postCount: r.post_count,
      category: r.category,
      top: c.top,
      fine: c.fine,
      score: h.score,
    })
    if (out.length >= limit) break
  }
  return out
}
