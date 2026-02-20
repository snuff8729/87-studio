import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { generationJobs, generatedImages } from '../db/schema'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { enqueueJob, getQueueStatus, getBatchTiming } from '../services/generation'
import { createLogger } from '../services/logger'
import { resolveBundlesInRawPrompts, type ResolvedPrompts } from '../services/prompt'

const log = createLogger('fn.quickGeneration')

export const createQuickGenerationJob = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      generalPrompt: string
      negativePrompt: string
      characterPrompts: Array<{ name: string; prompt: string; negative: string }>
      parameters: Record<string, unknown>
      count: number
    }) => data,
  )
  .handler(async ({ data }) => {
    const rawPrompts: ResolvedPrompts = {
      generalPrompt: data.generalPrompt,
      negativePrompt: data.negativePrompt,
      characterPrompts: data.characterPrompts.map((c, i) => ({
        characterId: -(i + 1),
        name: c.name,
        prompt: c.prompt,
        negative: c.negative,
      })),
    }

    // Resolve @{bundle} references server-side
    const resolvedPrompts = resolveBundlesInRawPrompts(rawPrompts)

    const job = db
      .insert(generationJobs)
      .values({
        projectId: null,
        projectSceneId: null,
        sourceSceneId: null,
        resolvedPrompts: JSON.stringify(resolvedPrompts),
        resolvedParameters: JSON.stringify(data.parameters),
        totalCount: data.count,
        completedCount: 0,
        status: 'pending',
      })
      .returning()
      .get()

    enqueueJob(job.id)

    log.info('createQuickJob', 'Quick generation job created', {
      jobId: job.id,
      count: data.count,
    })

    return job
  })

export const listQuickImages = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { limit?: number }) => data,
  )
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

export const listQuickJobs = createServerFn({ method: 'GET' })
  .handler(async () => {
    const queueStatus = getQueueStatus()

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
    if (queueStatus.stoppedJobId && !jobs.some((j) => j.id === queueStatus.stoppedJobId)) {
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

    return { jobs, batchTiming: getBatchTiming(), queueStatus }
  })
