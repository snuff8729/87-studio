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

    // Tag filter as SQL subquery (not post-filter)
    if (data.tagIds && data.tagIds.length > 0) {
      conditions.push(
        sql`${generatedImages.id} IN (SELECT image_id FROM image_tags WHERE tag_id IN (${sql.join(data.tagIds.map(id => sql`${id}`), sql`, `)}))`
      )
    }

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

    return query.all()
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

export const getImageDetailPage = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { imageId: number; projectId?: number; projectSceneId?: number }) => data,
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

    // Prev/next within same filter context (newest-first order)
    const filterConditions = []
    if (data.projectId) filterConditions.push(eq(generatedImages.projectId, data.projectId))
    if (data.projectSceneId) filterConditions.push(eq(generatedImages.projectSceneId, data.projectSceneId))

    // Prev = newer image (higher id)
    const prevResult = db
      .select({ id: generatedImages.id })
      .from(generatedImages)
      .where(and(sql`${generatedImages.id} > ${data.imageId}`, ...filterConditions))
      .orderBy(asc(generatedImages.id))
      .limit(1)
      .get()

    // Next = older image (lower id)
    const nextResult = db
      .select({ id: generatedImages.id })
      .from(generatedImages)
      .where(and(sql`${generatedImages.id} < ${data.imageId}`, ...filterConditions))
      .orderBy(desc(generatedImages.id))
      .limit(1)
      .get()

    return {
      ...image,
      tags: imgTags,
      projectName,
      projectSceneName,
      prevId: prevResult?.id ?? null,
      nextId: nextResult?.id ?? null,
    }
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
