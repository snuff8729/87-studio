import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { projectScenePacks, projectScenes, characterSceneOverrides, generatedImages } from '../db/schema'
import { eq, sql, inArray } from 'drizzle-orm'
import { deleteImageFiles } from '../services/image'

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

export const addProjectScene = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: number; name: string }) => data)
  .handler(async ({ data }) => {
    // Find or create default project_scene_pack
    let pack = db
      .select()
      .from(projectScenePacks)
      .where(eq(projectScenePacks.projectId, data.projectId))
      .get()

    if (!pack) {
      pack = db
        .insert(projectScenePacks)
        .values({
          projectId: data.projectId,
          name: 'Scenes',
        })
        .returning()
        .get()
    }

    // Get next sort order
    const maxSort = db
      .select({ max: sql<number>`coalesce(max(${projectScenes.sortOrder}), -1)` })
      .from(projectScenes)
      .where(eq(projectScenes.projectScenePackId, pack.id))
      .get()

    const scene = db
      .insert(projectScenes)
      .values({
        projectScenePackId: pack.id,
        name: data.name,
        placeholders: '{}',
        sortOrder: (maxSort?.max ?? -1) + 1,
      })
      .returning()
      .get()

    return scene
  })

export const deleteProjectScene = createServerFn({ method: 'POST' })
  .inputValidator((projectSceneId: number) => projectSceneId)
  .handler(async ({ data: projectSceneId }) => {
    const scene = db
      .select({ projectScenePackId: projectScenes.projectScenePackId })
      .from(projectScenes)
      .where(eq(projectScenes.id, projectSceneId))
      .get()

    // Collect file paths before cascade delete
    const files = db
      .select({ filePath: generatedImages.filePath, thumbnailPath: generatedImages.thumbnailPath })
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, projectSceneId))
      .all()

    db.delete(projectScenes).where(eq(projectScenes.id, projectSceneId)).run()
    deleteImageFiles(files)

    // If parent pack has no remaining scenes, delete it too
    if (scene) {
      const remaining = db
        .select({ count: sql<number>`count(*)` })
        .from(projectScenes)
        .where(eq(projectScenes.projectScenePackId, scene.projectScenePackId))
        .get()

      if ((remaining?.count ?? 0) === 0) {
        db.delete(projectScenePacks)
          .where(eq(projectScenePacks.id, scene.projectScenePackId))
          .run()
      }
    }

    return { success: true }
  })

export const renameProjectScene = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; name: string }) => data)
  .handler(async ({ data }) => {
    db.update(projectScenes)
      .set({ name: data.name, updatedAt: new Date().toISOString() })
      .where(eq(projectScenes.id, data.id))
      .run()
    return { success: true }
  })

export const bulkUpdatePlaceholders = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { updates: Array<{ sceneId: number; placeholders: string }> }) => data,
  )
  .handler(async ({ data }) => {
    const now = new Date().toISOString()
    db.transaction((tx) => {
      for (const update of data.updates) {
        tx.update(projectScenes)
          .set({ placeholders: update.placeholders, updatedAt: now })
          .where(eq(projectScenes.id, update.sceneId))
          .run()
      }
    })
    return { success: true }
  })

export const getAllCharacterOverrides = createServerFn({ method: 'GET' })
  .inputValidator((projectSceneIds: number[]) => projectSceneIds)
  .handler(async ({ data: projectSceneIds }) => {
    if (projectSceneIds.length === 0) return []
    return db
      .select()
      .from(characterSceneOverrides)
      .where(inArray(characterSceneOverrides.projectSceneId, projectSceneIds))
      .all()
  })
