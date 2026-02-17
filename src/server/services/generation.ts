import { db } from '../db'
import { generationJobs, generatedImages, settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateImage } from './nai'
import { saveImage, generateThumbnail } from './image'
import { createLogger } from './logger'

const log = createLogger('generation')


// ─── In-memory queue singleton ──────────────────────────────────────────────

let processing = false
const queue: number[] = [] // job IDs

// Unified queue stop state: 'error' | 'paused' | null
let queueStopped: 'error' | 'paused' | null = null
let stoppedJobId: number | null = null

// Batch-level timing (persists across jobs within a single processQueue run)
interface BatchTiming {
  startedAt: number
  totalImages: number        // total images across all jobs in the batch
  completedImages: number    // images completed so far
  totalGenerationMs: number  // cumulative API call time (for avg calc)
}
let batchTiming: BatchTiming | null = null

export function enqueueJob(jobId: number) {
  queue.push(jobId)

  // Add this job's totalCount to the running batch
  if (batchTiming) {
    const job = db
      .select({ totalCount: generationJobs.totalCount })
      .from(generationJobs)
      .where(eq(generationJobs.id, jobId))
      .get()
    batchTiming.totalImages += (job?.totalCount ?? 1)
  }

  log.debug('queue.enqueue', 'Job enqueued', { jobId, queueLength: queue.length })

  if (!processing) processQueue()
}

export function cancelPendingJobs(jobIds: number[]) {
  log.warn('queue.cancelPending', 'Cancelling pending jobs', { jobIds })
  for (const id of jobIds) {
    const idx = queue.indexOf(id)
    if (idx !== -1) {
      queue.splice(idx, 1)
      // Subtract cancelled job's remaining count from batch total
      if (batchTiming) {
        const job = db
          .select({ totalCount: generationJobs.totalCount, completedCount: generationJobs.completedCount })
          .from(generationJobs)
          .where(eq(generationJobs.id, id))
          .get()
        if (job) {
          const remaining = (job.totalCount ?? 0) - (job.completedCount ?? 0)
          batchTiming.totalImages = Math.max(0, batchTiming.totalImages - remaining)
        }
      }
    }
    // Clear queue stop state if the stopped job is being cancelled
    if (stoppedJobId === id) {
      queueStopped = null
      stoppedJobId = null
    }
    db.update(generationJobs)
      .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, id))
      .run()
  }
}

export function getQueueStatus() {
  return {
    processing,
    queueLength: queue.length,
    queuedJobIds: [...queue],
    queueStopped,
    stoppedJobId,
  }
}

export function pauseQueue() {
  log.info('queue.pause', 'Queue pause requested')
  queueStopped = 'paused'
}

export function resumeQueue() {
  log.info('queue.resume', 'Queue resume requested', { previousState: queueStopped, stoppedJobId })
  if (queueStopped === 'error' && stoppedJobId != null) {
    // Reset failed job to pending and re-enqueue at front
    db.update(generationJobs)
      .set({ status: 'pending', errorMessage: null, updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, stoppedJobId))
      .run()
    queue.unshift(stoppedJobId)
  }
  queueStopped = null
  stoppedJobId = null
  if (!processing) processQueue()
}

export function dismissError() {
  log.info('queue.dismissError', 'Dismissing error, skipping failed job', { stoppedJobId })
  // Subtract the failed job's remaining images from batch total
  if (batchTiming && stoppedJobId != null) {
    const job = db
      .select({ totalCount: generationJobs.totalCount, completedCount: generationJobs.completedCount })
      .from(generationJobs)
      .where(eq(generationJobs.id, stoppedJobId))
      .get()
    if (job) {
      const remaining = (job.totalCount ?? 0) - (job.completedCount ?? 0)
      batchTiming.totalImages = Math.max(0, batchTiming.totalImages - remaining)
    }
  }
  queueStopped = null
  stoppedJobId = null
  if (!processing && queue.length > 0) processQueue()
}

export function getBatchTiming() {
  if (!batchTiming) return null
  return {
    startedAt: batchTiming.startedAt,
    totalImages: batchTiming.totalImages,
    completedImages: batchTiming.completedImages,
    avgImageDurationMs: batchTiming.completedImages > 0
      ? Math.round(batchTiming.totalGenerationMs / batchTiming.completedImages)
      : null,
  }
}

async function processQueue() {
  if (processing) return
  processing = true
  queueStopped = null

  // Sum remaining images (totalCount - completedCount) from all initially queued jobs
  let initialTotal = 0
  for (const id of queue) {
    const job = db
      .select({ totalCount: generationJobs.totalCount, completedCount: generationJobs.completedCount })
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .get()
    initialTotal += ((job?.totalCount ?? 1) - (job?.completedCount ?? 0))
  }

  // Only reset batchTiming if it's a fresh start (not resuming)
  if (!batchTiming) {
    batchTiming = {
      startedAt: Date.now(),
      totalImages: initialTotal,
      completedImages: 0,
      totalGenerationMs: 0,
    }
  }

  log.info('queue.start', 'Queue processing started', { queueLength: queue.length, totalImages: initialTotal })

  while (queue.length > 0) {
    if (queueStopped) {
      log.info('queue.stopped', 'Queue stopped', { reason: queueStopped })
      processing = false
      return
    }
    const jobId = queue.shift()!
    await processJob(jobId)
  }

  const durationMs = Date.now() - batchTiming.startedAt
  log.info('queue.complete', 'Queue processing completed', { totalImages: batchTiming.completedImages, durationMs })

  processing = false
  // Keep batchTiming so the last poll can still read it.
  // It'll be overwritten on the next processQueue call.
}

async function processJob(jobId: number) {
  const job = db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId))
    .get()
  if (!job || job.status === 'cancelled') return

  log.info('job.start', 'Starting generation job', {
    jobId, projectId: job.projectId, sceneId: job.projectSceneId, totalCount: job.totalCount ?? 1,
  })

  // Get API key
  const apiKeyRow = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'nai_api_key'))
    .get()
  if (!apiKeyRow?.value) {
    log.error('job.noApiKey', 'No API key configured', { jobId })
    db.update(generationJobs)
      .set({ status: 'failed', errorMessage: 'API 키가 설정되지 않았습니다', updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId))
      .run()
    queueStopped = 'error'
    stoppedJobId = jobId
    return
  }

  // Get delay setting
  const delayRow = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'generation_delay'))
    .get()
  const delay = delayRow ? Number(delayRow.value) : 500

  // Mark as running
  db.update(generationJobs)
    .set({ status: 'running', updatedAt: new Date().toISOString() })
    .where(eq(generationJobs.id, jobId))
    .run()

  const resolvedPrompts = JSON.parse(job.resolvedPrompts)
  const resolvedParameters = JSON.parse(job.resolvedParameters)
  const totalCount = job.totalCount ?? 1

  const startIndex = job.completedCount ?? 0

  try {
    for (let i = startIndex; i < totalCount; i++) {
      // Check if paused
      if (queueStopped === 'paused') {
        log.info('job.paused', 'Job paused mid-generation', { jobId, completedCount: i })
        db.update(generationJobs)
          .set({ status: 'pending', updatedAt: new Date().toISOString() })
          .where(eq(generationJobs.id, jobId))
          .run()
        queue.unshift(jobId)
        return
      }

      // Check if cancelled mid-job
      const currentJob = db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .get()
      if (currentJob?.status === 'cancelled') {
        log.warn('job.cancelled', 'Job cancelled mid-generation', { jobId, completedCount: i })
        return
      }

      // Generate image via NAI API (with timing)
      const imageStart = Date.now()
      const { imageData, seed } = await generateImage(
        apiKeyRow.value,
        resolvedPrompts,
        resolvedParameters,
      )
      const imageDuration = Date.now() - imageStart

      log.info('job.progress', 'Image generated', { jobId, index: i + 1, seed, durationMs: imageDuration })

      // Accumulate batch timing
      if (batchTiming) {
        batchTiming.totalGenerationMs += imageDuration
        batchTiming.completedImages += 1
      }

      // Save image and thumbnail
      const { filePath, thumbnailPath } = saveImage(
        job.projectId,
        jobId,
        seed,
        imageData,
      )
      await generateThumbnail(filePath, thumbnailPath)

      // Record in DB
      db.insert(generatedImages)
        .values({
          jobId,
          projectId: job.projectId,
          projectSceneId: job.projectSceneId,
          sourceSceneId: job.sourceSceneId,
          filePath,
          thumbnailPath,
          seed,
          metadata: JSON.stringify({
            prompts: resolvedPrompts,
            parameters: resolvedParameters,
          }),
        })
        .run()

      // Update progress
      db.update(generationJobs)
        .set({
          completedCount: i + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(generationJobs.id, jobId))
        .run()

      // Delay between generations
      if (i < totalCount - 1 && delay > 0) {
        log.debug('job.delay', 'Waiting between generations', { jobId, delayMs: delay })
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    // Mark completed
    log.info('job.complete', 'Generation job completed', { jobId, totalCount })
    db.update(generationJobs)
      .set({ status: 'completed', updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId))
      .run()
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log.error('job.failed', 'Generation job failed', { jobId }, error)
    db.update(generationJobs)
      .set({ status: 'failed', errorMessage: errorMsg, updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId))
      .run()
    queueStopped = 'error'
    stoppedJobId = jobId
  }
}
