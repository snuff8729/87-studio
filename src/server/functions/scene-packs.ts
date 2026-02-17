import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { scenePacks, scenes } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { createLogger } from '../services/logger'

const log = createLogger('fn.scenePacks')

export const listScenePacks = createServerFn({ method: 'GET' }).handler(async () => {
  return db.select().from(scenePacks).orderBy(desc(scenePacks.createdAt)).all()
})

export const getScenePack = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const pack = db.select().from(scenePacks).where(eq(scenePacks.id, id)).get()
    if (!pack) throw new Error('Scene pack not found')
    const sceneList = db
      .select()
      .from(scenes)
      .where(eq(scenes.scenePackId, id))
      .orderBy(scenes.sortOrder)
      .all()
    return { ...pack, scenes: sceneList }
  })

export const createScenePack = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; description?: string }) => data)
  .handler(async ({ data }) => {
    const result = db
      .insert(scenePacks)
      .values({ name: data.name, description: data.description })
      .returning()
      .get()
    log.info('create', 'Scene pack created', { scenePackId: result.id, name: data.name })
    return result
  })

export const updateScenePack = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; name?: string; description?: string }) => data)
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    db.update(scenePacks)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(scenePacks.id, id))
      .run()
    return { success: true }
  })

export const deleteScenePack = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    log.info('delete', 'Scene pack deleted', { scenePackId: id })
    db.delete(scenePacks).where(eq(scenePacks.id, id)).run()
    return { success: true }
  })
