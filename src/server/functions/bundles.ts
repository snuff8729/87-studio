import { createServerFn } from '@tanstack/react-start'
import { asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  bundleTagAssignments,
  bundleTags,
  generatedImages,
  imageBundles,
  promptBundles,
} from '../db/schema'
import { createLogger } from '../services/logger'

const log = createLogger('fn.bundles')

export const listBundles = createServerFn({ method: 'GET' }).handler(
  async () => {
    const bundles = db
      .select()
      .from(promptBundles)
      .orderBy(asc(promptBundles.name))
      .all()

    return bundles.map((b) => {
      const count = db
        .select({ count: sql<number>`count(*)` })
        .from(imageBundles)
        .where(eq(imageBundles.bundleId, b.id))
        .get()

      let thumbnailPath: string | null = null
      if (b.thumbnailImageId) {
        const img = db
          .select({ thumbnailPath: generatedImages.thumbnailPath })
          .from(generatedImages)
          .where(eq(generatedImages.id, b.thumbnailImageId))
          .get()
        thumbnailPath = img?.thumbnailPath ?? null
      }

      const tags = db
        .select({ id: bundleTags.id, name: bundleTags.name })
        .from(bundleTagAssignments)
        .innerJoin(bundleTags, eq(bundleTagAssignments.tagId, bundleTags.id))
        .where(eq(bundleTagAssignments.bundleId, b.id))
        .orderBy(asc(bundleTags.name))
        .all()

      return { ...b, imageCount: count?.count ?? 0, thumbnailPath, tags }
    })
  },
)

export const listBundleNames = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db
      .select({
        id: promptBundles.id,
        name: promptBundles.name,
        content: promptBundles.content,
      })
      .from(promptBundles)
      .orderBy(asc(promptBundles.name))
      .all()
  },
)

export const listBundleTags = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db
      .select({ id: bundleTags.id, name: bundleTags.name })
      .from(bundleTags)
      .orderBy(asc(bundleTags.name))
      .all()
  },
)

export const setBundleTags = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bundleId: number; tagNames: Array<string> }) => data,
  )
  .handler(async ({ data }) => {
    const { bundleId, tagNames } = data
    const normalizedNames = tagNames
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n.length > 0)

    // Remove duplicates
    const uniqueNames = [...new Set(normalizedNames)]

    // Delete existing assignments for this bundle
    db.delete(bundleTagAssignments)
      .where(eq(bundleTagAssignments.bundleId, bundleId))
      .run()

    if (uniqueNames.length > 0) {
      // Upsert tags — insert missing, get all IDs
      for (const name of uniqueNames) {
        db.insert(bundleTags)
          .values({ name })
          .onConflictDoNothing()
          .run()
      }

      const tagRows = db
        .select({ id: bundleTags.id, name: bundleTags.name })
        .from(bundleTags)
        .where(inArray(bundleTags.name, uniqueNames))
        .all()

      // Insert assignments
      for (const tag of tagRows) {
        db.insert(bundleTagAssignments)
          .values({ bundleId, tagId: tag.id })
          .run()
      }
    }

    // Clean up orphan tags (tags with no assignments)
    const usedTagIds = db
      .selectDistinct({ tagId: bundleTagAssignments.tagId })
      .from(bundleTagAssignments)
      .all()
      .map((r) => r.tagId)

    if (usedTagIds.length === 0) {
      db.delete(bundleTags).run()
    } else {
      db.delete(bundleTags)
        .where(notInArray(bundleTags.id, usedTagIds))
        .run()
    }

    log.info('setBundleTags', 'Bundle tags updated', {
      bundleId,
      tags: uniqueNames,
    })
    return { success: true }
  })

export const getBundle = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const bundle = db
      .select()
      .from(promptBundles)
      .where(eq(promptBundles.id, id))
      .get()
    if (!bundle) throw new Error('Bundle not found')

    const count = db
      .select({ count: sql<number>`count(*)` })
      .from(imageBundles)
      .where(eq(imageBundles.bundleId, id))
      .get()

    return { ...bundle, imageCount: count?.count ?? 0 }
  })

export const createBundle = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { name: string; description?: string; content?: string }) => data,
  )
  .handler(async ({ data }) => {
    const result = db
      .insert(promptBundles)
      .values({
        name: data.name.trim(),
        description: data.description,
        content: data.content ?? '',
      })
      .returning()
      .get()
    log.info('create', 'Bundle created', {
      bundleId: result.id,
      name: data.name,
    })
    return result
  })

export const updateBundle = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      name?: string
      description?: string
      content?: string
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    const setValues: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }
    if (updates.name !== undefined) setValues.name = updates.name.trim()
    if (updates.description !== undefined)
      setValues.description = updates.description
    if (updates.content !== undefined) setValues.content = updates.content

    db.update(promptBundles)
      .set(setValues)
      .where(eq(promptBundles.id, id))
      .run()
    return { success: true }
  })

export const deleteBundle = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    log.info('delete', 'Bundle deleted', { bundleId: id })
    db.delete(promptBundles).where(eq(promptBundles.id, id)).run()
    return { success: true }
  })

export const setBundleThumbnail = createServerFn({ method: 'POST' })
  .inputValidator((data: { bundleId: number; imageId: number }) => data)
  .handler(async ({ data }) => {
    db.update(promptBundles)
      .set({
        thumbnailImageId: data.imageId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(promptBundles.id, data.bundleId))
      .run()
    return { success: true }
  })

export const listBundleImages = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { bundleId: number; page?: number; limit?: number }) => data,
  )
  .handler(async ({ data }) => {
    const page = data.page ?? 1
    const limit = data.limit ?? 40
    const offset = (page - 1) * limit

    return db
      .select({
        id: generatedImages.id,
        filePath: generatedImages.filePath,
        thumbnailPath: generatedImages.thumbnailPath,
        seed: generatedImages.seed,
        isFavorite: generatedImages.isFavorite,
        rating: generatedImages.rating,
        createdAt: generatedImages.createdAt,
      })
      .from(imageBundles)
      .innerJoin(generatedImages, eq(imageBundles.imageId, generatedImages.id))
      .where(eq(imageBundles.bundleId, data.bundleId))
      .orderBy(desc(generatedImages.createdAt))
      .limit(limit)
      .offset(offset)
      .all()
  })
