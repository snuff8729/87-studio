import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import {
  generatedImages,
  generationBatches,
  generationJobs,
  imageBundles,
  settings,
} from '../db/schema'
import { db } from '../db'
import { generateImage } from './nai'
import { generateThumbnail, saveImage } from './image'
import { preparePreciseData, prepareVibeData } from './reference'
import { createLogger } from './logger'
import type { ReferenceData } from './nai'

const log = createLogger('generation')

// ─── Queue state (in-memory, non-persistent) ─────────────────────────────

let processing = false
let recovered = false

// Unified queue stop state: 'error' | 'paused' | null
let queueStopped: 'error' | 'paused' | null = null
let stoppedJobId: number | null = null

// Session-level timing (persists across jobs within a single processQueue run)
interface SessionTiming {
  startedAt: number
  completedImages: number
  totalGenerationMs: number
}
let sessionTiming: SessionTiming | null = null

// ─── DB-driven queue helpers ──────────────────────────────────────────────

function getNextJob(): { jobId: number; batchId: number } | null {
  const row = db
    .select({
      jobId: generationJobs.id,
      batchId: generationBatches.id,
    })
    .from(generationJobs)
    .innerJoin(
      generationBatches,
      eq(generationJobs.batchId, generationBatches.id),
    )
    .where(
      and(
        eq(generationJobs.status, 'pending'),
        inArray(generationBatches.status, ['pending', 'running']),
      ),
    )
    .orderBy(asc(generationBatches.queueOrder), asc(generationJobs.queueOrder))
    .limit(1)
    .get()
  return row ? { jobId: row.jobId, batchId: row.batchId } : null
}

/** Get next max queue_order for batches */
export function getNextBatchOrder(): number {
  const row = db
    .select({
      maxOrder: sql<number>`COALESCE(MAX(${generationBatches.queueOrder}), -1)`,
    })
    .from(generationBatches)
    .where(inArray(generationBatches.status, ['pending', 'running']))
    .get()
  return (row?.maxOrder ?? -1) + 1
}

function updateBatchStatusFromJobs(batchId: number) {
  const stats = db
    .select({
      total: sql<number>`COUNT(*)`,
      completed: sql<number>`SUM(CASE WHEN ${generationJobs.status} = 'completed' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${generationJobs.status} = 'failed' THEN 1 ELSE 0 END)`,
      cancelled: sql<number>`SUM(CASE WHEN ${generationJobs.status} = 'cancelled' THEN 1 ELSE 0 END)`,
      pending: sql<number>`SUM(CASE WHEN ${generationJobs.status} = 'pending' THEN 1 ELSE 0 END)`,
      running: sql<number>`SUM(CASE WHEN ${generationJobs.status} = 'running' THEN 1 ELSE 0 END)`,
    })
    .from(generationJobs)
    .where(eq(generationJobs.batchId, batchId))
    .get()

  if (!stats) return

  let newStatus: string
  if (stats.cancelled === stats.total) {
    newStatus = 'cancelled'
  } else if (stats.completed + stats.cancelled === stats.total && stats.cancelled > 0 && stats.completed > 0) {
    // Mix of completed and cancelled — mark as cancelled (partial cancel)
    newStatus = 'cancelled'
  } else if (stats.completed === stats.total) {
    newStatus = 'completed'
  } else if (stats.failed > 0 && stats.pending === 0 && stats.running === 0) {
    newStatus = 'failed'
  } else if (stats.running > 0 || (stats.completed > 0 && stats.pending > 0)) {
    newStatus = 'running'
  } else {
    newStatus = 'pending'
  }

  db.update(generationBatches)
    .set({ status: newStatus })
    .where(eq(generationBatches.id, batchId))
    .run()
}

// ─── Recovery ─────────────────────────────────────────────────────────────

export function recoverJobs() {
  if (recovered) return
  recovered = true

  // Reset running jobs → pending
  const runningJobs = db
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(eq(generationJobs.status, 'running'))
    .all()

  for (const job of runningJobs) {
    db.update(generationJobs)
      .set({ status: 'pending', updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, job.id))
      .run()
  }

  // Reset running batches → recalculate from job statuses
  const runningBatches = db
    .select({ id: generationBatches.id })
    .from(generationBatches)
    .where(eq(generationBatches.status, 'running'))
    .all()

  for (const batch of runningBatches) {
    updateBatchStatusFromJobs(batch.id)
  }

  // Check if there are pending jobs to process
  const hasPending = getNextJob()

  if (runningJobs.length > 0 || runningBatches.length > 0) {
    log.info('queue.recover', 'Recovering jobs after restart', {
      resetRunningJobs: runningJobs.length,
      resetRunningBatches: runningBatches.length,
    })
  }

  if (hasPending && !processing) processQueue()
}

// ─── Enqueue ──────────────────────────────────────────────────────────────

/** Trigger queue processing after a batch has been inserted (batch+jobs already in DB) */
export function enqueueBatch(_batchId: number) {
  log.debug('queue.enqueueBatch', 'Batch enqueued, triggering processing', {
    batchId: _batchId,
  })
  if (!processing && !queueStopped) processQueue()
}

/**
 * Legacy enqueue — kept for backward compatibility during transition.
 * For jobs without a batch (shouldn't happen after migration but defensive).
 */
export function enqueueJob(_jobId: number) {
  log.debug('queue.enqueueJob', 'Job enqueued (legacy)', { jobId: _jobId })
  if (!processing && !queueStopped) processQueue()
}

// ─── Cancel ───────────────────────────────────────────────────────────────

export function cancelPendingJobs(jobIds: Array<number>) {
  log.warn('queue.cancelPending', 'Cancelling pending jobs', { jobIds })
  for (const id of jobIds) {
    if (stoppedJobId === id) {
      stoppedJobId = null
    }
    db.update(generationJobs)
      .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, id))
      .run()

    // Update parent batch status
    const job = db
      .select({ batchId: generationJobs.batchId })
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .get()
    if (job?.batchId) updateBatchStatusFromJobs(job.batchId)
  }

  queueStopped = null
}

export function cancelBatch(batchId: number) {
  log.warn('queue.cancelBatch', 'Cancelling batch', { batchId })

  // Cancel all pending jobs in this batch
  db.update(generationJobs)
    .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(generationJobs.batchId, batchId),
        inArray(generationJobs.status, ['pending']),
      ),
    )
    .run()

  // Mark running jobs as cancelled (processJob will check on next image)
  db.update(generationJobs)
    .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(generationJobs.batchId, batchId),
        eq(generationJobs.status, 'running'),
      ),
    )
    .run()

  // Update batch status
  updateBatchStatusFromJobs(batchId)

  // Clear error state if the stopped job was in this batch
  if (stoppedJobId != null) {
    const stoppedJob = db
      .select({ batchId: generationJobs.batchId })
      .from(generationJobs)
      .where(eq(generationJobs.id, stoppedJobId))
      .get()
    if (stoppedJob?.batchId === batchId) {
      queueStopped = null
      stoppedJobId = null
    }
  }
}

// ─── Reorder ──────────────────────────────────────────────────────────────

export function reorderBatches(batchIds: Array<number>) {
  log.info('queue.reorderBatches', 'Reordering batches', { batchIds })
  for (let i = 0; i < batchIds.length; i++) {
    db.update(generationBatches)
      .set({ queueOrder: i })
      .where(eq(generationBatches.id, batchIds[i]))
      .run()
  }
}

export function reorderJobsInBatch(batchId: number, jobIds: Array<number>) {
  log.info('queue.reorderJobs', 'Reordering jobs in batch', { batchId, jobIds })
  for (let i = 0; i < jobIds.length; i++) {
    db.update(generationJobs)
      .set({ queueOrder: i })
      .where(
        and(
          eq(generationJobs.id, jobIds[i]),
          eq(generationJobs.batchId, batchId),
        ),
      )
      .run()
  }
}

// ─── Queue status ─────────────────────────────────────────────────────────

export function getQueueStatus() {
  recoverJobs()

  // Count pending jobs in active batches
  const pendingCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(generationJobs)
    .innerJoin(
      generationBatches,
      eq(generationJobs.batchId, generationBatches.id),
    )
    .where(
      and(
        inArray(generationJobs.status, ['pending', 'running']),
        inArray(generationBatches.status, ['pending', 'running']),
      ),
    )
    .get()

  return {
    processing,
    queueLength: pendingCount?.count ?? 0,
    queueStopped,
    stoppedJobId,
  }
}

export function getGlobalQueueStats() {
  // Include ALL jobs in active batches (not just pending/running) so totals stay stable
  const stats = db
    .select({
      totalRemaining: sql<number>`SUM(CASE WHEN ${generationJobs.status} IN ('pending', 'running') THEN ${generationJobs.totalCount} - ${generationJobs.completedCount} ELSE 0 END)`,
      totalImages: sql<number>`SUM(${generationJobs.totalCount})`,
      completedImages: sql<number>`SUM(${generationJobs.completedCount})`,
    })
    .from(generationJobs)
    .innerJoin(
      generationBatches,
      eq(generationJobs.batchId, generationBatches.id),
    )
    .where(inArray(generationBatches.status, ['pending', 'running']))
    .get()

  const avgMs =
    sessionTiming && sessionTiming.completedImages > 0
      ? Math.round(
          sessionTiming.totalGenerationMs / sessionTiming.completedImages,
        )
      : null

  const remaining = stats?.totalRemaining ?? 0
  const etaMs = avgMs != null && remaining > 0 ? remaining * avgMs : null

  return {
    totalPendingImages: remaining,
    totalImages: stats?.totalImages ?? 0,
    completedImages: stats?.completedImages ?? 0,
    avgImageDurationMs: avgMs,
    etaMs,
    sessionTiming: sessionTiming
      ? {
          startedAt: sessionTiming.startedAt,
          completedImages: sessionTiming.completedImages,
          avgImageDurationMs: avgMs,
        }
      : null,
  }
}

export function pauseQueue() {
  log.info('queue.pause', 'Queue pause requested')
  queueStopped = 'paused'
}

export function resumeQueue() {
  log.info('queue.resume', 'Queue resume requested', {
    previousState: queueStopped,
    stoppedJobId,
  })
  if (queueStopped === 'error' && stoppedJobId != null) {
    db.update(generationJobs)
      .set({
        status: 'pending',
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(generationJobs.id, stoppedJobId))
      .run()
    // Update parent batch status
    const job = db
      .select({ batchId: generationJobs.batchId })
      .from(generationJobs)
      .where(eq(generationJobs.id, stoppedJobId))
      .get()
    if (job?.batchId) updateBatchStatusFromJobs(job.batchId)
  }
  queueStopped = null
  stoppedJobId = null
  if (!processing) processQueue()
}

export function dismissError() {
  log.info('queue.dismissError', 'Dismissing error, skipping failed job', {
    stoppedJobId,
  })
  if (stoppedJobId != null) {
    const job = db
      .select({ batchId: generationJobs.batchId })
      .from(generationJobs)
      .where(eq(generationJobs.id, stoppedJobId))
      .get()
    if (job?.batchId) updateBatchStatusFromJobs(job.batchId)
  }
  queueStopped = null
  stoppedJobId = null
  if (!processing && getNextJob()) processQueue()
}

/** @deprecated Use getGlobalQueueStats() instead. Kept for transition. */
export function getBatchTiming() {
  if (!sessionTiming) return null
  const stats = getGlobalQueueStats()
  return {
    startedAt: sessionTiming.startedAt,
    totalImages: stats.totalImages,
    completedImages: stats.completedImages,
    avgImageDurationMs: stats.avgImageDurationMs,
  }
}

// ─── Queue processing ─────────────────────────────────────────────────────

async function processQueue() {
  if (processing) return
  processing = true

  // Start or resume session timing
  const isResume = sessionTiming && sessionTiming.completedImages > 0
  if (!isResume) {
    sessionTiming = {
      startedAt: Date.now(),
      completedImages: 0,
      totalGenerationMs: 0,
    }
  }

  log.info('queue.start', 'Queue processing started')

  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (!queueStopped) {
      const next = getNextJob()
      if (!next) break

      // Mark batch as running
      db.update(generationBatches)
        .set({ status: 'running' })
        .where(
          and(
            eq(generationBatches.id, next.batchId),
            ne(generationBatches.status, 'running'),
          ),
        )
        .run()

      await processJob(next.jobId)

      // Update batch status after job completes
      updateBatchStatusFromJobs(next.batchId)
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (queueStopped) {
      log.info('queue.stopped', 'Queue stopped', { reason: queueStopped })
    } else {
      log.info('queue.complete', 'Queue processing completed', {
        totalImages: sessionTiming?.completedImages ?? 0,
      })
    }
  } catch (error) {
    log.error(
      'queue.unexpectedError',
      'Unexpected error in queue processing',
      {},
      error,
    )
  } finally {
    processing = false
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
      jobId,
      projectId: job.projectId,
      sceneId: job.projectSceneId,
      totalCount: job.totalCount ?? 1,
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
        .set({
          status: 'failed',
          errorMessage: 'API 키가 설정되지 않았습니다',
          updatedAt: new Date().toISOString(),
        })
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

    // Prepare reference data (once per job, reused for all images)
    const referenceMode = resolvedParameters.referenceMode ?? 'none'
    const refProjectId = job.projectId ?? null
    let referenceData: ReferenceData | undefined
    if (referenceMode === 'vibe') {
      const vibeResult = await prepareVibeData(
        refProjectId,
        apiKeyRow.value,
        resolvedParameters.model ?? 'nai-diffusion-4-5-full',
      )
      if (vibeResult) referenceData = vibeResult
    } else if (referenceMode === 'precise') {
      const model = resolvedParameters.model ?? 'nai-diffusion-4-5-full'
      if (!model.includes('4-5')) {
        throw new Error('Precise Reference requires V4.5 model')
      }
      const preciseResult = await preparePreciseData(refProjectId)
      if (preciseResult) referenceData = preciseResult
    }

    const startIndex = job.completedCount ?? 0

    for (let i = startIndex; i < totalCount; i++) {
      // Check if paused
      if (queueStopped === 'paused') {
        log.info('job.paused', 'Job paused mid-generation', {
          jobId,
          completedCount: i,
        })
        db.update(generationJobs)
          .set({ status: 'pending', updatedAt: new Date().toISOString() })
          .where(eq(generationJobs.id, jobId))
          .run()
        return
      }

      // Check if cancelled mid-job (job or batch level)
      const currentJob = db
        .select({
          status: generationJobs.status,
          batchId: generationJobs.batchId,
        })
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .get()
      if (currentJob?.status === 'cancelled') {
        log.warn('job.cancelled', 'Job cancelled mid-generation', {
          jobId,
          completedCount: i,
        })
        return
      }
      // Check batch cancellation
      if (currentJob?.batchId) {
        const batch = db
          .select({ status: generationBatches.status })
          .from(generationBatches)
          .where(eq(generationBatches.id, currentJob.batchId))
          .get()
        if (batch?.status === 'cancelled') {
          log.warn('job.batchCancelled', 'Batch cancelled, stopping job', {
            jobId,
            batchId: currentJob.batchId,
          })
          db.update(generationJobs)
            .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
            .where(eq(generationJobs.id, jobId))
            .run()
          return
        }
      }

      // Generate image via NAI API (with timing)
      const imageStart = Date.now()
      const { imageData, seed } = await generateImage(
        apiKeyRow.value,
        resolvedPrompts,
        resolvedParameters,
        referenceData,
      )
      const imageDuration = Date.now() - imageStart

      log.info('job.progress', 'Image generated', {
        jobId,
        index: i + 1,
        seed,
        durationMs: imageDuration,
      })

      // Accumulate session timing
      if (sessionTiming) {
        sessionTiming.totalGenerationMs += imageDuration
        sessionTiming.completedImages += 1
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
      const insertedImage = db
        .insert(generatedImages)
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
            ...(referenceMode !== 'none' &&
              referenceData && {
                referenceMode,
                references:
                  referenceMode === 'vibe'
                    ? {
                        vibes: referenceData.vibes?.map((v) => ({
                          strength: v.strength,
                          informationExtracted: v.infoExtracted,
                        })),
                      }
                    : {
                        precise: referenceData.precise?.map((r) => ({
                          strength: r.strength,
                          fidelity: r.fidelity,
                          mode: r.mode,
                        })),
                      },
              }),
          }),
        })
        .returning()
        .get()

      // Link image to used bundles
      const usedBundleIds: Array<number> = resolvedPrompts.usedBundleIds ?? []
      for (const bundleId of usedBundleIds) {
        db.insert(imageBundles)
          .values({ imageId: insertedImage.id, bundleId })
          .onConflictDoNothing()
          .run()
      }

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
        log.debug('job.delay', 'Waiting between generations', {
          jobId,
          delayMs: delay,
        })
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
      .set({
        status: 'failed',
        errorMessage: errorMsg,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(generationJobs.id, jobId))
      .run()
    queueStopped = 'error'
    stoppedJobId = jobId
  }
}
