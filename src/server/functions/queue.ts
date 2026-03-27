import { createServerFn } from '@tanstack/react-start'
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  generationBatches,
  generationJobs,
  projectScenes,
  projects,
} from '../db/schema'
import {
  cancelBatch as cancelBatchService,
  enqueueBatch,
  getGlobalQueueStats,
  getNextBatchOrder,
  getQueueStatus,
  reorderBatches,
  reorderJobsInBatch,
} from '../services/generation'
import { createLogger } from '../services/logger'

const log = createLogger('fn.queue')

/** Active batches (pending/running) with aggregated stats, ordered by queueOrder */
export const listQueueBatches = createServerFn({ method: 'GET' }).handler(
  async () => {
    const batches = db
      .select({
        id: generationBatches.id,
        projectId: generationBatches.projectId,
        label: generationBatches.label,
        queueOrder: generationBatches.queueOrder,
        status: generationBatches.status,
        createdAt: generationBatches.createdAt,
      })
      .from(generationBatches)
      .where(inArray(generationBatches.status, ['pending', 'running']))
      .orderBy(asc(generationBatches.queueOrder))
      .all()

    const batchIds = batches.map((b) => b.id)

    if (batchIds.length === 0) return []

    // Aggregate job stats per batch
    const jobStats = db
      .select({
        batchId: generationJobs.batchId,
        jobCount: sql<number>`COUNT(*)`,
        totalImages: sql<number>`SUM(${generationJobs.totalCount})`,
        completedImages: sql<number>`SUM(${generationJobs.completedCount})`,
      })
      .from(generationJobs)
      .where(inArray(generationJobs.batchId, batchIds))
      .groupBy(generationJobs.batchId)
      .all()

    const statsMap = new Map(jobStats.map((s) => [s.batchId, s]))

    return batches.map((batch) => {
      const stats = statsMap.get(batch.id)
      return {
        ...batch,
        jobCount: stats?.jobCount ?? 0,
        totalImages: stats?.totalImages ?? 0,
        completedImages: stats?.completedImages ?? 0,
      }
    })
  },
)

/** Last 20 completed/failed/cancelled batches */
export const listRecentBatches = createServerFn({ method: 'GET' }).handler(
  async () => {
    const batches = db
      .select({
        id: generationBatches.id,
        projectId: generationBatches.projectId,
        label: generationBatches.label,
        queueOrder: generationBatches.queueOrder,
        status: generationBatches.status,
        createdAt: generationBatches.createdAt,
      })
      .from(generationBatches)
      .where(
        inArray(generationBatches.status, ['completed', 'failed', 'cancelled']),
      )
      .orderBy(desc(generationBatches.createdAt))
      .limit(20)
      .all()

    const batchIds = batches.map((b) => b.id)

    if (batchIds.length === 0) return []

    const jobStats = db
      .select({
        batchId: generationJobs.batchId,
        jobCount: sql<number>`COUNT(*)`,
        totalImages: sql<number>`SUM(${generationJobs.totalCount})`,
        completedImages: sql<number>`SUM(${generationJobs.completedCount})`,
      })
      .from(generationJobs)
      .where(inArray(generationJobs.batchId, batchIds))
      .groupBy(generationJobs.batchId)
      .all()

    const statsMap = new Map(jobStats.map((s) => [s.batchId, s]))

    return batches.map((batch) => {
      const stats = statsMap.get(batch.id)
      return {
        ...batch,
        jobCount: stats?.jobCount ?? 0,
        totalImages: stats?.totalImages ?? 0,
        completedImages: stats?.completedImages ?? 0,
      }
    })
  },
)

/** Jobs within a batch ordered by queueOrder */
export const getBatchJobs = createServerFn({ method: 'GET' })
  .inputValidator((batchId: number) => batchId)
  .handler(async ({ data: batchId }) => {
    return db
      .select({
        id: generationJobs.id,
        batchId: generationJobs.batchId,
        queueOrder: generationJobs.queueOrder,
        projectId: generationJobs.projectId,
        projectSceneId: generationJobs.projectSceneId,
        sourceSceneId: generationJobs.sourceSceneId,
        totalCount: generationJobs.totalCount,
        completedCount: generationJobs.completedCount,
        status: generationJobs.status,
        errorMessage: generationJobs.errorMessage,
        createdAt: generationJobs.createdAt,
        projectName: projects.name,
        sceneName: projectScenes.name,
      })
      .from(generationJobs)
      .leftJoin(projects, eq(generationJobs.projectId, projects.id))
      .leftJoin(
        projectScenes,
        eq(generationJobs.projectSceneId, projectScenes.id),
      )
      .where(eq(generationJobs.batchId, batchId))
      .orderBy(asc(generationJobs.queueOrder))
      .all()
  })

/** Get resolved prompts for a single job (lazy-loaded) */
export const getJobPrompts = createServerFn({ method: 'GET' })
  .inputValidator((jobId: number) => jobId)
  .handler(async ({ data: jobId }) => {
    const row = db
      .select({ resolvedPrompts: generationJobs.resolvedPrompts })
      .from(generationJobs)
      .where(eq(generationJobs.id, jobId))
      .get()
    if (!row) return null
    return JSON.parse(row.resolvedPrompts) as {
      generalPrompt: string
      negativePrompt: string
      characterPrompts: Array<{
        characterId: number
        name: string
        prompt: string
        negative: string
      }>
    }
  })

/** Reorder batches in the queue */
export const reorderQueueBatches = createServerFn({ method: 'POST' })
  .inputValidator((data: { batchIds: Array<number> }) => data)
  .handler(async ({ data }) => {
    log.info('reorderQueueBatches', 'Reordering batches', {
      batchIds: data.batchIds,
    })
    reorderBatches(data.batchIds)
    return { success: true }
  })

/** Reorder jobs within a batch */
export const reorderBatchJobsFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { batchId: number; jobIds: Array<number> }) => data)
  .handler(async ({ data }) => {
    log.info('reorderBatchJobs', 'Reordering jobs in batch', {
      batchId: data.batchId,
      jobIds: data.jobIds,
    })
    reorderJobsInBatch(data.batchId, data.jobIds)
    return { success: true }
  })

/** Cancel all pending jobs in a batch */
export const cancelBatch = createServerFn({ method: 'POST' })
  .inputValidator((batchId: number) => batchId)
  .handler(async ({ data: batchId }) => {
    log.info('cancelBatch', 'Cancelling batch', { batchId })
    cancelBatchService(batchId)
    return { success: true }
  })

/** Retry failed jobs in a batch by creating a new batch */
export const retryBatch = createServerFn({ method: 'POST' })
  .inputValidator((batchId: number) => batchId)
  .handler(async ({ data: batchId }) => {
    const originalBatch = db
      .select()
      .from(generationBatches)
      .where(eq(generationBatches.id, batchId))
      .get()
    if (!originalBatch) throw new Error('Batch not found')

    const failedJobs = db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.batchId, batchId))
      .all()
      .filter((j) => j.status === 'failed')

    if (failedJobs.length === 0) throw new Error('No failed jobs in batch')

    const newBatch = db
      .insert(generationBatches)
      .values({
        projectId: originalBatch.projectId,
        label: `${originalBatch.label} (retry)`,
        queueOrder: getNextBatchOrder(),
        status: 'pending',
      })
      .returning()
      .get()

    let jobOrder = 0
    for (const job of failedJobs) {
      db.insert(generationJobs)
        .values({
          projectId: job.projectId,
          projectSceneId: job.projectSceneId,
          sourceSceneId: job.sourceSceneId,
          batchId: newBatch.id,
          queueOrder: jobOrder++,
          resolvedPrompts: job.resolvedPrompts,
          resolvedParameters: job.resolvedParameters,
          totalCount: job.totalCount,
          completedCount: 0,
          status: 'pending',
        })
        .run()
    }

    log.info('retryBatch', 'Retrying failed batch', {
      originalBatchId: batchId,
      newBatchId: newBatch.id,
      jobCount: failedJobs.length,
    })
    enqueueBatch(newBatch.id)
    return newBatch
  })

/** Combined queue status + global stats */
export const fetchQueueSummary = createServerFn({ method: 'GET' }).handler(
  async () => {
    const status = getQueueStatus()
    const globalStats = getGlobalQueueStats()
    return { ...status, globalStats }
  },
)
