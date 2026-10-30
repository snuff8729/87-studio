import Database from 'better-sqlite3'
import { and, eq } from 'drizzle-orm'
import { existsSync } from '../data-fs'
import { dataPath } from '../data-dir'
import { db } from '../db'
import { tagDescriptions } from '../db/schema'
import type { TagCandidate } from '@/lib/tag-query'
import { GROUP_RULES, classifyTag, groupKey } from '@/lib/tag-categories'
import { wikiSummary } from '@/lib/dtext'
import {
  allowsSubstring,
  normalizeTagQuery,
  rankSuggestions,
} from '@/lib/tag-query'

const DB_PATH = './data/danbooru.db'

let danbooruDb: Database.Database | null = null

/** Read-only handle on danbooru.db (null when the file is missing). */
export function getDanbooruDb(): Database.Database | null {
  if (danbooruDb) return danbooruDb
  if (!existsSync(DB_PATH)) return null
  danbooruDb = new Database(dataPath(DB_PATH), { readonly: true })
  danbooruDb.pragma('journal_mode = WAL')
  return danbooruDb
}

// ── category classification (lazy group map + per-tag cache) ─────────────────

let groupMap: Map<string, Array<string>> | null = null
const classCache = new Map<string, { top: string; fine: string }>()

function getGroupMap(d: Database.Database): Map<string, Array<string>> {
  if (groupMap) return groupMap
  groupMap = new Map()
  const rows = d
    .prepare('SELECT tag, tag_group FROM tag_groups')
    .all() as Array<{
    tag: string
    tag_group: string
  }>
  for (const r of rows) {
    const list = groupMap.get(r.tag)
    if (list) list.push(r.tag_group)
    else groupMap.set(r.tag, [r.tag_group])
  }
  return groupMap
}

export function categorize(
  d: Database.Database,
  name: string,
  category: number,
): { top: string; fine: string } {
  const key = `${category}:${name}`
  const hit = classCache.get(key)
  if (hit) return hit
  const value = classifyTag({
    name,
    category,
    groups: getGroupMap(d).get(name),
  })
  if (classCache.size > 50_000) classCache.clear()
  classCache.set(key, value)
  return value
}

// ── suggestions ──────────────────────────────────────────────────────────────

interface TagRow {
  name: string
  post_count: number
  category: number
}

export interface TagSuggestion {
  name: string
  postCount: number
  category: number
  top: string
  fine: string
  kind: TagCandidate['kind']
  via?: string
}

function ftsPhrase(query: string, column?: string): string | null {
  const parts = query.split(/[_\s]+/).filter(Boolean)
  if (parts.length === 0) return null
  const phrase = `"${parts.map((p) => p.replace(/"/g, '')).join(' ')}"*`
  return column ? `${column} : ${phrase}` : phrase
}

function toCandidate(
  r: TagRow,
  kind: TagCandidate['kind'],
  via?: string,
): TagCandidate {
  return {
    name: r.name,
    postCount: r.post_count,
    category: r.category,
    kind,
    via,
  }
}

/** Ranked autocomplete candidates (spec section 3). */
export function suggestTagsFor(
  rawQuery: string,
  limit = 20,
): Array<TagSuggestion> {
  const d = getDanbooruDb()
  if (!d) return []
  const q = normalizeTagQuery(rawQuery)
  if (q.length < 2) return []
  const cands: Array<TagCandidate> = []
  const upper = q + '￿'

  const exact = d
    .prepare('SELECT name, post_count, category FROM tags WHERE name = ?')
    .get(q) as TagRow | undefined
  if (exact) cands.push(toCandidate(exact, 'exact'))

  const aliasExact = d
    .prepare(
      `SELECT t.name, t.post_count, t.category, a.antecedent_name AS via
       FROM tag_aliases a JOIN tags t ON t.name = a.consequent_name
       WHERE a.antecedent_name = ? AND a.status = 'active' LIMIT 5`,
    )
    .all(q) as Array<TagRow & { via: string }>
  for (const r of aliasExact) cands.push(toCandidate(r, 'alias_exact', r.via))

  const prefix = d
    .prepare(
      `SELECT name, post_count, category FROM tags
       WHERE name >= ? AND name < ? AND is_deprecated = 0
       ORDER BY post_count DESC LIMIT ?`,
    )
    .all(q, upper, limit) as Array<TagRow>
  for (const r of prefix) cands.push(toCandidate(r, 'prefix'))

  const aliasPrefix = d
    .prepare(
      `SELECT t.name, t.post_count, t.category, a.antecedent_name AS via
       FROM tag_aliases a JOIN tags t ON t.name = a.consequent_name
       WHERE a.antecedent_name >= ? AND a.antecedent_name < ?
         AND a.status = 'active' AND t.is_deprecated = 0
       ORDER BY t.post_count DESC LIMIT ?`,
    )
    .all(q, upper, limit) as Array<TagRow & { via: string }>
  for (const r of aliasPrefix) cands.push(toCandidate(r, 'alias_prefix', r.via))

  // other_names (Japanese / Korean / alternative spellings) via FTS prefix
  const otherPhrase = ftsPhrase(q, 'other_names')
  if (otherPhrase) {
    try {
      const rows = d
        .prepare(
          `SELECT t.name, t.post_count, t.category
           FROM tags_fts f JOIN tags t ON t.rowid = f.rowid
           WHERE tags_fts MATCH ? AND t.is_deprecated = 0
           ORDER BY t.post_count DESC LIMIT ?`,
        )
        .all(otherPhrase, limit) as Array<TagRow>
      for (const r of rows) cands.push(toCandidate(r, 'alias_prefix'))
    } catch {
      /* malformed FTS query: skip */
    }
  }

  const have = new Set(cands.map((c) => c.name))
  if (have.size < limit && allowsSubstring(q)) {
    const rows = d
      .prepare(
        `SELECT name, post_count, category FROM tags
         WHERE name LIKE ? ESCAPE '\\' AND is_deprecated = 0
         ORDER BY post_count DESC LIMIT ?`,
      )
      .all(`%${q.replace(/[\\%_]/g, '\\$&')}%`, limit) as Array<TagRow>
    for (const r of rows) cands.push(toCandidate(r, 'substring'))
  }

  return rankSuggestions(cands, limit).map((c) => ({
    ...c,
    ...categorize(d, c.name, c.category),
  }))
}

// ── Tag Search window ────────────────────────────────────────────────────────

export interface TagSearchRow {
  name: string
  postCount: number
  category: number
  top: string
  fine: string
}

const DAN_TABS: Record<string, number> = {
  character: 4,
  artist: 1,
  copyright: 3,
}

/**
 * Tag Search results. `tab`: 'all', 'general', a Danbooru category key
 * (character / artist / copyright) or a general top-level / fine category.
 */
export function searchTagsFor(
  rawQuery: string,
  tab: string,
  limit = 200,
): Array<TagSearchRow> {
  const d = getDanbooruDb()
  if (!d) return []
  const q = normalizeTagQuery(rawQuery)
  const danCat =
    tab in DAN_TABS ? DAN_TABS[tab] : tab === 'general' ? 0 : undefined
  const fineFilter = tab !== 'all' && danCat === undefined ? tab : null
  const scan = fineFilter ? 6000 : Math.max(limit * 2, 400)

  const cats = danCat !== undefined ? 'AND category = ' + danCat : ''
  // fine filters only make sense for general tags; meta key also matches the
  // Danbooru "meta" category (5)
  const generalOnly =
    fineFilter && fineFilter !== 'meta' ? 'AND category = 0' : ''
  const catSql = `${cats} ${generalOnly}`
  const rows = new Map<string, TagRow>()
  const add = (list: Array<TagRow>) => {
    for (const r of list) if (!rows.has(r.name)) rows.set(r.name, r)
  }

  if (!q) {
    add(
      d
        .prepare(
          `SELECT name, post_count, category FROM tags
           WHERE is_deprecated = 0 ${catSql}
           ORDER BY post_count DESC LIMIT ?`,
        )
        .all(scan) as Array<TagRow>,
    )
  } else {
    const exact = d
      .prepare(
        `SELECT name, post_count, category FROM tags WHERE name = ? ${catSql}`,
      )
      .get(q) as TagRow | undefined
    if (exact) add([exact])
    const aliasHit = d
      .prepare(
        `SELECT t.name, t.post_count, t.category FROM tag_aliases a
         JOIN tags t ON t.name = a.consequent_name
         WHERE a.antecedent_name = ? AND a.status = 'active'`,
      )
      .all(q) as Array<TagRow>
    add(aliasHit)
    if (allowsSubstring(q)) {
      add(
        d
          .prepare(
            `SELECT name, post_count, category FROM tags
             WHERE name LIKE ? ESCAPE '\\' AND is_deprecated = 0 ${catSql}
             ORDER BY post_count DESC LIMIT ?`,
          )
          .all(`%${q.replace(/[\\%_]/g, '\\$&')}%`, scan) as Array<TagRow>,
      )
    } else {
      add(
        d
          .prepare(
            `SELECT name, post_count, category FROM tags
             WHERE name >= ? AND name < ? AND is_deprecated = 0 ${catSql}
             ORDER BY post_count DESC LIMIT ?`,
          )
          .all(q, q + '￿', scan) as Array<TagRow>,
      )
    }
    const phrase = ftsPhrase(q, 'other_names')
    if (phrase) {
      try {
        add(
          d
            .prepare(
              `SELECT t.name, t.post_count, t.category
               FROM tags_fts f JOIN tags t ON t.rowid = f.rowid
               WHERE tags_fts MATCH ? AND t.is_deprecated = 0
               ORDER BY t.post_count DESC LIMIT ?`,
            )
            .all(phrase, 100) as Array<TagRow>,
        )
      } catch {
        /* ignore */
      }
    }
  }

  let out: Array<TagSearchRow> = []
  for (const r of rows.values()) {
    if (danCat !== undefined && r.category !== danCat) continue
    if (fineFilter && fineFilter !== 'meta' && r.category !== 0) continue
    const c = categorize(d, r.name, r.category)
    if (fineFilter && c.top !== fineFilter && c.fine !== fineFilter) continue
    out.push({
      name: r.name,
      postCount: r.post_count,
      category: r.category,
      top: c.top,
      fine: c.fine,
    })
  }
  out.sort((a, b) => {
    const ea = a.name === q ? 0 : 1
    const eb = b.name === q ? 0 : 1
    return ea - eb || b.postCount - a.postCount
  })
  out = out.slice(0, limit)
  return out
}

// ── tag info (card / info panel / detail pane) ───────────────────────────────

export interface TagInfo {
  name: string
  /** Set when the requested name was an alias of `name` */
  aliasOf: string | null
  postCount: number
  category: number
  top: string
  fine: string
  deprecated: boolean
  description: string | null
  descriptionSource: 'custom' | 'wiki' | null
  aliases: Array<string>
  implies: Array<string>
  impliedBy: Array<string>
  sameGroup: { group: string; tags: Array<string> } | null
}

const CHIP_LIMIT = 8
const infoCache = new Map<string, TagInfo | null>()

function localeBase(locale: string): string {
  return locale.toLowerCase().split('-')[0]
}

/** Description for a tag: stored locale text, else English wiki summary. */
export function resolveDescription(
  d: Database.Database,
  name: string,
  locale: string,
): { text: string | null; source: 'custom' | 'wiki' | null } {
  const loc = localeBase(locale)
  const custom = db
    .select({ text: tagDescriptions.text })
    .from(tagDescriptions)
    .where(and(eq(tagDescriptions.tag, name), eq(tagDescriptions.locale, loc)))
    .get()
  if (custom?.text) return { text: custom.text, source: 'custom' }
  const wiki = d
    .prepare('SELECT body FROM wiki_pages WHERE title = ?')
    .get(name) as { body: string | null } | undefined
  const text = wikiSummary(wiki?.body)
  return text ? { text, source: 'wiki' } : { text: null, source: null }
}

export function getTagInfoFor(rawName: string, locale: string): TagInfo | null {
  const d = getDanbooruDb()
  if (!d) return null
  const q = normalizeTagQuery(rawName)
  if (!q) return null
  const cacheKey = `${localeBase(locale)}|${q}`
  if (infoCache.has(cacheKey)) return infoCache.get(cacheKey) ?? null

  let aliasOf: string | null = null
  let tag = d
    .prepare(
      'SELECT name, post_count, category, is_deprecated FROM tags WHERE name = ?',
    )
    .get(q) as (TagRow & { is_deprecated: number }) | undefined
  if (!tag) {
    const alias = d
      .prepare(
        `SELECT t.name, t.post_count, t.category, t.is_deprecated
         FROM tag_aliases a JOIN tags t ON t.name = a.consequent_name
         WHERE a.antecedent_name = ? AND a.status = 'active' LIMIT 1`,
      )
      .get(q) as (TagRow & { is_deprecated: number }) | undefined
    if (alias) {
      tag = alias
      aliasOf = q
    }
  }
  if (!tag) {
    infoCache.set(cacheKey, null)
    return null
  }
  const name = tag.name
  const names = (sql: string, ...args: Array<string | number>) =>
    (d.prepare(sql).all(...args) as Array<{ n: string }>).map((r) => r.n)

  const aliases = names(
    `SELECT antecedent_name AS n FROM tag_aliases
     WHERE consequent_name = ? AND status = 'active' ORDER BY id LIMIT ?`,
    name,
    CHIP_LIMIT,
  )
  const implies = names(
    `SELECT i.consequent_name AS n FROM tag_implications i
     LEFT JOIN tags t ON t.name = i.consequent_name
     WHERE i.antecedent_name = ? AND i.status = 'active'
     ORDER BY t.post_count DESC LIMIT ?`,
    name,
    CHIP_LIMIT,
  )
  const impliedBy = names(
    `SELECT i.antecedent_name AS n FROM tag_implications i
     LEFT JOIN tags t ON t.name = i.antecedent_name
     WHERE i.consequent_name = ? AND i.status = 'active'
     ORDER BY t.post_count DESC LIMIT ?`,
    name,
    CHIP_LIMIT,
  )

  const groups = getGroupMap(d).get(name) ?? []
  let sameGroup: TagInfo['sameGroup'] = null
  if (groups.length > 0) {
    // Most specific group = highest rule score, else the first one
    const best = [...groups].sort(
      (a, b) =>
        (GROUP_RULES[groupKey(b)]?.score ?? 0) -
        (GROUP_RULES[groupKey(a)]?.score ?? 0),
    )[0]
    const members = names(
      `SELECT tg.tag AS n FROM tag_groups tg
       LEFT JOIN tags t ON t.name = tg.tag
       WHERE tg.tag_group = ? AND tg.tag != ?
       ORDER BY t.post_count DESC LIMIT ?`,
      best,
      name,
      CHIP_LIMIT,
    )
    sameGroup = { group: groupKey(best), tags: members }
  }

  const desc = resolveDescription(d, name, locale)
  const cls = categorize(d, name, tag.category)
  const info: TagInfo = {
    name,
    aliasOf,
    postCount: tag.post_count,
    category: tag.category,
    top: cls.top,
    fine: cls.fine,
    deprecated: tag.is_deprecated === 1,
    description: desc.text,
    descriptionSource: desc.source,
    aliases,
    implies,
    impliedBy,
    sameGroup,
  }
  if (infoCache.size > 5_000) infoCache.clear()
  infoCache.set(cacheKey, info)
  return info
}

/** Drop cached infos (after a description was written). */
export function clearTagInfoCache() {
  infoCache.clear()
}
