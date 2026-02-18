import { db } from '../db'
import { generationJobs, generatedImages, settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateImage } from './nai'
import { saveImage, generateThumbnail } from './image'
import { createLogger } from './logger'

const log = createLogger('generation')


// ─── In-memory queue singleton ──────────────────────────────────────────────

let processing = false
let recovered = false
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

// Recover pending/running jobs from DB on first access after server restart
export function recoverJobs() {
  if (recovered) return
  recovered = true

  // Reset running → pending (interrupted mid-generation)
  const running = db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(eq(generationJobs.status, 'running'))
    .all()

  for (const job of running) {
    db.update(generationJobs)
      .set({ status: 'pending', updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, job.id))
      .run()
  }

  // Re-enqueue all pending jobs (ordered by creation time)
  const pending = db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(eq(generationJobs.status, 'pending'))
    .orderBy(generationJobs.createdAt)
    .all()

  if (pending.length > 0 || running.length > 0) {
    log.info('queue.recover', 'Recovering jobs after restart', {
      resetRunning: running.length,
      pendingJobs: pending.length,
    })
  }

  for (const job of pending) {
    queue.push(job.id)
  }

  if (queue.length > 0 && !processing) processQueue()
}

export function enqueueJob(jobId: number) {
  queue.push(jobId)

  // Add this job's totalCount to the running batch (only while actively processing)
  if (batchTiming && processing) {
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
    }
    // Clear queue stop state if the stopped job is being cancelled
    if (stoppedJobId === id) {
      stoppedJobId = null
    }
    db.update(generationJobs)
      .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, id))
      .run()
  }

  // Always clear queue stop state and batch timing after cancel
  queueStopped = null
  batchTiming = null
}

export function getQueueStatus() {
  recoverJobs()
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

  // Resume (paused→resume, error→resume): batchTiming already has correct accumulated state
  // Fresh start (including after previous batch completed): always create new batchTiming
  // We detect resume by checking if completedImages < totalImages (batch was interrupted)
  const isResume = batchTiming && batchTiming.completedImages > 0 && batchTiming.completedImages < batchTiming.totalImages
  if (!isResume) {
    batchTiming = {
      startedAt: Date.now(),
      totalImages: initialTotal,
      completedImages: 0,
      totalGenerationMs: 0,
    }
  }

  log.info('queue.start', 'Queue processing started', { queueLength: queue.length, totalImages: initialTotal })

  try {
    while (queue.length > 0) {
      if (queueStopped) {
        log.info('queue.stopped', 'Queue stopped', { reason: queueStopped })
        return
      }
      const jobId = queue.shift()!
      await processJob(jobId)
    }

    const durationMs = batchTiming ? Date.now() - batchTiming.startedAt : 0
    log.info('queue.complete', 'Queue processing completed', { totalImages: batchTiming?.completedImages ?? 0, durationMs })
  } catch (error) {
    log.error('queue.unexpectedError', 'Unexpected error in queue processing', {}, error)
  } finally {
    processing = false
    // batchTiming is kept so the last poll can still read it.
    // Next processQueue() will reset it (completedImages === totalImages → isResume=false).
  }
}

async function processJob(jobId: number) {
  try {
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
