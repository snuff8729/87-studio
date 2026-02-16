import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { projectScenePacks, projectScenes, characterSceneOverrides } from '../db/schema'
import { eq } from 'drizzle-orm'

export const listProjectScenePacks = createServerFn({ method: 'GET' })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    const packs = db
      .select()
      .from(projectScenePacks)
      .where(eq(projectScenePacks.projectId, projectId))
      .all()

    const result = []
    for (const pack of packs) {
      const sceneList = db
        .select()
        .from(projectScenes)
        .where(eq(projectScenes.projectScenePackId, pack.id))
        .orderBy(projectScenes.sortOrder)
        .all()
      result.push({ ...pack, scenes: sceneList })
    }
    return result
  })

export const updateProjectScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { id: number; name?: string; placeholders?: string; thumbnailImageId?: number | null }) => data,
  )
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    db.update(projectScenes)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(projectScenes.id, id))
      .run()
    return { success: true }
  })

export const getCharacterOverrides = createServerFn({ method: 'GET' })
  .inputValidator((projectSceneId: number) => projectSceneId)
  .handler(async ({ data: projectSceneId }) => {
    return db
      .select()
      .from(characterSceneOverrides)
      .where(eq(characterSceneOverrides.projectSceneId, projectSceneId))
      .all()
  })

export const upsertCharacterOverride = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { projectSceneId: number; characterId: number; placeholders: string }) => data,
  )
  .handler(async ({ data }) => {
    db.insert(characterSceneOverrides)
      .values({
        projectSceneId: data.projectSceneId,
        characterId: data.characterId,
        placeholders: data.placeholders,
      })
      .onConflictDoUpdate({
        target: [characterSceneOverrides.projectSceneId, characterSceneOverrides.characterId],
        set: { placeholders: data.placeholders },
      })
      .run()
    return { success: true }
  })
