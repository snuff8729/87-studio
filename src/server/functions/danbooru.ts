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
