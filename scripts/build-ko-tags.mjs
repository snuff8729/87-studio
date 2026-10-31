// Maintainer script: build the Korean tag data (naia-ko-v<N>.db) from NAIA2.0.
//
//   runtime/node/node.exe scripts/build-ko-tags.mjs [--src <dir>] [--out <dir>]
//       [--danbooru <danbooru.db>] [--version 1]
//   --danbooru reports tags missing there and fills counts of override-only tags.
//
// Source: https://github.com/DNT-LAB/NAIA2.0 (GPL-3.0) at the pinned commit
// below. Files used (see THIRD_PARTY_NOTICES.md):
//   data/KR_tags.parquet                           tag, count, category, desc, keywords
//   data/tag_index/tag_translation_overrides.json  manual description / keyword overrides
//   data/ezmode/category_groups_mapping.json       small category -> 12 groups
// Without --src the files are downloaded from raw.githubusercontent.com.
// Output <out>/naia-ko-v<version>.db (SQLite):
//   meta(key, value)
//   ko_tags(tag PRIMARY KEY, small_category, group_key, description, keywords, count)
//   ko_keywords(keyword, tag, kind)   kind 0 = keyword, 1 = bracketed group token
// Upload it next to danbooru.db on HuggingFace (KO_TAGS_BASE_URL in
// src/lib/ko-tags.ts) and bump KO_TAGS_VERSION when the contents change.
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'

export const NAIA_REPO = 'DNT-LAB/NAIA2.0'
export const NAIA_SHA = 'b5e79e244b4de537c204bdc8d312cc097c1cca8a'
const FILES = [
  'data/KR_tags.parquet',
  'data/tag_index/tag_translation_overrides.json',
  'data/ezmode/category_groups_mapping.json',
]

/** NAIA group (Korean) -> stable ascii key. Mirrored in src/lib/tag-categories.ts. */
export const GROUP_KEYS = {
  '의상/패션': 'fashion',
  '신체/외형': 'body',
  '포즈/동작': 'pose',
  '표정/감정': 'emotion',
  '배경/장소': 'place',
  '사물/오브젝트': 'object',
  '인물/종족': 'people',
  '상황/연출': 'situation',
  '컨셉/스타일': 'concept',
  '표현/연출': 'presentation',
  '성적 요소': 'sexual',
  기타: 'misc',
}

/**
 * NAIA's mapping lists only part of the categories actually used in
 * KR_tags.parquet (e.g. no "인물", "구성", "미디어"). These top-level
 * categories ("<top> > <sub>") are placed by us; the mapping file always wins.
 */
const SUPPLEMENT_TOP = {
  인물: '인물/종족',
  구성: '상황/연출',
  이벤트: '상황/연출',
  가구: '사물/오브젝트',
  품질: '기타',
  버전: '기타',
  검열: '성적 요소',
  미디어: '컨셉/스타일',
  매체: '컨셉/스타일',
  저작권: '컨셉/스타일',
  캐릭터: '컨셉/스타일',
  시리즈: '컨셉/스타일',
  장르: '컨셉/스타일',
  문화: '컨셉/스타일',
  판타지: '컨셉/스타일',
  디자인: '컨셉/스타일',
  아트: '컨셉/스타일',
  미술: '컨셉/스타일',
  화풍: '컨셉/스타일',
  패턴: '컨셉/스타일',
  도형: '컨셉/스타일',
  프레임: '컨셉/스타일',
  작품: '컨셉/스타일',
  게임: '컨셉/스타일',
  시점: '상황/연출',
  시간: '배경/장소',
  건축: '배경/장소',
  '사물/음식': '사물/오브젝트',
  식물: '사물/오브젝트',
  로봇: '사물/오브젝트',
  소품: '사물/오브젝트',
  갑옷: '의상/패션',
  코스프레: '의상/패션',
  메이크업: '신체/외형',
  미용: '신체/외형',
  체형: '신체/외형',
  속성: '신체/외형',
  체위: '성적 요소',
  페티시즘: '성적 요소',
  NSFW: '성적 요소',
}
/** "인물 > <sub>" subs that describe the body rather than the person type. */
const SUPPLEMENT_FINE = {
  '인물 > 눈': '신체/외형',
  '인물 > 체형': '신체/외형',
  '인물 > 피부': '신체/외형',
  '인물 > 머리': '신체/외형',
  '인물 > 가슴': '신체/외형',
  '인물 > 나이': '신체/외형',
  '인물 > 변화': '신체/외형',
}

function arg(name, def) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : def
}

/** NAIA tag -> danbooru.db name (underscores, unescaped parentheses). */
export function normalizeTagName(raw) {
  return String(raw)
    .trim()
    .replace(/\\([()])/g, '$1')
    .replace(/\s+/g, '_')
    .toLowerCase()
}

export function normalizeKeyword(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Split a NAIA `keywords` string. Plain keywords are kept; `<group>` tokens
 * become kind-1 keywords (bracket-free); `<primary>:text` loses its prefix.
 */
export function parseKeywords(raw) {
  const out = []
  const seen = new Set()
  for (const part of String(raw ?? '').split(',')) {
    let t = part.trim()
    if (!t) continue
    let kind = 0
    const group = /^<([^>]*)>\s*:?\s*(.*)$/.exec(t)
    if (group) {
      if (group[2]) t = group[2].trim()
      else {
        t = group[1].trim()
        kind = 1
      }
    }
    const k = normalizeKeyword(t)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ keyword: k, kind })
  }
  return out
}

/** Group name for a "<top> > <sub>" category, or null when unmapped. */
export function groupFor(category, lookup) {
  const [top, sub] = category.split(' > ').map((s) => s.trim())
  return (
    SUPPLEMENT_FINE[category] ??
    (sub && lookup.get(sub)) ??
    lookup.get(top) ??
    SUPPLEMENT_TOP[top] ??
    null
  )
}

async function loadSources(srcDir) {
  const dir = srcDir
    ? resolve(srcDir)
    : join(process.env.TEMP ?? '.', 'naia-src-' + NAIA_SHA.slice(0, 8))
  for (const f of FILES) {
    const p = join(dir, f)
    if (existsSync(p)) continue
    if (srcDir) throw new Error(`Missing ${p}`)
    const url = `https://raw.githubusercontent.com/${NAIA_REPO}/${NAIA_SHA}/${f}`
    console.log('download', url)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, Buffer.from(await res.arrayBuffer()))
  }
  return dir
}

async function main() {
  const version = arg('version', '1')
  const out = resolve(arg('out', '.'))
  mkdirSync(out, { recursive: true })
  const dir = await loadSources(arg('src'))

  const rows = await parquetReadObjects({
    file: await asyncBufferFromFile(join(dir, 'data/KR_tags.parquet')),
  })
  const overrides = JSON.parse(
    readFileSync(
      join(dir, 'data/tag_index/tag_translation_overrides.json'),
      'utf8',
    ),
  ).translations
  const mapping = JSON.parse(
    readFileSync(join(dir, 'data/ezmode/category_groups_mapping.json'), 'utf8'),
  ).group_mapping

  // small category -> group; a category listed twice goes to the first group
  const lookup = new Map()
  for (const [group, smalls] of Object.entries(mapping)) {
    for (const s of smalls) if (!lookup.has(s)) lookup.set(s, group)
  }

  const tags = new Map()
  const unmapped = new Map()
  for (const r of rows) {
    const tag = normalizeTagName(r.tag)
    if (!tag || tags.has(tag)) continue
    const category = String(r.category ?? '').trim()
    let group = category ? groupFor(category, lookup) : null
    if (category && !group) {
      unmapped.set(category, (unmapped.get(category) ?? 0) + 1)
    }
    group ??= '기타'
    tags.set(tag, {
      tag,
      small: category || null,
      group_key: GROUP_KEYS[group],
      description: String(r.desc ?? '').trim(),
      keywords: parseKeywords(r.keywords),
      count: Number(r.count ?? 0),
    })
  }

  let overridden = 0
  let overrideOnly = 0
  for (const [name, o] of Object.entries(overrides)) {
    const tag = normalizeTagName(name)
    let row = tags.get(tag)
    if (!row) {
      // not categorised by NAIA: the app falls back to its own rules
      row = {
        tag,
        small: null,
        group_key: null,
        description: '',
        keywords: [],
        count: 0,
      }
      tags.set(tag, row)
      overrideOnly++
    }
    if (o.description) row.description = String(o.description).trim()
    if (o.keywords_kr) row.keywords = parseKeywords(o.keywords_kr)
    // no NAIA category: a bracketed group token (<무늬>) serves as the small
    // category label; the group itself stays unset (the app uses its rules)
    if (!row.group_key && !row.small) {
      row.small = row.keywords.find((k) => k.kind === 1)?.keyword ?? null
    }
    overridden++
  }

  // optional: report coverage against danbooru.db and fill missing counts
  // (override-only tags have none) from its post counts
  let missingInDanbooru = null
  const dan = arg('danbooru')
  if (dan) {
    const d = new Database(dan, { readonly: true })
    const get = d.prepare('SELECT post_count FROM tags WHERE name = ?')
    missingInDanbooru = []
    for (const t of tags.values()) {
      const r = get.get(t.tag)
      if (!r) missingInDanbooru.push(t.tag)
      else if (!t.count) t.count = r.post_count
    }
    d.close()
  }

  const file = join(out, `naia-ko-v${version}.db`)
  rmSync(file, { force: true })
  const db = new Database(file)
  db.pragma('journal_mode = DELETE')
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE ko_tags (
      tag TEXT PRIMARY KEY,
      small_category TEXT,
      group_key TEXT,
      description TEXT NOT NULL DEFAULT '',
      keywords TEXT NOT NULL DEFAULT '',
      count INTEGER NOT NULL DEFAULT 0
    ) WITHOUT ROWID;
    CREATE TABLE ko_keywords (
      keyword TEXT NOT NULL,
      tag TEXT NOT NULL,
      kind INTEGER NOT NULL DEFAULT 0
    );
  `)
  const insTag = db.prepare('INSERT INTO ko_tags VALUES (?,?,?,?,?,?)')
  const insKw = db.prepare('INSERT INTO ko_keywords VALUES (?,?,?)')
  let kwCount = 0
  db.transaction(() => {
    for (const t of tags.values()) {
      insTag.run(
        t.tag,
        t.small,
        t.group_key,
        t.description,
        t.keywords
          .filter((k) => k.kind === 0)
          .map((k) => k.keyword)
          .join(', '),
        t.count,
      )
      const seen = new Set()
      for (const k of t.keywords) {
        const variants = [k.keyword]
        // "긴 머리" is also found as "긴머리"
        if (k.keyword.includes(' ')) variants.push(k.keyword.replace(/ /g, ''))
        for (const v of variants) {
          if (seen.has(v)) continue
          seen.add(v)
          insKw.run(v, t.tag, k.kind)
          kwCount++
        }
      }
    }
  })()
  db.exec('CREATE INDEX ko_keywords_kw ON ko_keywords(keyword, kind);')
  db.exec('CREATE INDEX ko_keywords_tag ON ko_keywords(tag);')
  const meta = db.prepare('INSERT INTO meta VALUES (?,?)')
  for (const [k, v] of Object.entries({
    source: `https://github.com/${NAIA_REPO}`,
    sha: NAIA_SHA,
    license: 'GPL-3.0',
    built_at: new Date().toISOString(),
    version,
  })) {
    meta.run(k, v)
  }
  db.exec('VACUUM')
  db.close()

  const bytes = readFileSync(file)
  console.log('file       ', file)
  console.log('size       ', statSync(file).size, 'bytes')
  console.log('sha256     ', createHash('sha256').update(bytes).digest('hex'))
  console.log(
    'ko_tags    ',
    tags.size,
    `(overrides ${overridden}, override-only ${overrideOnly})`,
  )
  console.log('ko_keywords', kwCount)
  const byGroup = {}
  for (const t of tags.values()) {
    const g = t.group_key ?? 'none'
    byGroup[g] = (byGroup[g] ?? 0) + 1
  }
  console.log('by group   ', byGroup)
  console.log('unmapped categories -> 기타:', Object.fromEntries(unmapped))
  if (missingInDanbooru) {
    console.log(
      'tags missing in danbooru.db:',
      missingInDanbooru.length,
      missingInDanbooru.slice(0, 15),
    )
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  await main()
}
