import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../db'
import {
  generatedImages,
  generationBatches,
  generationJobs,
} from '../db/schema'
import {
  enqueueBatch,
  getGlobalQueueStats,
  getNextBatchOrder,
  getQueueStatus,
} from '../services/generation'
import { createLogger } from '../services/logger'
import { composeQuickPrompts } from '../services/prompt'
import type { QuickPromptInput } from '../services/prompt'

const log = createLogger('fn.quickGeneration')

const quickPromptInput = (data: QuickPromptInput) => data

/** Final composed prompts for the Chars tab preview (no job is created). */
export const previewQuickPrompts = createServerFn({ method: 'POST' })
  .inputValidator(quickPromptInput)
  .handler(async ({ data }) => composeQuickPrompts(data))

export const createQuickGenerationJob = createServerFn({ method: 'POST' })
  .inputValidator(
    (
      data: QuickPromptInput & {
        parameters: Record<string, unknown>
        count: number
      },
    ) => data,
  )
  .handler(async ({ data }) => {
    // Compose library parts and resolve @{bundle} references server-side
    const resolvedPrompts = composeQuickPrompts(data)

    // Create batch (projectId = null for quick generate)
    const batch = db
      .insert(generationBatches)
      .values({
        projectId: null,
        label: 'Quick Generate',
        queueOrder: getNextBatchOrder(),
        status: 'pending',
      })
      .returning()
      .get()

    const job = db
      .insert(generationJobs)
      .values({
        projectId: null,
        projectSceneId: null,
        sourceSceneId: null,
        batchId: batch.id,
        queueOrder: 0,
        resolvedPrompts: JSON.stringify(resolvedPrompts),
        resolvedParameters: JSON.stringify(data.parameters),
        totalCount: data.count,
        completedCount: 0,
        status: 'pending',
      })
      .returning()
      .get()

    enqueueBatch(batch.id)

    log.info('createQuickJob', 'Quick generation job created', {
      jobId: job.id,
      batchId: batch.id,
      count: data.count,
    })

    return job
  })

export const listQuickImages = createServerFn({ method: 'GET' })
  .inputValidator((data: { limit?: number }) => data)
  .handler(async ({ data }) => {
    const limit = data.limit ?? 50

    return db
      .select()
      .from(generatedImages)
      .where(isNull(generatedImages.projectId))
      .orderBy(desc(generatedImages.id))
      .limit(limit)
      .all()
  })

export const listQuickJobs = createServerFn({ method: 'GET' }).handler(
  async () => {
    const queueStatus = getQueueStatus()
    const globalStats = getGlobalQueueStats()

    const jobs = db
      .select({
        id: generationJobs.id,
        status: generationJobs.status,
        totalCount: generationJobs.totalCount,
        completedCount: generationJobs.completedCount,
        errorMessage: generationJobs.errorMessage,
      })
      .from(generationJobs)
      .where(
        and(
          isNull(generationJobs.projectId),
          inArray(generationJobs.status, ['pending', 'running']),
        ),
      )
      .orderBy(desc(generationJobs.createdAt))
      .all()

    // Include the failed job when queue is error-stopped
    if (
      queueStatus.stoppedJobId &&
      !jobs.some((j) => j.id === queueStatus.stoppedJobId)
    ) {
      const failedJob = db
        .select({
          id: generationJobs.id,
          status: generationJobs.status,
          totalCount: generationJobs.totalCount,
          completedCount: generationJobs.completedCount,
          errorMessage: generationJobs.errorMessage,
        })
        .from(generationJobs)
        .where(eq(generationJobs.id, queueStatus.stoppedJobId))
        .get()
      if (failedJob) jobs.unshift(failedJob)
    }

    const batchTiming = globalStats.sessionTiming
      ? {
          startedAt: globalStats.sessionTiming.startedAt,
          totalImages: globalStats.totalImages,
          completedImages: globalStats.completedImages,
          avgImageDurationMs: globalStats.avgImageDurationMs,
        }
      : null

    return { jobs, batchTiming, queueStatus }
  },
)
