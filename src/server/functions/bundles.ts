import { createServerFn } from '@tanstack/react-start'
import { asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { db } from '../db'
import {
  bundleTagAssignments,
  bundleTags,
  generatedImages,
  imageBundles,
  promptBundles,
} from '../db/schema'
import { createLogger } from '../services/logger'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from '../data-fs'
import type { StyleParams } from '@/lib/style-bundles'
import type { BundleKind, WildcardMode } from '@/lib/wildcard'
import { parseStyleParams, sanitizeStyleParams } from '@/lib/style-bundles'
import { normalizeKind, normalizeMode } from '@/lib/wildcard'

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

      const { styleParams, ...rest } = b
      return {
        ...rest,
        styleParams: parseStyleParams(styleParams),
        imageCount: count?.count ?? 0,
        thumbnailPath,
        tags,
      }
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
        kind: promptBundles.kind,
        wildcardMode: promptBundles.wildcardMode,
        negative: promptBundles.negative,
        styleParams: promptBundles.styleParams,
      })
      .from(promptBundles)
      .orderBy(asc(promptBundles.name))
      .all()
      .map((b) => ({ ...b, styleParams: parseStyleParams(b.styleParams) }))
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
  .inputValidator((data: { bundleId: number; tagNames: Array<string> }) => data)
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
        db.insert(bundleTags).values({ name }).onConflictDoNothing().run()
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
      db.delete(bundleTags).where(notInArray(bundleTags.id, usedTagIds)).run()
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

    return {
      ...bundle,
      styleParams: parseStyleParams(bundle.styleParams),
      imageCount: count?.count ?? 0,
    }
  })

export const createBundle = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      name: string
      description?: string
      content?: string
      kind?: BundleKind
      wildcardMode?: WildcardMode
      negative?: string
      styleParams?: StyleParams
    }) => data,
  )
  .handler(async ({ data }) => {
    const result = db
      .insert(promptBundles)
      .values({
        name: data.name.trim(),
        description: data.description,
        content: data.content ?? '',
        kind: normalizeKind(data.kind),
        wildcardMode: normalizeMode(data.wildcardMode),
        negative: data.negative ?? '',
        styleParams:
          data.styleParams !== undefined
            ? JSON.stringify(sanitizeStyleParams(data.styleParams))
            : null,
      })
      .returning()
      .get()
    log.info('create', 'Bundle created', {
      bundleId: result.id,
      name: data.name,
    })
    return result
  })

const PREVIEW_DIR = 'data/bundle-previews'
const PREVIEW_LONG_SIDE = 512

/**
 * "Save as bundle": create a text / style bundle from an image.
 * - `imageId` (gallery image): becomes the thumbnail and is linked to the bundle
 * - `imageData` (base64 upload, not in the DB): stored as a 512px webp preview
 */
export const createBundleFromImage = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      kind: BundleKind
      name: string
      content: string
      negative?: string
      styleParams?: StyleParams
      imageId?: number
      imageData?: string
    }) => data,
  )
  .handler(async ({ data }) => {
    const name = data.name.trim()
    if (!name) throw new Error('EMPTY_BUNDLE_NAME')
    const kind = data.kind === 'style' ? 'style' : 'text'
    const isStyle = kind === 'style'

    const bundle = db.transaction((tx) => {
      const dup = tx
        .select({ id: promptBundles.id })
        .from(promptBundles)
        .where(eq(promptBundles.name, name))
        .get()
      if (dup) throw new Error('DUPLICATE_BUNDLE_NAME')

      const row = tx
        .insert(promptBundles)
        .values({
          name,
          content: data.content,
          kind,
          negative: isStyle ? (data.negative ?? '') : '',
          styleParams: isStyle
            ? JSON.stringify(sanitizeStyleParams(data.styleParams ?? {}))
            : null,
          thumbnailImageId: data.imageId ?? null,
        })
        .returning()
        .get()
      if (data.imageId != null) {
        const exists = tx
          .select({ id: generatedImages.id })
          .from(generatedImages)
          .where(eq(generatedImages.id, data.imageId))
          .get()
        if (!exists) throw new Error('Image not found')
        tx.insert(imageBundles)
          .values({ imageId: data.imageId, bundleId: row.id })
          .onConflictDoNothing()
          .run()
      }
      return row
    })

    // Uploaded image: the file is written after the transaction. A failure
    // leaves the bundle without a preview (logged), never without the bundle.
    let previewPath: string | null = null
    if (data.imageId == null && data.imageData) {
      try {
        const buffer = await sharp(Buffer.from(data.imageData, 'base64'))
          .resize({
            width: PREVIEW_LONG_SIDE,
            height: PREVIEW_LONG_SIDE,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 85 })
          .toBuffer()
        mkdirSync(PREVIEW_DIR, { recursive: true })
        const logical = `${PREVIEW_DIR}/${bundle.id}.webp`
        writeFileSync(logical, buffer)
        db.update(promptBundles)
          .set({ previewPath: logical })
          .where(eq(promptBundles.id, bundle.id))
          .run()
        previewPath = logical
      } catch (error) {
        log.warn('createFromImage', 'Failed to save bundle preview', {
          bundleId: bundle.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    log.info('createFromImage', 'Bundle created from image', {
      bundleId: bundle.id,
      name,
      kind,
      imageId: data.imageId ?? null,
      preview: previewPath !== null,
    })
    return { id: bundle.id, name, previewPath }
  })

export const updateBundle = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      name?: string
      description?: string
      content?: string
      kind?: BundleKind
      wildcardMode?: WildcardMode
      negative?: string
      styleParams?: StyleParams
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
    if (updates.kind !== undefined) setValues.kind = normalizeKind(updates.kind)
    if (updates.wildcardMode !== undefined)
      setValues.wildcardMode = normalizeMode(updates.wildcardMode)
    if (updates.negative !== undefined) setValues.negative = updates.negative
    if (updates.styleParams !== undefined) {
      setValues.styleParams = JSON.stringify(
        sanitizeStyleParams(updates.styleParams),
      )
    }

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
    const row = db
      .select({ previewPath: promptBundles.previewPath })
      .from(promptBundles)
      .where(eq(promptBundles.id, id))
      .get()
    db.delete(promptBundles).where(eq(promptBundles.id, id)).run()
    // NAIA preview file belongs to the bundle
    if (row?.previewPath && existsSync(row.previewPath)) {
      try {
        unlinkSync(row.previewPath)
      } catch (error) {
        log.warn('delete', 'Failed to delete bundle preview', {
          bundleId: id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
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
      .orderBy(desc(generatedImages.createdAt), desc(generatedImages.id))
      .limit(limit)
      .offset(offset)
      .all()
  })
