import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { promptBundles, imageBundles, generatedImages } from '../db/schema'
import { eq, asc, sql, desc } from 'drizzle-orm'
import { createLogger } from '../services/logger'

const log = createLogger('fn.bundles')

export const listBundles = createServerFn({ method: 'GET' }).handler(async () => {
  const bundles = db.select().from(promptBundles).orderBy(asc(promptBundles.name)).all()

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

    return { ...b, imageCount: count?.count ?? 0, thumbnailPath }
  })
})

export const listBundleNames = createServerFn({ method: 'GET' }).handler(async () => {
  return db
    .select({ id: promptBundles.id, name: promptBundles.name, content: promptBundles.content })
    .from(promptBundles)
    .orderBy(asc(promptBundles.name))
    .all()
})

export const getBundle = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const bundle = db.select().from(promptBundles).where(eq(promptBundles.id, id)).get()
    if (!bundle) throw new Error('Bundle not found')

    const count = db
      .select({ count: sql<number>`count(*)` })
      .from(imageBundles)
      .where(eq(imageBundles.bundleId, id))
      .get()

    return { ...bundle, imageCount: count?.count ?? 0 }
  })

export const createBundle = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; description?: string; content?: string }) => data)
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
    log.info('create', 'Bundle created', { bundleId: result.id, name: data.name })
    return result
  })

export const updateBundle = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; name?: string; description?: string; content?: string }) => data)
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    const setValues: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (updates.name !== undefined) setValues.name = updates.name.trim()
    if (updates.description !== undefined) setValues.description = updates.description
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
      .set({ thumbnailImageId: data.imageId, updatedAt: new Date().toISOString() })
      .where(eq(promptBundles.id, data.bundleId))
      .run()
    return { success: true }
  })

export const listBundleImages = createServerFn({ method: 'GET' })
  .inputValidator((data: { bundleId: number; page?: number; limit?: number }) => data)
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
