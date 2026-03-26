import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { referenceImages } from '../db/schema'
import { createLogger } from './logger'

const log = createLogger('reference')
const REFERENCES_DIR = './data/references'

/** Normalize path separators to forward slashes */
function normalizePath(p: string): string {
  return p.replaceAll('\\', '/')
}

// ─── Upload & Save ──────────────────────────────────────────────────────────

export function uploadReferenceImage(
  projectId: number | null,
  type: 'vibe' | 'precise',
  imageBuffer: Buffer,
) {
  const uuid = randomUUID()
  const subdir = projectId != null ? String(projectId) : 'quick'
  const filePath = join(REFERENCES_DIR, subdir, `${uuid}.png`)
  const thumbnailPath = join(REFERENCES_DIR, subdir, `${uuid}_thumb.png`)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, imageBuffer)

  log.info('upload', 'Reference image saved', {
    projectId,
    type,
    filePath,
    sizeBytes: imageBuffer.byteLength,
  })

  // Get next sort order
  const projectCondition =
    projectId != null
      ? eq(referenceImages.projectId, projectId)
      : isNull(referenceImages.projectId)
  const maxOrder = db
    .select({ sortOrder: referenceImages.sortOrder })
    .from(referenceImages)
    .where(and(projectCondition, eq(referenceImages.type, type)))
    .orderBy(referenceImages.sortOrder)
    .all()
  const nextOrder =
    maxOrder.length > 0 ? Math.max(...maxOrder.map((r) => r.sortOrder)) + 1 : 0

  const row = db
    .insert(referenceImages)
    .values({
      projectId,
      type,
      filePath: normalizePath(filePath),
      thumbnailPath: normalizePath(thumbnailPath),
      sortOrder: nextOrder,
    })
    .returning()
    .get()

  return row
}

export async function generateReferenceThumbnail(
  sourcePath: string,
  thumbnailPath: string,
): Promise<void> {
  try {
    await sharp(sourcePath)
      .resize({
        width: 256,
        height: 256,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toFile(thumbnailPath)
    log.info('thumbnail', 'Reference thumbnail generated', { thumbnailPath })
  } catch (error) {
    log.error(
      'thumbnail.failed',
      'Reference thumbnail generation failed',
      { sourcePath, thumbnailPath },
      error,
    )
    throw error
  }
}

// ─── Precise Reference: Resize + Letterbox ──────────────────────────────────

const PRECISE_DIMENSIONS = [
  { w: 1472, h: 1472, aspect: 1 },
  { w: 1536, h: 1024, aspect: 1536 / 1024 },
  { w: 1024, h: 1536, aspect: 1024 / 1536 },
]

export async function processDirectorImage(filePath: string): Promise<string> {
  const processedPath = filePath.replace(/\.[^.]+$/, '_processed.png')

  const metadata = await sharp(filePath).metadata()
  const srcW = metadata.width || 1024
  const srcH = metadata.height || 1024
  const srcAspect = srcW / srcH

  // Find best matching dimension
  let best = PRECISE_DIMENSIONS[0]
  let bestDiff = Math.abs(srcAspect - best.aspect)
  for (const dim of PRECISE_DIMENSIONS) {
    const diff = Math.abs(srcAspect - dim.aspect)
    if (diff < bestDiff) {
      best = dim
      bestDiff = diff
    }
  }

  await sharp(filePath)
    .resize(best.w, best.h, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0 },
    })
    .png()
    .toFile(processedPath)

  log.info('process', 'Director image processed', {
    filePath,
    processedPath,
    targetW: best.w,
    targetH: best.h,
  })

  return normalizePath(processedPath)
}

// ─── Vibe Encoding ──────────────────────────────────────────────────────────

const ENCODE_VIBE_URL = 'https://image.novelai.net/ai/encode-vibe'

export async function encodeVibeImage(
  apiKey: string,
  filePath: string,
  model: string,
  informationExtracted: number,
): Promise<string> {
  const imageBuffer = readFileSync(filePath)
  const imageBase64 = imageBuffer.toString('base64')

  const response = await fetch(ENCODE_VIBE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      image: imageBase64,
      model,
      information_extracted: informationExtracted,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    log.error('encode.failed', 'Vibe encoding failed', {
      status: response.status,
      responseText: text.slice(0, 500),
    })
    throw new Error(`Vibe encoding failed: ${response.status} ${text}`)
  }

  const encodedData = new Uint8Array(await response.arrayBuffer())
  const encodedPath = filePath.replace(/\.[^.]+$/, '_vibe.bin')

  mkdirSync(dirname(encodedPath), { recursive: true })
  writeFileSync(encodedPath, encodedData)

  log.info('encode', 'Vibe encoded', {
    filePath,
    encodedPath,
    model,
    sizeBytes: encodedData.byteLength,
  })

  return normalizePath(encodedPath)
}

export function isVibeEncodingValid(
  ref: typeof referenceImages.$inferSelect,
  currentModel: string,
): boolean {
  return !!(
    ref.encodedVibePath &&
    ref.encodedModel === currentModel &&
    existsSync(ref.encodedVibePath)
  )
}

// ─── Query ──────────────────────────────────────────────────────────────────

export function getEnabledReferences(
  projectId: number | null,
  type: 'vibe' | 'precise',
) {
  const projectCondition =
    projectId != null
      ? eq(referenceImages.projectId, projectId)
      : isNull(referenceImages.projectId)
  return db
    .select()
    .from(referenceImages)
    .where(
      and(
        projectCondition,
        eq(referenceImages.type, type),
        eq(referenceImages.enabled, 1),
      ),
    )
    .orderBy(asc(referenceImages.sortOrder))
    .all()
}

export function getProjectReferences(projectId: number | null) {
  const projectCondition =
    projectId != null
      ? eq(referenceImages.projectId, projectId)
      : isNull(referenceImages.projectId)
  return db
    .select()
    .from(referenceImages)
    .where(projectCondition)
    .orderBy(asc(referenceImages.type), asc(referenceImages.sortOrder))
    .all()
}

// ─── Delete ─────────────────────────────────────────────────────────────────

function safeUnlink(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath)
  } catch (error) {
    log.error('delete.failed', 'Failed to delete file', { filePath }, error)
  }
}

export function deleteReferenceImage(id: number): void {
  const ref = db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.id, id))
    .get()
  if (!ref) return

  safeUnlink(ref.filePath)
  if (ref.thumbnailPath) safeUnlink(ref.thumbnailPath)
  if (ref.processedPath) safeUnlink(ref.processedPath)
  if (ref.encodedVibePath) safeUnlink(ref.encodedVibePath)

  db.delete(referenceImages).where(eq(referenceImages.id, id)).run()

  // Clean up empty project directory
  const dir = dirname(ref.filePath)
  try {
    if (existsSync(dir) && readdirSync(dir).length === 0) {
      rmSync(dir, { recursive: true })
    }
  } catch {
    /* ignore */
  }

  log.info('delete', 'Reference image deleted', { id, filePath: ref.filePath })
}

// ─── Prepare reference data for generation ──────────────────────────────────

export async function prepareVibeData(
  projectId: number | null,
  apiKey: string,
  model: string,
) {
  const refs = getEnabledReferences(projectId, 'vibe')
  if (refs.length === 0) return undefined

  const vibes: Array<{
    encoded: string
    strength: number
    infoExtracted: number
  }> = []

  for (const ref of refs) {
    let encodedPath = ref.encodedVibePath

    // Re-encode if needed (no cache or model mismatch)
    if (!isVibeEncodingValid(ref, model)) {
      log.info('encode.needed', 'Vibe encoding needed', {
        refId: ref.id,
        currentModel: model,
        cachedModel: ref.encodedModel,
      })
      encodedPath = await encodeVibeImage(
        apiKey,
        ref.filePath,
        model,
        ref.informationExtracted,
      )

      db.update(referenceImages)
        .set({
          encodedVibePath: encodedPath,
          encodedModel: model,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(referenceImages.id, ref.id))
        .run()
    }

    const encodedData = readFileSync(encodedPath!)
    const encodedBase64 = encodedData.toString('base64')

    vibes.push({
      encoded: encodedBase64,
      strength: ref.strength,
      infoExtracted: ref.informationExtracted,
    })
  }

  return { vibes }
}

export async function preparePreciseData(projectId: number | null) {
  const refs = getEnabledReferences(projectId, 'precise')
  if (refs.length === 0) return undefined

  const precise: Array<{
    imageBase64: string
    strength: number
    fidelity: number
    mode: string
  }> = []

  for (const ref of refs) {
    let processedPath = ref.processedPath

    // Process if needed
    if (!processedPath || !existsSync(processedPath)) {
      processedPath = await processDirectorImage(ref.filePath)
      db.update(referenceImages)
        .set({ processedPath, updatedAt: new Date().toISOString() })
        .where(eq(referenceImages.id, ref.id))
        .run()
    }

    const imageData = readFileSync(processedPath)
    const imageBase64 = imageData.toString('base64')

    precise.push({
      imageBase64,
      strength: ref.strength,
      fidelity: ref.fidelity,
      mode: ref.referenceMode,
    })
  }

  return { precise }
}
