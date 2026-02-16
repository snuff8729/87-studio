import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { generatedImages, tags, imageTags, projects, projectScenes } from '../db/schema'
import { eq, desc, asc, and, sql, inArray } from 'drizzle-orm'

export const listImages = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: {
      page?: number
      limit?: number
      projectId?: number
      projectSceneId?: number
      sourceSceneId?: number
      isFavorite?: boolean
      minRating?: number
      tagIds?: number[]
      sortBy?: 'newest' | 'oldest' | 'rating' | 'favorites'
    }) => data,
  )
  .handler(async ({ data }) => {
    const page = data.page ?? 1
    const limit = data.limit ?? 40
    const offset = (page - 1) * limit

    const conditions = []
    if (data.projectId) conditions.push(eq(generatedImages.projectId, data.projectId))
    if (data.projectSceneId) conditions.push(eq(generatedImages.projectSceneId, data.projectSceneId))
    if (data.sourceSceneId) conditions.push(eq(generatedImages.sourceSceneId, data.sourceSceneId))
    if (data.isFavorite) conditions.push(eq(generatedImages.isFavorite, 1))
    if (data.minRating) conditions.push(sql`${generatedImages.rating} >= ${data.minRating}`)

    // Determine sort order
    const sortBy = data.sortBy ?? 'newest'
    let orderClauses: ReturnType<typeof desc>[]
    switch (sortBy) {
      case 'oldest':
        orderClauses = [asc(generatedImages.createdAt)]
        break
      case 'rating':
        orderClauses = [desc(generatedImages.rating), desc(generatedImages.createdAt)]
        break
      case 'favorites':
        orderClauses = [desc(generatedImages.isFavorite), desc(generatedImages.createdAt)]
        break
      case 'newest':
      default:
        orderClauses = [desc(generatedImages.createdAt)]
        break
    }

    let query = db
      .select()
      .from(generatedImages)
      .orderBy(...orderClauses)
      .limit(limit)
      .offset(offset)

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query
    }

    const images = query.all()

    // If tag filter, post-filter (simpler than join for SQLite)
    if (data.tagIds && data.tagIds.length > 0) {
      const taggedImageIds = db
        .select({ imageId: imageTags.imageId })
        .from(imageTags)
        .where(inArray(imageTags.tagId, data.tagIds))
        .all()
        .map((r) => r.imageId)
      const tagSet = new Set(taggedImageIds)
      return images.filter((img) => tagSet.has(img.id))
    }

    return images
  })

export const updateImage = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { id: number; isFavorite?: number; rating?: number | null; memo?: string | null }) =>
      data,
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
      .where(and(eq(imageTags.imageId, data.imageId), eq(imageTags.tagId, data.tagId)))
      .run()
    return { success: true }
  })

export const listTags = createServerFn({ method: 'GET' }).handler(async () => {
  return db.select().from(tags).orderBy(tags.name).all()
})

export const listProjectsForFilter = createServerFn({ method: 'GET' }).handler(async () => {
  return db.select({ id: projects.id, name: projects.name }).from(projects).all()
})

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

export const bulkUpdateImages = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { imageIds: number[]; isFavorite?: number; rating?: number | null; delete?: boolean }) =>
      data,
  )
  .handler(async ({ data }) => {
    if (data.imageIds.length === 0) return { success: true }

    if (data.delete) {
      db.delete(generatedImages)
        .where(inArray(generatedImages.id, data.imageIds))
        .run()
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
