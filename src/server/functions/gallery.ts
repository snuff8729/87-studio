import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  generatedImages,
  imageBundles,
  imageTags,
  projectScenes,
  projects,
  promptBundles,
  tags,
} from '../db/schema'
import {
  afterPosition,
  buildImageConditions,
  imageOrder,
  sortValues,
} from '../services/image-query'
import type { ImageFilters, ImageSort } from '../services/image-query'
import { createLogger } from '../services/logger'
import { deleteImageFiles } from '../services/image'

const log = createLogger('fn.gallery')

export const listImages = createServerFn({ method: 'GET' })
  .inputValidator(
    (
      data: ImageFilters & {
        page?: number
        limit?: number
        sortBy?: ImageSort
      },
    ) => data,
  )
  .handler(async ({ data }) => {
    const page = data.page ?? 1
    const limit = data.limit ?? 40
    const offset = (page - 1) * limit
    const conditions = buildImageConditions(data)

    let query = db
      .select()
      .from(generatedImages)
      .orderBy(...imageOrder(data.sortBy))
      .limit(limit)
      .offset(offset)

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query
    }

    return query.all()
  })

export const updateImage = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      isFavorite?: number
      rating?: number | null
      memo?: string | null
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    db.update(generatedImages)
      .set(updates)
      .where(eq(generatedImages.id, id))
      .run()
    return { success: true }
  })

export const getImageDetail = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const image = db
      .select()
      .from(generatedImages)
      .where(eq(generatedImages.id, id))
      .get()
    if (!image) throw new Error('Image not found')

    const imgTags = db
      .select({ tagId: imageTags.tagId, tagName: tags.name })
      .from(imageTags)
      .innerJoin(tags, eq(imageTags.tagId, tags.id))
      .where(eq(imageTags.imageId, id))
      .all()

    // Fetch project name
    let projectName: string | null = null
    if (image.projectId) {
      const proj = db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, image.projectId))
        .get()
      projectName = proj?.name ?? null
    }

    // Fetch project scene name
    let projectSceneName: string | null = null
    if (image.projectSceneId) {
      const scene = db
        .select({ name: projectScenes.name })
        .from(projectScenes)
        .where(eq(projectScenes.id, image.projectSceneId))
        .get()
      projectSceneName = scene?.name ?? null
    }

    return { ...image, tags: imgTags, projectName, projectSceneName }
  })

export const addTag = createServerFn({ method: 'POST' })
  .inputValidator((data: { imageId: number; tagName: string }) => data)
  .handler(async ({ data }) => {
    // Get or create tag
    let tag = db
      .select()
      .from(tags)
      .where(eq(tags.name, data.tagName.trim().toLowerCase()))
      .get()
    if (!tag) {
      tag = db
        .insert(tags)
        .values({ name: data.tagName.trim().toLowerCase() })
        .returning()
        .get()
    }

    // Add image-tag link (ignore if already exists)
    db.insert(imageTags)
      .values({ imageId: data.imageId, tagId: tag.id })
      .onConflictDoNothing()
      .run()

    return tag
  })

export const removeTag = createServerFn({ method: 'POST' })
  .inputValidator((data: { imageId: number; tagId: number }) => data)
  .handler(async ({ data }) => {
    db.delete(imageTags)
      .where(
        and(
          eq(imageTags.imageId, data.imageId),
          eq(imageTags.tagId, data.tagId),
        ),
      )
      .run()
    return { success: true }
  })

/** For each tag on any of the images: how many of them carry it. */
export const getImageTagCounts = createServerFn({ method: 'GET' })
  .inputValidator((data: { imageIds: Array<number> }) => data)
  .handler(async ({ data }) => {
    if (data.imageIds.length === 0) return []
    return db
      .select({
        tagId: imageTags.tagId,
        count: sql<number>`count(*)`,
      })
      .from(imageTags)
      .where(inArray(imageTags.imageId, data.imageIds))
      .groupBy(imageTags.tagId)
      .all()
  })

/** Adds (creating missing tags by name) and/or removes tags on many images. */
export const bulkUpdateImageTags = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      imageIds: Array<number>
      addTagNames?: Array<string>
      addTagIds?: Array<number>
      removeTagIds?: Array<number>
    }) => data,
  )
  .handler(async ({ data }) => {
    if (data.imageIds.length === 0) return { tags: [] }
    const addIds = new Set(data.addTagIds ?? [])
    const created: Array<{ id: number; name: string }> = []
    for (const raw of data.addTagNames ?? []) {
      const name = raw.trim().toLowerCase()
      if (!name) continue
      let tag = db.select().from(tags).where(eq(tags.name, name)).get()
      if (!tag) {
        tag = db.insert(tags).values({ name }).returning().get()
      }
      created.push(tag)
      addIds.add(tag.id)
    }
    for (const tagId of addIds) {
      for (const imageId of data.imageIds) {
        db.insert(imageTags)
          .values({ imageId, tagId })
          .onConflictDoNothing()
          .run()
      }
    }
    if (data.removeTagIds && data.removeTagIds.length > 0) {
      db.delete(imageTags)
        .where(
          and(
            inArray(imageTags.imageId, data.imageIds),
            inArray(imageTags.tagId, data.removeTagIds),
          ),
        )
        .run()
    }
    return { tags: created }
  })

export const listTags = createServerFn({ method: 'GET' }).handler(async () => {
  return db.select().from(tags).orderBy(tags.name).all()
})

export const listProjectsForFilter = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .all()
  },
)

export const listScenesForFilter = createServerFn({ method: 'GET' })
  .inputValidator((data: { projectId: number }) => data)
  .handler(async ({ data }) => {
    // Get all project scenes for the given project (through project_scene_packs)
    const scenes = db
      .select({
        id: projectScenes.id,
        name: projectScenes.name,
      })
      .from(projectScenes)
      .innerJoin(
        sql`project_scene_packs`,
        sql`project_scene_packs.id = ${projectScenes.projectScenePackId}`,
      )
      .where(sql`project_scene_packs.project_id = ${data.projectId}`)
      .orderBy(projectScenes.sortOrder)
      .all()
    return scenes
  })

export const getImageDetailPage = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: {
      imageId: number
      /** Prev/next walk this filtered, sorted list (the gallery's) */
      filters?: ImageFilters & { sortBy?: ImageSort }
    }) => data,
  )
  .handler(async ({ data }) => {
    const image = db
      .select()
      .from(generatedImages)
      .where(eq(generatedImages.id, data.imageId))
      .get()
    if (!image) throw new Error('Image not found')

    const imgTags = db
      .select({ tagId: imageTags.tagId, tagName: tags.name })
      .from(imageTags)
      .innerJoin(tags, eq(imageTags.tagId, tags.id))
      .where(eq(imageTags.imageId, data.imageId))
      .all()

    let projectName: string | null = null
    if (image.projectId) {
      const proj = db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, image.projectId))
        .get()
      projectName = proj?.name ?? null
    }

    let projectSceneName: string | null = null
    if (image.projectSceneId) {
      const scene = db
        .select({ name: projectScenes.name })
        .from(projectScenes)
        .where(eq(projectScenes.id, image.projectSceneId))
        .get()
      projectSceneName = scene?.name ?? null
    }

    // Prev/next = neighbours in the same filtered, sorted list as the grid
    const f = data.filters ?? {}
    const conditions = buildImageConditions(f)
    const position = sortValues(f.sortBy, image)
    const neighbour = (side: 'after' | 'before') =>
      db
        .select({ id: generatedImages.id })
        .from(generatedImages)
        .where(and(afterPosition(f.sortBy, position, side), ...conditions))
        .orderBy(...imageOrder(f.sortBy, side === 'before'))
        .limit(1)
        .get()
    const prevResult = neighbour('before')
    const nextResult = neighbour('after')

    // Fetch linked bundles
    const linkedBundles = db
      .select({
        bundleId: imageBundles.bundleId,
        bundleName: promptBundles.name,
      })
      .from(imageBundles)
      .innerJoin(promptBundles, eq(imageBundles.bundleId, promptBundles.id))
      .where(eq(imageBundles.imageId, data.imageId))
      .all()

    return {
      ...image,
      tags: imgTags,
      projectName,
      projectSceneName,
      prevId: prevResult?.id ?? null,
      nextId: nextResult?.id ?? null,
      bundles: linkedBundles,
    }
  })

export const bulkUpdateImages = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      imageIds: Array<number>
      isFavorite?: number
      rating?: number | null
      delete?: boolean
    }) => data,
  )
  .handler(async ({ data }) => {
    if (data.imageIds.length === 0) return { success: true }

    if (data.delete) {
      log.info('bulkDelete', 'Bulk deleting images', {
        imageIds: data.imageIds,
        count: data.imageIds.length,
      })
      // Collect file paths before deleting DB records
      const files = db
        .select({
          filePath: generatedImages.filePath,
          thumbnailPath: generatedImages.thumbnailPath,
        })
        .from(generatedImages)
        .where(inArray(generatedImages.id, data.imageIds))
        .all()
      db.delete(generatedImages)
        .where(inArray(generatedImages.id, data.imageIds))
        .run()
      deleteImageFiles(files)
      return { success: true }
    }

    const updates: Record<string, unknown> = {}
    if (data.isFavorite !== undefined) updates.isFavorite = data.isFavorite
    if (data.rating !== undefined) updates.rating = data.rating

    if (Object.keys(updates).length > 0) {
      db.update(generatedImages)
        .set(updates)
        .where(inArray(generatedImages.id, data.imageIds))
        .run()
    }

    return { success: true }
  })
