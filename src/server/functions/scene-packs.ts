import { createServerFn } from '@tanstack/react-start'
import { count, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { projectScenes, scenePacks, scenes } from '../db/schema'
import { createLogger } from '../services/logger'
import { nextCopyName } from '@/lib/scene-templates'

const log = createLogger('fn.scenePacks')

export const listScenePacks = createServerFn({ method: 'GET' }).handler(
  async () => {
    const counts = new Map(
      db
        .select({ id: scenes.scenePackId, count: count() })
        .from(scenes)
        .groupBy(scenes.scenePackId)
        .all()
        .map((r) => [r.id, r.count]),
    )
    return db
      .select()
      .from(scenePacks)
      .orderBy(desc(scenePacks.createdAt), desc(scenePacks.id))
      .all()
      .map((p) => ({ ...p, sceneCount: counts.get(p.id) ?? 0 }))
  },
)

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
    log.info('create', 'Scene pack created', {
      scenePackId: result.id,
      name: data.name,
    })
    return result
  })

export const updateScenePack = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { id: number; name?: string; description?: string }) => data,
  )
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

export const createScenePackFromProjectScenes = createServerFn({
  method: 'POST',
})
  .inputValidator(
    (data: { name: string; projectSceneIds: Array<number> }) => data,
  )
  .handler(async ({ data }) => {
    if (!data.name.trim()) throw new Error('Pack name is required')
    if (data.projectSceneIds.length === 0) throw new Error('No scenes selected')

    // Fetch project scenes
    const pScenes = db
      .select()
      .from(projectScenes)
      .where(inArray(projectScenes.id, data.projectSceneIds))
      .orderBy(projectScenes.sortOrder)
      .all()

    if (pScenes.length === 0) throw new Error('No scenes found')

    // Create new global scene pack
    const pack = db
      .insert(scenePacks)
      .values({ name: data.name.trim() })
      .returning()
      .get()

    // Insert scenes from project scenes
    for (let i = 0; i < pScenes.length; i++) {
      const ps = pScenes[i]
      db.insert(scenes)
        .values({
          scenePackId: pack.id,
          name: ps.name,
          placeholders: ps.placeholders || '{}',
          sortOrder: i,
        })
        .run()
    }

    log.info(
      'createFromProjectScenes',
      'Scene pack created from project scenes',
      {
        scenePackId: pack.id,
        name: data.name,
        sceneCount: pScenes.length,
      },
    )

    return pack
  })

export const duplicateScenePack = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const source = db
      .select()
      .from(scenePacks)
      .where(eq(scenePacks.id, id))
      .get()
    if (!source) throw new Error('Scene pack not found')
    const names = db.select({ name: scenePacks.name }).from(scenePacks).all()
    const pack = db
      .insert(scenePacks)
      .values({
        name: nextCopyName(
          source.name,
          names.map((p) => p.name),
        ),
        description: source.description,
      })
      .returning()
      .get()
    const sceneList = db
      .select()
      .from(scenes)
      .where(eq(scenes.scenePackId, id))
      .orderBy(scenes.sortOrder)
      .all()
    sceneList.forEach((s, i) => {
      db.insert(scenes)
        .values({
          scenePackId: pack.id,
          name: s.name,
          description: s.description,
          placeholders: s.placeholders,
          sortOrder: i,
        })
        .run()
    })
    log.info('duplicate', 'Scene pack duplicated', {
      scenePackId: pack.id,
      sourceId: id,
    })
    return pack
  })
