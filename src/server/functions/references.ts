import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { referenceImages } from '../db/schema'
import {
  deleteReferenceImage,
  generateReferenceThumbnail,
  getProjectReferences,
  uploadReferenceImage,
} from '../services/reference'
import { createLogger } from '../services/logger'

const log = createLogger('fn.references')

export const uploadReference = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId: number | null
      type: 'vibe' | 'precise'
      imageBase64: string
    }) => data,
  )
  .handler(async ({ data }) => {
    // Validate vibe count limit
    if (data.type === 'vibe') {
      const projectCondition =
        data.projectId != null
          ? eq(referenceImages.projectId, data.projectId)
          : isNull(referenceImages.projectId)
      const existing = db
        .select({ id: referenceImages.id })
        .from(referenceImages)
        .where(and(projectCondition, eq(referenceImages.type, 'vibe')))
        .all()
      if (existing.length >= 16) {
        throw new Error('Maximum 16 vibe images allowed')
      }
    }

    const imageBuffer = Buffer.from(data.imageBase64, 'base64')
    const row = uploadReferenceImage(data.projectId, data.type, imageBuffer)

    // Generate thumbnail async
    await generateReferenceThumbnail(row.filePath, row.thumbnailPath!)

    log.info('upload', 'Reference image uploaded', {
      id: row.id,
      projectId: data.projectId,
      type: data.type,
    })
    return row
  })

export const listReferences = createServerFn({ method: 'GET' })
  .inputValidator((projectId: number | null) => projectId)
  .handler(async ({ data: projectId }) => {
    return getProjectReferences(projectId)
  })

export const updateReference = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      strength?: number
      informationExtracted?: number
      fidelity?: number
      referenceMode?: string
      enabled?: number
    }) => data,
  )
  .handler(async ({ data }) => {
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }

    if (data.strength !== undefined) updates.strength = data.strength
    if (data.informationExtracted !== undefined)
      updates.informationExtracted = data.informationExtracted
    if (data.fidelity !== undefined) updates.fidelity = data.fidelity
    if (data.referenceMode !== undefined)
      updates.referenceMode = data.referenceMode
    if (data.enabled !== undefined) updates.enabled = data.enabled

    // If informationExtracted changed for a vibe, invalidate encoding cache
    if (data.informationExtracted !== undefined) {
      updates.encodedVibePath = null
      updates.encodedModel = null
    }

    const row = db
      .update(referenceImages)
      .set(updates)
      .where(eq(referenceImages.id, data.id))
      .returning()
      .get()

    return row
  })

export const deleteReference = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    deleteReferenceImage(id)
    log.info('delete', 'Reference image deleted', { id })
    return { success: true }
  })

export const reorderReferences = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { projectId: number; orderedIds: Array<number> }) => data,
  )
  .handler(async ({ data }) => {
    for (let i = 0; i < data.orderedIds.length; i++) {
      db.update(referenceImages)
        .set({ sortOrder: i, updatedAt: new Date().toISOString() })
        .where(eq(referenceImages.id, data.orderedIds[i]))
        .run()
    }
    return { success: true }
  })
