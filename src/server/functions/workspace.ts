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

    const queueStatus = getQueueStatus()

    return {
      project,
      characters: chars,
      scenePacks,
      recentImages,
      queueStatus,
    }
  })

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
      .limit(20)
      .all()

    return {
      scene,
      characterOverrides: overrides,
      images,
    }
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
