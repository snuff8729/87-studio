import { createServerFn } from '@tanstack/react-start'
import { eq, max } from 'drizzle-orm'
import { db } from '../db'
import { scenes } from '../db/schema'

export const createScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      scenePackId: number
      name: string
      description?: string
      placeholders?: string
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
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    db.update(scenes)
      .set({ ...updates, updatedAt: new Date().toISOString() })
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
