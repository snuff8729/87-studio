import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { tagDescriptions } from '../db/schema'
import {
  clearTagInfoCache,
  getDanbooruDb,
  getTagInfoFor,
  searchTagsFor,
  suggestTagsFor,
} from '../services/tag-index'
import { getTagRemoteFor } from '../services/tag-remote'
import type { RemoteKind } from '@/lib/tag-remote'

export type { RemoteResult } from '../services/tag-remote'
export type {
  TagInfo,
  TagSearchRow,
  TagSuggestion,
} from '../services/tag-index'

/** Ranked autocomplete candidates for the text being typed. */
export const suggestTags = createServerFn({ method: 'GET' })
  .inputValidator((data: { query: string; limit?: number }) => data)
  .handler(({ data }) => suggestTagsFor(data.query, data.limit ?? 20))

/** Card / info panel / detail pane data; null when the tag is unknown. */
export const getTagInfo = createServerFn({ method: 'GET' })
  .inputValidator((data: { name: string; locale: string }) => data)
  .handler(({ data }) => getTagInfoFor(data.name, data.locale))

/**
 * Danbooru related tags / used-together tags / rating counts for a canonical
 * tag name (cached 7 days). Failures are returned as { ok: false }.
 */
export const getTagRemote = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { name: string; kind: RemoteKind; force?: boolean }) => data,
  )
  .handler(({ data }) =>
    getTagRemoteFor(data.name, data.kind, data.force === true),
  )

/** Tag Search window results (tab: all/general/character/artist/copyright/<category>). */
export const searchTagsWindow = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { query: string; tab: string; limit?: number }) => data,
  )
  .handler(({ data }) =>
    searchTagsFor(data.query, data.tab, Math.min(data.limit ?? 200, 200)),
  )

/** Whether the Danbooru tag DB is installed. */
export const hasTagDb = createServerFn({ method: 'GET' }).handler(
  () => getDanbooruDb() !== null,
)

/** Store a localized description (for a future import / translation). */
export const setTagDescription = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { tag: string; locale: string; text: string; source?: string }) =>
      data,
  )
  .handler(({ data }) => {
    db.insert(tagDescriptions)
      .values({
        tag: data.tag,
        locale: data.locale.toLowerCase().split('-')[0],
        text: data.text,
        source: data.source ?? null,
      })
      .onConflictDoUpdate({
        target: [tagDescriptions.tag, tagDescriptions.locale],
        set: {
          text: data.text,
          source: data.source ?? null,
          updatedAt: sql`(datetime('now'))`,
        },
      })
      .run()
    clearTagInfoCache()
    return { ok: true }
  })
