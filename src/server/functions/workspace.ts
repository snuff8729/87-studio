import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import {
  projects,
  characters,
  projectScenePacks,
  projectScenes,
  characterSceneOverrides,
  generatedImages,
  generationJobs,
} from '../db/schema'
import { eq, desc, and, sql, inArray } from 'drizzle-orm'
import { getQueueStatus } from '../services/generation'

export const getWorkspaceData = createServerFn({ method: 'GET' })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()
    if (!project) throw new Error('Project not found')

    const chars = db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .orderBy(characters.slotIndex)
      .all()

    const packs = db
      .select()
      .from(projectScenePacks)
      .where(eq(projectScenePacks.projectId, projectId))
      .all()

    const scenePacks = []
    for (const pack of packs) {
      const sceneList = db
        .select()
        .from(projectScenes)
        .where(eq(projectScenes.projectScenePackId, pack.id))
        .orderBy(projectScenes.sortOrder)
        .all()

      const scenesWithCounts = sceneList.map((scene) => {
        const countResult = db
          .select({ count: sql<number>`count(*)` })
          .from(generatedImages)
          .where(eq(generatedImages.projectSceneId, scene.id))
          .get()

        // Resolve thumbnail: explicit pick or fallback to most recent image
        let thumbnailPath: string | null = null
        if (scene.thumbnailImageId) {
          const picked = db
            .select({ thumbnailPath: generatedImages.thumbnailPath })
            .from(generatedImages)
            .where(eq(generatedImages.id, scene.thumbnailImageId))
            .get()
          thumbnailPath = picked?.thumbnailPath ?? null
        }
        if (!thumbnailPath) {
          const latest = db
            .select({ thumbnailPath: generatedImages.thumbnailPath })
            .from(generatedImages)
            .where(eq(generatedImages.projectSceneId, scene.id))
            .orderBy(desc(generatedImages.createdAt))
            .limit(1)
            .get()
          thumbnailPath = latest?.thumbnailPath ?? null
        }

        return {
          ...scene,
          recentImageCount: countResult?.count ?? 0,
          thumbnailPath,
        }
      })

      scenePacks.push({ ...pack, scenes: scenesWithCounts })
    }

    // Resolve project thumbnail
    let projectThumbnailPath: string | null = null
    if (project.thumbnailImageId) {
      const picked = db
        .select({ thumbnailPath: generatedImages.thumbnailPath })
        .from(generatedImages)
        .where(eq(generatedImages.id, project.thumbnailImageId))
        .get()
      projectThumbnailPath = picked?.thumbnailPath ?? null
    }
    if (!projectThumbnailPath) {
      const latest = db
        .select({ thumbnailPath: generatedImages.thumbnailPath })
        .from(generatedImages)
        .where(eq(generatedImages.projectId, projectId))
        .orderBy(desc(generatedImages.createdAt))
        .limit(1)
        .get()
      projectThumbnailPath = latest?.thumbnailPath ?? null
    }

    const recentImages = db
      .select({
        id: generatedImages.id,
        thumbnailPath: generatedImages.thumbnailPath,
        seed: generatedImages.seed,
        projectSceneId: generatedImages.projectSceneId,
        isFavorite: generatedImages.isFavorite,
        createdAt: generatedImages.createdAt,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectId, projectId))
      .orderBy(desc(generatedImages.createdAt))
      .limit(50)
      .all()

    const activeJobs = db
      .select({
        id: generationJobs.id,
        projectSceneId: generationJobs.projectSceneId,
        sceneName: projectScenes.name,
        status: generationJobs.status,
        totalCount: generationJobs.totalCount,
        completedCount: generationJobs.completedCount,
        errorMessage: generationJobs.errorMessage,
      })
      .from(generationJobs)
      .leftJoin(projectScenes, eq(generationJobs.projectSceneId, projectScenes.id))
      .where(
        and(
          eq(generationJobs.projectId, projectId),
          inArray(generationJobs.status, ['pending', 'running']),
        ),
      )
      .orderBy(desc(generationJobs.createdAt))
      .all()

    const queueStatus = getQueueStatus()

    return {
      project,
      projectThumbnailPath,
      characters: chars,
      scenePacks,
      recentImages,
      activeJobs,
      queueStatus,
    }
  })

const SCENE_IMAGES_PAGE_SIZE = 50

export const getSceneDetail = createServerFn({ method: 'GET' })
  .inputValidator((projectSceneId: number) => projectSceneId)
  .handler(async ({ data: projectSceneId }) => {
    const scene = db
      .select()
      .from(projectScenes)
      .where(eq(projectScenes.id, projectSceneId))
      .get()
    if (!scene) throw new Error('Scene not found')

    const overrides = db
      .select()
      .from(characterSceneOverrides)
      .where(eq(characterSceneOverrides.projectSceneId, projectSceneId))
      .all()

    const totalCount = db
      .select({ count: sql<number>`count(*)` })
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, projectSceneId))
      .get()?.count ?? 0

    const images = db
      .select({
        id: generatedImages.id,
        thumbnailPath: generatedImages.thumbnailPath,
        filePath: generatedImages.filePath,
        seed: generatedImages.seed,
        isFavorite: generatedImages.isFavorite,
        rating: generatedImages.rating,
        createdAt: generatedImages.createdAt,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, projectSceneId))
      .orderBy(desc(generatedImages.createdAt))
      .limit(SCENE_IMAGES_PAGE_SIZE)
      .all()

    return {
      scene,
      characterOverrides: overrides,
      images,
      totalImageCount: totalCount,
    }
  })

export const getSceneImages = createServerFn({ method: 'GET' })
  .inputValidator((input: { sceneId: number; offset: number }) => input)
  .handler(async ({ data: { sceneId, offset } }) => {
    return db
      .select({
        id: generatedImages.id,
        thumbnailPath: generatedImages.thumbnailPath,
        filePath: generatedImages.filePath,
        seed: generatedImages.seed,
        isFavorite: generatedImages.isFavorite,
        rating: generatedImages.rating,
        createdAt: generatedImages.createdAt,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, sceneId))
      .orderBy(desc(generatedImages.createdAt))
      .limit(SCENE_IMAGES_PAGE_SIZE)
      .offset(offset)
      .all()
  })

// Per-scene image counts (accurate, single GROUP BY query)
export const getSceneImageCounts = createServerFn({ method: 'GET' })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    const rows = db
      .select({
        projectSceneId: generatedImages.projectSceneId,
        count: sql<number>`count(*)`,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectId, projectId))
      .groupBy(generatedImages.projectSceneId)
      .all()

    const counts: Record<number, number> = {}
    for (const row of rows) {
      if (row.projectSceneId != null) {
        counts[row.projectSceneId] = row.count
      }
    }
    return counts
  })

// Context for standalone scene detail page
export const getScenePageContext = createServerFn({ method: 'GET' })
  .inputValidator((data: { projectId: number; sceneId: number }) => data)
  .handler(async ({ data }) => {
    const project = db
      .select({
        id: projects.id,
        name: projects.name,
        generalPrompt: projects.generalPrompt,
        negativePrompt: projects.negativePrompt,
        thumbnailImageId: projects.thumbnailImageId,
      })
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .get()
    if (!project) throw new Error('Project not found')

    const chars = db
      .select()
      .from(characters)
      .where(eq(characters.projectId, data.projectId))
      .orderBy(characters.slotIndex)
      .all()

    const scene = db
      .select()
      .from(projectScenes)
      .where(eq(projectScenes.id, data.sceneId))
      .get()
    if (!scene) throw new Error('Scene not found')

    const pack = db
      .select({ name: projectScenePacks.name })
      .from(projectScenePacks)
      .where(eq(projectScenePacks.id, scene.projectScenePackId))
      .get()

    const overrides = db
      .select({
        characterId: characterSceneOverrides.characterId,
        placeholders: characterSceneOverrides.placeholders,
      })
      .from(characterSceneOverrides)
      .where(eq(characterSceneOverrides.projectSceneId, data.sceneId))
      .all()

    return {
      project,
      characters: chars,
      sceneName: scene.name,
      packName: pack?.name ?? 'Unknown',
      thumbnailImageId: scene.thumbnailImageId,
      projectThumbnailImageId: project.thumbnailImageId,
      scenePlaceholders: scene.placeholders,
      characterOverrides: overrides,
    }
  })

// Lightweight fetch for incremental UI updates during generation
export const getRecentImages = createServerFn({ method: 'GET' })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    return db
      .select({
        id: generatedImages.id,
        thumbnailPath: generatedImages.thumbnailPath,
        seed: generatedImages.seed,
        projectSceneId: generatedImages.projectSceneId,
        isFavorite: generatedImages.isFavorite,
        createdAt: generatedImages.createdAt,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectId, projectId))
      .orderBy(desc(generatedImages.createdAt))
      .limit(50)
      .all()
  })

export const listProjectJobs = createServerFn({ method: 'GET' })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    return db
      .select({
        id: generationJobs.id,
        projectSceneId: generationJobs.projectSceneId,
        sceneName: projectScenes.name,
        status: generationJobs.status,
        totalCount: generationJobs.totalCount,
        completedCount: generationJobs.completedCount,
        errorMessage: generationJobs.errorMessage,
      })
      .from(generationJobs)
      .leftJoin(projectScenes, eq(generationJobs.projectSceneId, projectScenes.id))
      .where(
        and(
          eq(generationJobs.projectId, projectId),
          inArray(generationJobs.status, ['pending', 'running']),
        ),
      )
      .orderBy(desc(generationJobs.createdAt))
      .all()
  })
