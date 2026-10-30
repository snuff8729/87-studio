// Maintainer script: build the prebuilt natural-language tag index.
//
//   runtime/node/node.exe scripts/build-tag-index.mjs <danbooru.db> \
//       [--n 50000] [--dims 256] [--out <dir>] [--cache <dir>] [--batch 16] [--mock]
//
// Embeds the top N general/character/copyright tags with the real
// EmbeddingGemma model (onnx-community/embeddinggemma-300m-ONNX, q8) and writes
//   <out>/tag-index-<model>-<N>-<dims>.bin   int8 vectors, row-major N x dims
//   <out>/tag-index-<model>-<N>-<dims>.json  meta (names, model, dims, sha256, ...)
// Upload both files next to danbooru.db on HuggingFace (TAG_INDEX_BASE_URL in
// src/lib/semantic.ts) and bump TAG_INDEX_VERSION when the contents change.
// Resumable: partial progress lives in <out>/.build/ and is reused on restart.
// --mock builds a tiny hash-embedded index (smoke tests) without any model.
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import ts from 'typescript'

// The shared pure helpers are TypeScript: transpile them on the fly (no tsx).
const root = resolve(import.meta.dirname, '..')
const tsOut = join(tmpdir(), 'tag-index-ts-' + process.pid)
mkdirSync(tsOut, { recursive: true })
async function loadLib(name) {
  const src = readFileSync(join(root, 'src/lib', name + '.ts'), 'utf8')
  const js = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const file = join(tsOut, name + '.mjs')
  writeFileSync(file, js)
  return import(pathToFileURL(file).href)
}
const lib = await loadLib('semantic')
const cats = await loadLib('tag-categories')
const dtext = await loadLib('dtext')

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const dbPath = argv.find(
  (a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'),
)
if (!dbPath) {
  console.error(
    'usage: build-tag-index.mjs <danbooru.db> [--n N] [--dims D] [--out DIR] [--mock]',
  )
  process.exit(2)
}
const mock = flag('mock')
let N = Number(opt('n', mock ? 400 : lib.SEMANTIC_INDEX_SIZE))
const DIMS = Number(opt('dims', lib.SEMANTIC_DIMS))
const BATCH = Number(opt('batch', 16))
const CHUNK = 256
const outDir = resolve(opt('out', join(root, 'tag-index-out')))
const cacheDir = resolve(opt('cache', join(tmpdir(), 'tag-index-hf-cache')))
const model = mock ? 'mock' : lib.SEMANTIC_MODEL_KEY
// file name / meta.size always use the nominal size the app expects
const NOMINAL = Number(opt('nominal', lib.SEMANTIC_INDEX_SIZE))
const base = lib.indexBaseName(model, NOMINAL, DIMS)
const buildDir = join(outDir, '.build')
mkdirSync(buildDir, { recursive: true })
const partBin = join(buildDir, `${base}.part`)
const partMeta = join(buildDir, `${base}.part.json`)

// ── source data ──────────────────────────────────────────────────────────────
const d = new Database(resolve(dbPath), { readonly: true })
const versionFile = join(resolve(dbPath, '..'), 'danbooru.db.version')
const dbVersion = existsSync(versionFile)
  ? readFileSync(versionFile, 'utf8').trim()
  : 'unknown'

const tags = d
  .prepare(
    `SELECT name, category FROM tags
     WHERE category IN (0, 3, 4) AND is_deprecated = 0
     ORDER BY post_count DESC, name LIMIT ?`,
  )
  .all(N)
N = tags.length
const names = tags.map((t) => t.name)
const wanted = new Set(names)

const groupMap = new Map()
for (const r of d.prepare('SELECT tag, tag_group FROM tag_groups').all()) {
  if (!wanted.has(r.tag)) continue
  const l = groupMap.get(r.tag)
  if (l) l.push(r.tag_group)
  else groupMap.set(r.tag, [r.tag_group])
}
const aliasMap = new Map()
for (const r of d
  .prepare(
    "SELECT antecedent_name a, consequent_name c FROM tag_aliases WHERE status = 'active'",
  )
  .all()) {
  if (!wanted.has(r.c)) continue
  const l = aliasMap.get(r.c)
  if (!l) aliasMap.set(r.c, [r.a])
  else if (l.length < 3) l.push(r.a)
}
const wikiStmt = d.prepare(
  'SELECT body, other_names FROM wiki_pages WHERE title = ? AND is_deleted = 0',
)

function docFor(t) {
  const cls = cats.classifyTag({
    name: t.name,
    category: t.category,
    groups: groupMap.get(t.name),
  })
  const w = wikiStmt.get(t.name)
  let other = []
  if (w?.other_names) {
    try {
      other = JSON.parse(w.other_names).filter((s) => typeof s === 'string')
    } catch {
      /* ignore */
    }
  }
  return lib.buildDocPrompt({
    name: t.name,
    categoryLabel: cats.categoryLabel(cls.fine, 'en'),
    wiki: dtext.wikiSummary(w?.body, 300),
    aliases: aliasMap.get(t.name),
    otherNames: other,
  })
}

// ── embedder ─────────────────────────────────────────────────────────────────
let embed
if (mock) {
  embed = async (texts) => texts.map((t) => lib.mockEmbed(t))
} else {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = cacheDir
  let lastLog = 0
  console.log(
    `loading ${lib.SEMANTIC_MODEL_ID} (${lib.SEMANTIC_MODEL_DTYPE}), cache ${cacheDir}`,
  )
  const t0 = Date.now()
  const pipe = await pipeline('feature-extraction', lib.SEMANTIC_MODEL_ID, {
    dtype: lib.SEMANTIC_MODEL_DTYPE,
    progress_callback: (p) => {
      if (p.status === 'progress' && Date.now() - lastLog > 3000) {
        lastLog = Date.now()
        console.log(`  download ${p.file} ${Math.round(p.progress ?? 0)}%`)
      }
    },
  })
  console.log(`model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  embed = async (texts) => {
    const out = await pipe(texts, { pooling: 'mean', normalize: true })
    const dim = out.dims[out.dims.length - 1]
    const data = out.data
    return texts.map((_, i) => data.subarray(i * dim, (i + 1) * dim))
  }
}

// ── resume ───────────────────────────────────────────────────────────────────
let done = 0
if (existsSync(partMeta) && existsSync(partBin)) {
  try {
    const pm = JSON.parse(readFileSync(partMeta, 'utf8'))
    const same =
      pm.n === N &&
      pm.dims === DIMS &&
      pm.model === model &&
      pm.dbVersion === dbVersion &&
      pm.first === names[0] &&
      pm.last === names[N - 1]
    if (same && statSync(partBin).size >= pm.done * DIMS) {
      done = pm.done
      truncateSync(partBin, done * DIMS)
      console.log(`resuming at ${done}/${N}`)
    }
  } catch {
    /* start over */
  }
}
if (done === 0) writeFileSync(partBin, Buffer.alloc(0))

// ── build ────────────────────────────────────────────────────────────────────
const started = Date.now()
const startDone = done
while (done < N) {
  const end = Math.min(done + CHUNK, N)
  const docs = []
  for (let i = done; i < end; i++) docs.push(docFor(tags[i]))
  // sort by length inside the chunk to minimise padding
  const order = docs
    .map((_, i) => i)
    .sort((a, b) => docs[a].length - docs[b].length)
  const vecs = new Array(docs.length)
  for (let i = 0; i < order.length; i += BATCH) {
    const idx = order.slice(i, i + BATCH)
    const res = await embed(idx.map((j) => docs[j]))
    idx.forEach((j, k) => {
      vecs[j] = lib.quantizeInt8(lib.truncateNormalize(res[k], DIMS))
    })
  }
  appendFileSync(
    partBin,
    Buffer.concat(
      vecs.map((v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength)),
    ),
  )
  done = end
  writeFileSync(
    partMeta,
    JSON.stringify({
      n: N,
      dims: DIMS,
      model,
      dbVersion,
      first: names[0],
      last: names[N - 1],
      done,
    }),
  )
  const el = Date.now() - started
  const st = lib.progressStats(done - startDone, N - startDone, el)
  console.log(
    `progress ${done}/${N} (${((done / N) * 100).toFixed(1)}%) ${st.docsPerSec.toFixed(1)} docs/s ETA ${st.etaSec ?? '?'}s`,
  )
}

// ── finalize ─────────────────────────────────────────────────────────────────
const binFile = join(outDir, `${base}.bin`)
renameSync(partBin, binFile)
const buf = readFileSync(binFile)
if (buf.length !== N * DIMS)
  throw new Error(`bad bin size ${buf.length} != ${N * DIMS}`)
const meta = {
  version: 1,
  indexVersion: lib.TAG_INDEX_VERSION,
  model,
  dtype: mock ? 'mock' : lib.SEMANTIC_MODEL_DTYPE,
  quantization: 'int8',
  dims: DIMS,
  size: NOMINAL,
  count: N,
  dbVersion,
  builtAt: new Date().toISOString(),
  sha256: createHash('sha256').update(buf).digest('hex'),
  bytes: buf.length,
  names,
}
if (!mock) meta.modelId = lib.SEMANTIC_MODEL_ID
writeFileSync(join(outDir, `${base}.json`), JSON.stringify(meta))
console.log(`done: ${binFile} (${buf.length} bytes) sha256 ${meta.sha256}`)
