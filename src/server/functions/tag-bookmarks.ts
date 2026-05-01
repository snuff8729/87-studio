import { createServerFn } from '@tanstack/react-start'
import { asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { mkdirSync, unlinkSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { db } from '../db'
import {
  tagBookmarkImages,
  tagBookmarkTagAssignments,
  tagBookmarkTags,
  tagBookmarks,
  generatedImages,
} from '../db/schema'
import { generateThumbnail } from '../services/image'
import { createLogger } from '../services/logger'

const log = createLogger('fn.tagBookmarks')
const TAG_IMAGES_DIR = './data/tag-images'

function normalizePath(p: string): string {
  return p.replaceAll('\\', '/')
}

// ── Bookmark CRUD ──

export const listTagBookmarks = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { search?: string; tags?: Array<string> } | undefined) =>
      data ?? {},
  )
  .handler(async ({ data }) => {
    const allBookmarks = db
      .select()
      .from(tagBookmarks)
      .orderBy(asc(tagBookmarks.name))
      .all()

    return allBookmarks
      .map((b) => {
        const tags = db
          .select({ id: tagBookmarkTags.id, name: tagBookmarkTags.name })
          .from(tagBookmarkTagAssignments)
          .innerJoin(
            tagBookmarkTags,
            eq(tagBookmarkTagAssignments.tagId, tagBookmarkTags.id),
          )
          .where(eq(tagBookmarkTagAssignments.bookmarkId, b.id))
          .orderBy(asc(tagBookmarkTags.name))
          .all()

        let thumbnailPath: string | null = null
        if (b.thumbnailImageId) {
          const img = db
            .select({ thumbnailPath: tagBookmarkImages.thumbnailPath })
            .from(tagBookmarkImages)
            .where(eq(tagBookmarkImages.id, b.thumbnailImageId))
            .get()
          thumbnailPath = img?.thumbnailPath ?? null
        }

        const imageCount = db
          .select({ count: sql<number>`count(*)` })
          .from(tagBookmarkImages)
          .where(eq(tagBookmarkImages.bookmarkId, b.id))
          .get()

        return { ...b, tags, thumbnailPath, imageCount: imageCount?.count ?? 0 }
      })
      .filter((b) => {
        if (data.tags && data.tags.length > 0) {
          const bTagNames = b.tags.map((t) => t.name)
          if (!data.tags.some((ft) => bTagNames.includes(ft))) return false
        }
        if (data.search) {
          if (!b.name.toLowerCase().includes(data.search.toLowerCase()))
            return false
        }
        return true
      })
  })

export const getTagBookmark = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const bookmark = db
      .select()
      .from(tagBookmarks)
      .where(eq(tagBookmarks.id, id))
      .get()
    if (!bookmark) throw new Error('Bookmark not found')

    const images = db
      .select()
      .from(tagBookmarkImages)
      .where(eq(tagBookmarkImages.bookmarkId, id))
      .orderBy(asc(tagBookmarkImages.sortOrder))
      .all()

    const tags = db
      .select({ id: tagBookmarkTags.id, name: tagBookmarkTags.name })
      .from(tagBookmarkTagAssignments)
      .innerJoin(
        tagBookmarkTags,
        eq(tagBookmarkTagAssignments.tagId, tagBookmarkTags.id),
      )
      .where(eq(tagBookmarkTagAssignments.bookmarkId, id))
      .orderBy(asc(tagBookmarkTags.name))
      .all()

    return { ...bookmark, images, tags }
  })

export const createTagBookmark = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; memo?: string }) => data)
  .handler(async ({ data }) => {
    const result = db
      .insert(tagBookmarks)
      .values({ name: data.name.trim(), memo: data.memo })
      .returning()
      .get()
    log.info('create', 'Tag bookmark created', {
      id: result.id,
      name: data.name,
    })
    return result
  })

export const updateTagBookmark = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; memo?: string }) => data)
  .handler(async ({ data }) => {
    db.update(tagBookmarks)
      .set({ memo: data.memo, updatedAt: new Date().toISOString() })
      .where(eq(tagBookmarks.id, data.id))
      .run()
    return { success: true }
  })

export const deleteTagBookmark = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const uploadedImages = db
      .select()
      .from(tagBookmarkImages)
      .where(eq(tagBookmarkImages.bookmarkId, id))
      .all()
      .filter((img) => img.source === 'upload')

    for (const img of uploadedImages) {
      try {
        if (existsSync(img.filePath)) unlinkSync(img.filePath)
        if (img.thumbnailPath && existsSync(img.thumbnailPath))
          unlinkSync(img.thumbnailPath)
      } catch {
        // ignore cleanup errors
      }
    }

    db.delete(tagBookmarks).where(eq(tagBookmarks.id, id)).run()
    log.info('delete', 'Tag bookmark deleted', { id })
    return { success: true }
  })

// ── Image management ──

export const addBookmarkImageFromGallery = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bookmarkId: number; galleryImageId: number }) => data,
  )
  .handler(async ({ data }) => {
    const img = db
      .select()
      .from(generatedImages)
      .where(eq(generatedImages.id, data.galleryImageId))
      .get()
    if (!img) throw new Error('Image not found')

    const result = db
      .insert(tagBookmarkImages)
      .values({
        bookmarkId: data.bookmarkId,
        source: 'gallery',
        galleryImageId: data.galleryImageId,
        filePath: img.filePath,
        thumbnailPath: img.thumbnailPath,
      })
      .returning()
      .get()
    return result
  })

export const addBookmarkImageUpload = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bookmarkId: number; imageData: string; filename: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const buffer = Buffer.from(data.imageData, 'base64')
    const uuid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const ext = data.filename.split('.').pop() || 'png'

    const dir = join(TAG_IMAGES_DIR, String(data.bookmarkId))
    mkdirSync(dir, { recursive: true })

    const filePath = normalizePath(join(dir, `${uuid}.${ext}`))
    const thumbnailPath = normalizePath(join(dir, `${uuid}_thumb.png`))

    writeFileSync(filePath, buffer)
    await generateThumbnail(filePath, thumbnailPath)

    const result = db
      .insert(tagBookmarkImages)
      .values({
        bookmarkId: data.bookmarkId,
        source: 'upload',
        filePath,
        thumbnailPath,
      })
      .returning()
      .get()
    return result
  })

export const removeBookmarkImage = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const img = db
      .select()
      .from(tagBookmarkImages)
      .where(eq(tagBookmarkImages.id, id))
      .get()
    if (!img) return { success: true }

    if (img.source === 'upload') {
      try {
        if (existsSync(img.filePath)) unlinkSync(img.filePath)
        if (img.thumbnailPath && existsSync(img.thumbnailPath))
          unlinkSync(img.thumbnailPath)
      } catch {
        // ignore
      }
    }

    db.delete(tagBookmarkImages).where(eq(tagBookmarkImages.id, id)).run()
    return { success: true }
  })

export const setBookmarkThumbnail = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bookmarkId: number; imageId: number }) => data,
  )
  .handler(async ({ data }) => {
    db.update(tagBookmarks)
      .set({
        thumbnailImageId: data.imageId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tagBookmarks.id, data.bookmarkId))
      .run()
    return { success: true }
  })

// ── Classification tags ──

export const listBookmarkTags = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db
      .select({ id: tagBookmarkTags.id, name: tagBookmarkTags.name })
      .from(tagBookmarkTags)
      .orderBy(asc(tagBookmarkTags.name))
      .all()
  },
)

export const setBookmarkTags = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bookmarkId: number; tagNames: Array<string> }) => data,
  )
  .handler(async ({ data }) => {
    const { bookmarkId, tagNames } = data
    const uniqueNames = [
      ...new Set(
        tagNames
          .map((n) => n.trim().toLowerCase())
          .filter((n) => n.length > 0),
      ),
    ]

    db.delete(tagBookmarkTagAssignments)
      .where(eq(tagBookmarkTagAssignments.bookmarkId, bookmarkId))
      .run()

    if (uniqueNames.length > 0) {
      for (const name of uniqueNames) {
        db.insert(tagBookmarkTags)
          .values({ name })
          .onConflictDoNothing()
          .run()
      }

      const tagRows = db
        .select({ id: tagBookmarkTags.id })
        .from(tagBookmarkTags)
        .where(inArray(tagBookmarkTags.name, uniqueNames))
        .all()

      for (const tag of tagRows) {
        db.insert(tagBookmarkTagAssignments)
          .values({ bookmarkId, tagId: tag.id })
          .run()
      }
    }

    const usedTagIds = db
      .selectDistinct({ tagId: tagBookmarkTagAssignments.tagId })
      .from(tagBookmarkTagAssignments)
      .all()
      .map((r) => r.tagId)

    if (usedTagIds.length === 0) {
      db.delete(tagBookmarkTags).run()
    } else {
      db.delete(tagBookmarkTags)
        .where(notInArray(tagBookmarkTags.id, usedTagIds))
        .run()
    }

    return { success: true }
  })
