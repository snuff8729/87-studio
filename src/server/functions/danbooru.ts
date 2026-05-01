import { createServerFn } from '@tanstack/react-start'
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'

const DB_PATH = './data/danbooru.db'

let danbooruDb: Database.Database | null = null

function getDb(): Database.Database | null {
  if (danbooruDb) return danbooruDb
  if (!existsSync(DB_PATH)) return null
  danbooruDb = new Database(DB_PATH, { readonly: true })
  danbooruDb.pragma('journal_mode = WAL')
  return danbooruDb
}

export interface DanbooruTag {
  name: string
  postCount: number
  category: number // 0=general, 1=artist, 3=copyright, 4=character, 5=meta
}

const CATEGORY_LABEL: Record<number, string> = {
  0: 'general',
  1: 'artist',
  3: 'copyright',
  4: 'character',
  5: 'meta',
}

export interface DanbooruTagDetail {
  name: string
  postCount: number
  category: number
  categoryLabel: string
  isDeprecated: boolean
  otherNames: Array<string>
  wikiBody: string | null
  aliases: Array<string>
  implications: Array<string>
  impliedBy: Array<string>
  tagGroups: Array<string>
  groupMembers: Record<string, Array<string>>
}

export const getDanbooruTagDetail = createServerFn({ method: 'GET' })
  .inputValidator((name: string) => name)
  .handler(async ({ data: name }): Promise<DanbooruTagDetail | null> => {
    const db = getDb()
    if (!db) return null

    const tag = db
      .prepare('SELECT * FROM tags WHERE name = ?')
      .get(name) as {
      id: number
      name: string
      post_count: number
      category: number
      is_deprecated: number
    } | undefined

    if (!tag) return null

    // Wiki page (other names + body)
    const wiki = db
      .prepare('SELECT other_names, body FROM wiki_pages WHERE title = ?')
      .get(name) as { other_names: string | null; body: string | null } | undefined

    let otherNames: Array<string> = []
    if (wiki?.other_names) {
      // Format: "['name1' 'name2' ...]" — parse manually
      const matches = wiki.other_names.match(/'([^']+)'/g)
      if (matches) {
        otherNames = matches.map((m) => m.slice(1, -1))
      }
    }

    // Aliases (what redirects to this tag)
    const aliases = db
      .prepare(
        "SELECT antecedent_name FROM tag_aliases WHERE consequent_name = ? AND status = 'active'",
      )
      .all(name) as Array<{ antecedent_name: string }>

    // Implications (this tag implies → X)
    const implications = db
      .prepare(
        "SELECT consequent_name FROM tag_implications WHERE antecedent_name = ? AND status = 'active'",
      )
      .all(name) as Array<{ consequent_name: string }>

    // Implied by (X → this tag)
    const impliedBy = db
      .prepare(
        "SELECT antecedent_name FROM tag_implications WHERE consequent_name = ? AND status = 'active'",
      )
      .all(name) as Array<{ antecedent_name: string }>

    // Tag groups this tag belongs to
    const groups = db
      .prepare('SELECT tag_group FROM tag_groups WHERE tag = ?')
      .all(name) as Array<{ tag_group: string }>

    // Members of each group (limited)
    const groupMembers: Record<string, Array<string>> = {}
    for (const g of groups) {
      const members = db
        .prepare(
          'SELECT tg.tag, t.post_count FROM tag_groups tg LEFT JOIN tags t ON t.name = tg.tag WHERE tg.tag_group = ? AND tg.tag != ? ORDER BY t.post_count DESC LIMIT 30',
        )
        .all(g.tag_group, name) as Array<{ tag: string }>
      const label = g.tag_group.replace('tag_group:', '')
      groupMembers[label] = members.map((m) => m.tag)
    }

    return {
      name: tag.name,
      postCount: tag.post_count,
      category: tag.category,
      categoryLabel: CATEGORY_LABEL[tag.category] ?? 'unknown',
      isDeprecated: tag.is_deprecated === 1,
      otherNames,
      wikiBody: wiki?.body ?? null,
      aliases: aliases.map((a) => a.antecedent_name),
      implications: implications.map((i) => i.consequent_name),
      impliedBy: impliedBy.map((i) => i.antecedent_name),
      tagGroups: groups.map((g) => g.tag_group.replace('tag_group:', '')),
      groupMembers,
    }
  })

export const searchDanbooruTags = createServerFn({ method: 'GET' })
  .inputValidator((data: { query: string; limit?: number }) => data)
  .handler(async ({ data }): Promise<Array<DanbooruTag>> => {
    const db = getDb()
    if (!db) return []

    const query = data.query.trim()
    if (!query || query.length < 2) return []

    const limit = data.limit ?? 15

    // FTS5 search with prefix matching, join back to tags for data
    const ftsQuery = query.replace(/['"]/g, '').replace(/\s+/g, ' ') + '*'

    try {
      const rows = db
        .prepare(
          `SELECT t.name, t.post_count, t.category
           FROM tags_fts f
           JOIN tags t ON t.rowid = f.rowid
           WHERE tags_fts MATCH ?
           ORDER BY t.post_count DESC
           LIMIT ?`,
        )
        .all(ftsQuery, limit) as Array<{
        name: string
        post_count: number
        category: number
      }>

      return rows.map((r) => ({
        name: r.name,
        postCount: r.post_count,
        category: r.category,
      }))
    } catch {
      // FTS query syntax error — fall back to LIKE
      const likeQuery = `%${query}%`
      const rows = db
        .prepare(
          `SELECT name, post_count, category
           FROM tags
           WHERE name LIKE ?
           ORDER BY post_count DESC
           LIMIT ?`,
        )
        .all(likeQuery, limit) as Array<{
        name: string
        post_count: number
        category: number
      }>

      return rows.map((r) => ({
        name: r.name,
        postCount: r.post_count,
        category: r.category,
      }))
    }
  })
