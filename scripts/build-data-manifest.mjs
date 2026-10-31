#!/usr/bin/env node
// Builds data-manifest.json from the local data files (the owner runs this
// after uploading new files, then uploads the manifest too).
//
//   node scripts/build-data-manifest.mjs --dir <folder> [--out data-manifest.json]
//        [--version danbooru=2 --version ko=1 --version semantic=1]
//        [--prev data-manifest.json]
//
// <folder> holds danbooru.db, naia-ko-v<N>.db and tag-index-*.bin/.json (any
// subset; missing datasets are left out and keep their built-in entry in the
// app). Versions default to the ones in --prev, else "1". Bump a version when
// the file contents changed; a new Korean file name (naia-ko-v2.db) means
// version 2 by convention.
import { createHash } from 'node:crypto'
import {
  createReadStream,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = (name) => {
  const out = []
  for (let i = 0; i < args.length; i++)
    if (args[i] === name) out.push(args[++i])
  return out
}
const dir = opt('--dir')[0]
if (!dir) {
  console.error(
    'usage: build-data-manifest.mjs --dir <folder> [--out file] [--version key=v] [--prev manifest.json]',
  )
  process.exit(2)
}
const versions = Object.fromEntries(opt('--version').map((v) => v.split('=')))
const prevPath = opt('--prev')[0]
const prev = prevPath ? JSON.parse(readFileSync(prevPath, 'utf8')) : null

function sha256(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path)
      .on('data', (c) => h.update(c))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')))
  })
}

async function fileEntry(name) {
  const p = join(dir, name)
  return { name, size: statSync(p).size, sha256: await sha256(p) }
}

const names = readdirSync(dir)
const groups = {
  danbooru: { files: names.filter((n) => n === 'danbooru.db') },
  ko: {
    files: names
      .filter((n) => /^naia-ko-v\d+\.db$/.test(n))
      .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]))
      .slice(0, 1),
    requires: ['danbooru'],
  },
  semantic: {
    files: names.filter((n) => /^tag-index-.*\.(bin|json)$/.test(n)).sort(),
    requires: ['danbooru'],
  },
}

const manifest = { schema: 1, files: {} }
for (const [key, g] of Object.entries(groups)) {
  if (g.files.length === 0) continue
  let version = versions[key] ?? prev?.files?.[key]?.version ?? '1'
  if (key === 'ko' && !versions[key] && !prev?.files?.[key]) {
    version = g.files[0].match(/\d+/)[0]
  }
  manifest.files[key] = {
    version,
    ...(g.requires ? { requires: g.requires } : {}),
    files: await Promise.all(g.files.map(fileEntry)),
  }
}

const json = JSON.stringify(manifest, null, 2) + '\n'
const out = opt('--out')[0]
if (out) {
  writeFileSync(out, json)
  console.error(`wrote ${out}`)
} else {
  process.stdout.write(json)
}
