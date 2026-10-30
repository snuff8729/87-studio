import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { and } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { generatedImages } from '../../db/schema'
import { afterPosition, imageOrder, sortValues } from '../image-query'
import type { ImageSort } from '../image-query'

function setup() {
  const sqlite = new Database(':memory:')
  sqlite.exec(
    'CREATE TABLE generated_images (id INTEGER PRIMARY KEY, created_at TEXT, rating INTEGER, is_favorite INTEGER)',
  )
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: i + 1,
    createdAt: `2026-01-0${(i % 4) + 1} 00:00:00`,
    rating: i % 3 === 0 ? null : i % 5,
    isFavorite: i % 4 === 0 ? 1 : i % 7 === 0 ? null : 0,
  }))
  const ins = sqlite.prepare('INSERT INTO generated_images VALUES (?,?,?,?)')
  for (const r of rows) ins.run(r.id, r.createdAt, r.rating, r.isFavorite)
  return { db: drizzle(sqlite), rows }
}

describe('keyset neighbours match the list order', () => {
  const sorts: Array<ImageSort> = ['newest', 'oldest', 'rating', 'favorites']
  for (const sortBy of sorts) {
    it(sortBy, () => {
      const { db, rows } = setup()
      const ordered = db
        .select({ id: generatedImages.id })
        .from(generatedImages)
        .orderBy(...imageOrder(sortBy))
        .all()
        .map((r) => r.id)
      for (const row of rows) {
        const pos = sortValues(sortBy, row)
        const neighbour = (side: 'after' | 'before') =>
          db
            .select({ id: generatedImages.id })
            .from(generatedImages)
            .where(and(afterPosition(sortBy, pos, side)))
            .orderBy(...imageOrder(sortBy, side === 'before'))
            .limit(1)
            .get()?.id ?? null
        const at = ordered.indexOf(row.id)
        expect(neighbour('before')).toBe(ordered[at - 1] ?? null)
        expect(neighbour('after')).toBe(ordered[at + 1] ?? null)
      }
    })
  }
})
