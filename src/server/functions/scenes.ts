import { createServerFn } from '@tanstack/react-start'
import { eq, max } from 'drizzle-orm'
import { db } from '../db'
import { scenes } from '../db/schema'
import { nextCopyName } from '@/lib/scene-templates'

export const createScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      scenePackId: number
      name: string
      description?: string
      placeholders?: string
      axisValues?: Record<string, number>
    }) => data,
  )
  .handler(async ({ data }) => {
    const maxOrder = db
      .select({ max: max(scenes.sortOrder) })
      .from(scenes)
      .where(eq(scenes.scenePackId, data.scenePackId))
      .get()
    const sortOrder = (maxOrder?.max ?? -1) + 1

    const result = db
      .insert(scenes)
      .values({
        scenePackId: data.scenePackId,
        name: data.name,
        description: data.description,
        placeholders: data.placeholders ?? '{}',
        axisValues: JSON.stringify(data.axisValues ?? {}),
        sortOrder,
      })
      .returning()
      .get()
    return result
  })

export const updateScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      name?: string
      description?: string
      placeholders?: string
      /** Values for global axes: { [axisId]: valueId } */
      axisValues?: Record<string, number>
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, axisValues, ...updates } = data
    db.update(scenes)
      .set({
        ...updates,
        ...(axisValues !== undefined
          ? { axisValues: JSON.stringify(axisValues) }
          : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(scenes.id, id))
      .run()
    return { success: true }
  })

export const deleteScene = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    db.delete(scenes).where(eq(scenes.id, id)).run()
    return { success: true }
  })

export const reorderScenes = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { scenePackId: number; orderedIds: Array<number> }) => data,
  )
  .handler(async ({ data }) => {
    for (let i = 0; i < data.orderedIds.length; i++) {
      db.update(scenes)
        .set({ sortOrder: i })
        .where(eq(scenes.id, data.orderedIds[i]))
        .run()
    }
    return { success: true }
  })

export const duplicateScene = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const source = db.select().from(scenes).where(eq(scenes.id, id)).get()
    if (!source) throw new Error('Scene not found')
    const siblings = db
      .select()
      .from(scenes)
      .where(eq(scenes.scenePackId, source.scenePackId))
      .all()
    const maxOrder = Math.max(-1, ...siblings.map((s) => s.sortOrder ?? 0))
    return db
      .insert(scenes)
      .values({
        scenePackId: source.scenePackId,
        name: nextCopyName(
          source.name,
          siblings.map((s) => s.name),
        ),
        description: source.description,
        placeholders: source.placeholders,
        axisValues: source.axisValues,
        sortOrder: maxOrder + 1,
      })
      .returning()
      .get()
  })
