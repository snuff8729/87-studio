import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { generationJobs, projectScenes, projects } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { synthesizePrompts } from '../services/prompt'
import { enqueueJob, cancelPendingJobs, getQueueStatus, pauseQueue, resumeQueue, dismissError } from '../services/generation'
import { createLogger } from '../services/logger'

const log = createLogger('fn.generation')

export const createGenerationJob = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId: number
      projectSceneIds: number[]
      countPerScene: number
      sceneCounts?: Record<number, number>
    }) => data,
  )
  .handler(async ({ data }) => {
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .get()
    const parameters = JSON.parse(project?.parameters || '{}')

    const jobs = []

    for (const sceneId of data.projectSceneIds) {
      const count = data.sceneCounts?.[sceneId] ?? data.countPerScene
      if (count <= 0) continue

      const prompts = synthesizePrompts(data.projectId, sceneId)

      const scene = db
        .select()
        .from(projectScenes)
        .where(eq(projectScenes.id, sceneId))
        .get()

      const job = db
        .insert(generationJobs)
        .values({
          projectId: data.projectId,
          projectSceneId: sceneId,
          sourceSceneId: scene?.sourceSceneId,
          resolvedPrompts: JSON.stringify(prompts),
          resolvedParameters: JSON.stringify(parameters),
          totalCount: count,
          completedCount: 0,
          status: 'pending',
        })
        .returning()
        .get()

      enqueueJob(job.id)
      jobs.push(job)
    }

    log.info('createJob', 'Generation jobs created', {
      projectId: data.projectId,
      jobCount: jobs.length,
      jobIds: jobs.map((j) => j.id),
      sceneIds: data.projectSceneIds,
    })

    return jobs
  })

export const listJobs = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = db
    .select({
      id: generationJobs.id,
      projectId: generationJobs.projectId,
      projectSceneId: generationJobs.projectSceneId,
      sourceSceneId: generationJobs.sourceSceneId,
      resolvedPrompts: generationJobs.resolvedPrompts,
      resolvedParameters: generationJobs.resolvedParameters,
      totalCount: generationJobs.totalCount,
      completedCount: generationJobs.completedCount,
      status: generationJobs.status,
      errorMessage: generationJobs.errorMessage,
      createdAt: generationJobs.createdAt,
      updatedAt: generationJobs.updatedAt,
      projectName: projects.name,
      projectSceneName: projectScenes.name,
    })
    .from(generationJobs)
    .leftJoin(projects, eq(generationJobs.projectId, projects.id))
    .leftJoin(projectScenes, eq(generationJobs.projectSceneId, projectScenes.id))
    .orderBy(desc(generationJobs.createdAt))
    .limit(100)
    .all()
  return rows
})

export const getJobStatus = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    return db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .get()
  })

export const cancelJobs = createServerFn({ method: 'POST' })
  .inputValidator((jobIds: number[]) => jobIds)
  .handler(async ({ data: jobIds }) => {
    log.info('cancelJobs', 'Cancelling jobs', { jobIds })
    cancelPendingJobs(jobIds)
    return { success: true }
  })

export const fetchQueueStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getQueueStatus()
  },
)

export const pauseGeneration = createServerFn({ method: 'POST' }).handler(
  async () => {
    pauseQueue()
    return { success: true }
  },
)

export const resumeGeneration = createServerFn({ method: 'POST' }).handler(
  async () => {
    resumeQueue()
    return { success: true }
  },
)

export const dismissGenerationError = createServerFn({ method: 'POST' }).handler(
  async () => {
    dismissError()
    return { success: true }
  },
)

export const previewPrompts = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { projectId: number; projectSceneId: number }) => data,
  )
  .handler(async ({ data }) => {
    return synthesizePrompts(data.projectId, data.projectSceneId)
  })

export const retryJob = createServerFn({ method: 'POST' })
  .inputValidator((jobId: number) => jobId)
  .handler(async ({ data: jobId }) => {
    const job = db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, jobId))
      .get()
    if (!job || job.status !== 'failed') throw new Error('Job not found or not failed')

    const newJob = db
      .insert(generationJobs)
      .values({
        projectId: job.projectId,
        projectSceneId: job.projectSceneId,
        sourceSceneId: job.sourceSceneId,
        resolvedPrompts: job.resolvedPrompts,
        resolvedParameters: job.resolvedParameters,
        totalCount: job.totalCount,
        completedCount: 0,
        status: 'pending',
      })
      .returning()
      .get()

    log.info('retryJob', 'Retrying failed job', { originalJobId: jobId, newJobId: newJob.id })
    enqueueJob(newJob.id)
    return newJob
  })
