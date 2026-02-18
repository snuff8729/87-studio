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
import { getQueueStatus, getBatchTiming } from '../services/generation'

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

    // Load all scenes across all packs in one query
    const packIds = packs.map((p) => p.id)
    const allScenes = packIds.length > 0
      ? db
          .select()
          .from(projectScenes)
          .where(inArray(projectScenes.projectScenePackId, packIds))
          .orderBy(projectScenes.sortOrder)
          .all()
      : []

    // Batch: image counts per scene (single GROUP BY)
    const countRows = db
      .select({
        projectSceneId: generatedImages.projectSceneId,
        count: sql<number>`count(*)`,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectId, projectId))
      .groupBy(generatedImages.projectSceneId)
      .all()
    const countMap: Record<number, number> = {}
    for (const row of countRows) {
      if (row.projectSceneId != null) countMap[row.projectSceneId] = row.count
    }

    // Batch: explicit thumbnail lookups
    const explicitThumbIds = allScenes
      .filter((s) => s.thumbnailImageId != null)
      .map((s) => s.thumbnailImageId!)
    const explicitThumbMap: Record<number, string> = {}
    if (explicitThumbIds.length > 0) {
      const rows = db
        .select({ id: generatedImages.id, thumbnailPath: generatedImages.thumbnailPath })
        .from(generatedImages)
        .where(inArray(generatedImages.id, explicitThumbIds))
        .all()
      for (const row of rows) {
        if (row.thumbnailPath) explicitThumbMap[row.id] = row.thumbnailPath
      }
    }

    // Batch: latest thumbnail per scene (2-step: get latest image ID per scene, then lookup paths)
    const sceneIds = allScenes.map((s) => s.id)
    const latestThumbMap: Record<number, string> = {}
    if (sceneIds.length > 0) {
      // Step 1: Get the latest image ID per scene
      const latestPerScene = db
        .select({
          projectSceneId: generatedImages.projectSceneId,
          latestId: sql<number>`max(${generatedImages.id})`,
        })
        .from(generatedImages)
        .where(inArray(generatedImages.projectSceneId, sceneIds))
        .groupBy(generatedImages.projectSceneId)
        .all()

      // Step 2: Batch-fetch thumbnail paths for those latest images
      const latestImageIds = latestPerScene.map((r) => r.latestId).filter(Boolean)
      if (latestImageIds.length > 0) {
        const thumbRows = db
          .select({
            id: generatedImages.id,
            projectSceneId: generatedImages.projectSceneId,
            thumbnailPath: generatedImages.thumbnailPath,
          })
          .from(generatedImages)
          .where(inArray(generatedImages.id, latestImageIds))
          .all()
        for (const row of thumbRows) {
          if (row.projectSceneId != null && row.thumbnailPath) {
            latestThumbMap[row.projectSceneId] = row.thumbnailPath
          }
        }
      }
    }

    // Assemble scene packs with counts and thumbnails
    const scenesByPack: Record<number, typeof allScenes> = {}
    for (const scene of allScenes) {
      ;(scenesByPack[scene.projectScenePackId] ??= []).push(scene)
    }

    const scenePacks = packs.map((pack) => {
      const scenes = (scenesByPack[pack.id] ?? []).map((scene) => {
        let thumbnailPath: string | null = null
        if (scene.thumbnailImageId) {
          thumbnailPath = explicitThumbMap[scene.thumbnailImageId] ?? null
        }
        if (!thumbnailPath) {
          thumbnailPath = latestThumbMap[scene.id] ?? null
        }
        return {
          ...scene,
          recentImageCount: countMap[scene.id] ?? 0,
          thumbnailPath,
        }
      })
      return { ...pack, scenes }
    })

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

    const queueStatus = getQueueStatus()

    const activeJobsRaw = db
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

    // Include the failed job when queue is error-stopped
    const activeJobs = [...activeJobsRaw]
    if (queueStatus.stoppedJobId && !activeJobs.some((j) => j.id === queueStatus.stoppedJobId)) {
      const failedJob = db
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
        .where(eq(generationJobs.id, queueStatus.stoppedJobId))
        .get()
      if (failedJob) activeJobs.unshift(failedJob)
    }

    return {
      project,
      projectThumbnailPath,
      characters: chars,
      scenePacks,
      recentImages,
      activeJobs,
      queueStatus,
      batchTiming: getBatchTiming(),
    }
  })

const SCENE_IMAGES_PAGE_SIZE = 50

export const getSceneDetail = createServerFn({ method: 'GET' })
  .inputValidator(
    (input: number | { sceneId: number; sortBy?: 'newest' | 'tournament_winrate' | 'tournament_wins' }) =>
      typeof input === 'number' ? { sceneId: input, sortBy: 'newest' as const } : input,
  )
  .handler(async ({ data }) => {
    const projectSceneId = typeof data === 'number' ? data : data.sceneId
    const sortBy = (typeof data === 'object' && 'sortBy' in data ? data.sortBy : 'newest') ?? 'newest'

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

    const selectFields = {
      id: generatedImages.id,
      thumbnailPath: generatedImages.thumbnailPath,
      filePath: generatedImages.filePath,
      seed: generatedImages.seed,
      isFavorite: generatedImages.isFavorite,
      rating: generatedImages.rating,
      tournamentWins: generatedImages.tournamentWins,
      tournamentLosses: generatedImages.tournamentLosses,
      createdAt: generatedImages.createdAt,
    }

    let orderClause
    if (sortBy === 'tournament_winrate') {
      orderClause = sql`CASE WHEN (${generatedImages.tournamentWins} + ${generatedImages.tournamentLosses}) = 0 THEN -1 ELSE CAST(${generatedImages.tournamentWins} AS REAL) / (${generatedImages.tournamentWins} + ${generatedImages.tournamentLosses}) END DESC`
    } else if (sortBy === 'tournament_wins') {
      orderClause = desc(generatedImages.tournamentWins)
    } else {
      orderClause = desc(generatedImages.createdAt)
    }

    const images = db
      .select(selectFields)
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, projectSceneId))
      .orderBy(orderClause)
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
  .inputValidator(
    (input: { sceneId: number; offset: number; sortBy?: 'newest' | 'tournament_winrate' | 'tournament_wins' }) => input,
  )
  .handler(async ({ data: { sceneId, offset, sortBy } }) => {
    let orderClause
    if (sortBy === 'tournament_winrate') {
      orderClause = sql`CASE WHEN (${generatedImages.tournamentWins} + ${generatedImages.tournamentLosses}) = 0 THEN -1 ELSE CAST(${generatedImages.tournamentWins} AS REAL) / (${generatedImages.tournamentWins} + ${generatedImages.tournamentLosses}) END DESC`
    } else if (sortBy === 'tournament_wins') {
      orderClause = desc(generatedImages.tournamentWins)
    } else {
      orderClause = desc(generatedImages.createdAt)
    }

    return db
      .select({
        id: generatedImages.id,
        thumbnailPath: generatedImages.thumbnailPath,
        filePath: generatedImages.filePath,
        seed: generatedImages.seed,
        isFavorite: generatedImages.isFavorite,
        rating: generatedImages.rating,
        tournamentWins: generatedImages.tournamentWins,
        tournamentLosses: generatedImages.tournamentLosses,
        createdAt: generatedImages.createdAt,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, sceneId))
      .orderBy(orderClause)
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
    const queueStatus = getQueueStatus()

    const jobs = db
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

    // Include the failed job when queue is error-stopped
    if (queueStatus.stoppedJobId && !jobs.some((j) => j.id === queueStatus.stoppedJobId)) {
      const failedJob = db
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
        .where(eq(generationJobs.id, queueStatus.stoppedJobId))
        .get()
      if (failedJob) jobs.unshift(failedJob)
    }

    return { jobs, batchTiming: getBatchTiming(), queueStatus }
  })
