import { db } from '../db'
import { generationJobs, generatedImages, settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateImage } from './nai'
import { saveImage, generateThumbnail } from './image'


// ─── In-memory queue singleton ──────────────────────────────────────────────

let processing = false
const queue: number[] = [] // job IDs

export function enqueueJob(jobId: number) {
  queue.push(jobId)
  if (!processing) processQueue()
}

export function cancelPendingJobs(jobIds: number[]) {
  for (const id of jobIds) {
    const idx = queue.indexOf(id)
    if (idx !== -1) queue.splice(idx, 1)
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
  }
}

async function processQueue() {
  if (processing) return
  processing = true

  while (queue.length > 0) {
    const jobId = queue.shift()!
    await processJob(jobId)
  }

  processing = false
}

async function processJob(jobId: number) {
  const job = db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId))
    .get()
  if (!job || job.status === 'cancelled') return

  // Get API key
  const apiKeyRow = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'nai_api_key'))
    .get()
  if (!apiKeyRow?.value) {
    console.error(`[Generation] Job ${jobId} failed: No API key configured`)
    db.update(generationJobs)
      .set({ status: 'failed', errorMessage: 'API 키가 설정되지 않았습니다', updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId))
      .run()
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

  try {
    for (let i = 0; i < totalCount; i++) {
      // Check if cancelled mid-job
      const currentJob = db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .get()
      if (currentJob?.status === 'cancelled') return

      // Generate image via NAI API
      const { imageData, seed } = await generateImage(
        apiKeyRow.value,
        resolvedPrompts,
        resolvedParameters,
      )

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
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    // Mark completed
    db.update(generationJobs)
      .set({ status: 'completed', updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId))
      .run()
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Generation] Job ${jobId} failed:`, error)
    db.update(generationJobs)
      .set({ status: 'failed', errorMessage: errorMsg, updatedAt: new Date().toISOString() })
      .where(eq(generationJobs.id, jobId))
      .run()
  }
}
