/**
 * Natural-language tag search: pure helpers (prompt formats, vector math,
 * int8 quantization, top-k, index metadata compatibility). No I/O.
 */

export const SEMANTIC_DIMS = 256
/** Size of the prebuilt index (top tags by post count). */
export const SEMANTIC_INDEX_SIZE = 50000

export const SEMANTIC_MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX'
export const SEMANTIC_MODEL_DTYPE = 'q8'
export const SEMANTIC_MODEL_KEY = 'embeddinggemma-300m-q8'

/** Bump when a new prebuilt index is uploaded (format or contents changed). */
export const TAG_INDEX_VERSION = '1'
export const TAG_INDEX_BASE_URL =
  'https://huggingface.co/datasets/snuff8729/87-studio/resolve/main/'

export function indexBaseName(
  model = SEMANTIC_MODEL_KEY,
  size = SEMANTIC_INDEX_SIZE,
  dims = SEMANTIC_DIMS,
): string {
  return `tag-index-${model}-${size}-${dims}`
}

// ── EmbeddingGemma prompts ───────────────────────────────────────────────────

export function queryPrompt(text: string): string {
  return `task: search result | query: ${text.trim()}`
}

export function documentPrompt(title: string, text: string): string {
  return `title: ${title} | text: ${text}`
}

/** Danbooru tag name -> readable words. */
export function tagTitle(name: string): string {
  return name.replace(/_/g, ' ')
}

/** Leading sentences of `text`, cut at a sentence end within `max` chars. */
export function firstSentences(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const stop = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('。'),
    cut.lastIndexOf('! '),
  )
  if (stop > max * 0.4) return cut.slice(0, stop + 1)
  return cut.trimEnd() + '…'
}

export const DOC_TEXT_MAX = 360

/** Document prompt for one tag (category label + wiki lead + aliases). */
export function buildDocPrompt(input: {
  name: string
  categoryLabel: string
  wiki?: string | null
  aliases?: ReadonlyArray<string>
  otherNames?: ReadonlyArray<string>
}): string {
  const parts: Array<string> = [input.categoryLabel + '.']
  if (input.wiki) parts.push(firstSentences(input.wiki, 200))
  const also = [
    ...(input.aliases ?? []).slice(0, 3).map(tagTitle),
    ...(input.otherNames ?? []).slice(0, 2),
  ]
  if (also.length > 0) parts.push('Also: ' + also.join(', ') + '.')
  let text = parts.join(' ')
  if (text.length > DOC_TEXT_MAX) text = text.slice(0, DOC_TEXT_MAX)
  return documentPrompt(tagTitle(input.name), text)
}

// ── vector math ──────────────────────────────────────────────────────────────

/** Matryoshka truncation to `dims` followed by L2 normalization. */
export function truncateNormalize(
  v: ArrayLike<number>,
  dims: number,
): Float32Array {
  const n = Math.min(dims, v.length)
  const out = new Float32Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    out[i] = v[i]
    sum += out[i] * out[i]
  }
  const norm = Math.sqrt(sum) || 1
  for (let i = 0; i < n; i++) out[i] /= norm
  return out
}

/** Unit-norm float vector -> int8 (scale 127). */
export function quantizeInt8(v: ArrayLike<number>): Int8Array {
  const out = new Int8Array(v.length)
  for (let i = 0; i < v.length; i++) {
    out[i] = Math.max(-127, Math.min(127, Math.round(v[i] * 127)))
  }
  return out
}

export function dequantizeInt8(q: Int8Array): Float32Array {
  const out = new Float32Array(q.length)
  for (let i = 0; i < q.length; i++) out[i] = q[i] / 127
  return out
}

export interface ScoredIndex {
  index: number
  score: number
}

/**
 * Brute-force cosine top-k of a unit-norm float `query` over a row-major int8
 * matrix of unit-norm rows. Scores are approximate cosines in [-1, 1].
 */
export function topK(
  matrix: Int8Array,
  dims: number,
  query: Float32Array,
  k: number,
): Array<ScoredIndex> {
  const rows = Math.floor(matrix.length / dims)
  const best: Array<ScoredIndex> = []
  let floor = -Infinity
  for (let r = 0; r < rows; r++) {
    const base = r * dims
    let dot = 0
    for (let i = 0; i < dims; i++) dot += matrix[base + i] * query[i]
    const score = dot / 127
    if (best.length < k || score > floor) {
      // insertion into a descending list
      let pos = best.length
      while (pos > 0 && best[pos - 1].score < score) pos--
      best.splice(pos, 0, { index: r, score })
      if (best.length > k) best.pop()
      if (best.length === k) floor = best[k - 1].score
    }
  }
  return best
}

// ── index metadata ───────────────────────────────────────────────────────────

export interface IndexMeta {
  version: 1
  indexVersion: string
  model: string
  dtype: string
  quantization: 'int8'
  dims: number
  size: number
  count: number
  /** danbooru.db version the index was built from (informational) */
  dbVersion: string
  builtAt: string
  /** sha256 / size of the .bin vector file */
  sha256: string
  bytes: number
  names: Array<string>
}

export interface IndexExpectation {
  indexVersion: string
  model: string
  dims: number
  size: number
}

export function parseIndexMeta(raw: unknown): IndexMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Partial<IndexMeta>
  if (
    m.version !== 1 ||
    typeof m.model !== 'string' ||
    typeof m.dims !== 'number' ||
    typeof m.size !== 'number' ||
    typeof m.count !== 'number' ||
    typeof m.indexVersion !== 'string' ||
    typeof m.dtype !== 'string' ||
    typeof m.dbVersion !== 'string' ||
    typeof m.sha256 !== 'string' ||
    typeof m.bytes !== 'number' ||
    typeof m.builtAt !== 'string' ||
    !Array.isArray(m.names) ||
    m.names.length !== m.count
  ) {
    return null
  }
  return m as IndexMeta
}

export function isIndexCompatible(
  meta: IndexMeta,
  want: IndexExpectation,
  binBytes: number,
): boolean {
  return (
    meta.indexVersion === want.indexVersion &&
    meta.model === want.model &&
    meta.dims === want.dims &&
    meta.size === want.size &&
    binBytes === meta.count * meta.dims &&
    binBytes === meta.bytes
  )
}

/** Throughput / ETA for the progress display. */
export function progressStats(
  done: number,
  total: number,
  elapsedMs: number,
): { docsPerSec: number; etaSec: number | null } {
  if (done <= 0 || elapsedMs <= 0) return { docsPerSec: 0, etaSec: null }
  const docsPerSec = done / (elapsedMs / 1000)
  return {
    docsPerSec,
    etaSec: Math.max(0, Math.round((total - done) / docsPerSec)),
  }
}

// ── deterministic mock embedder (SEMANTIC_MOCK=1) ────────────────────────────

function fnv(str: string, seed: number): number {
  let h = 2166136261 ^ seed
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Hash-based bag-of-words vector: texts sharing words score high. */
export function mockEmbed(text: string, dims = 768): Float32Array {
  const v = new Float32Array(dims)
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  for (const w of words) {
    // light stemming so "smiling" ~ "smile"
    const stem =
      w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '').replace(/e$/, '') : w
    for (let k = 0; k < 8; k++) {
      const h = fnv(stem, k)
      v[h % dims] += (h & 0x10000) === 0 ? 1 : -1
    }
  }
  return truncateNormalize(v, dims)
}
