import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  characterSceneOverrides,
  generatedImages,
  projectScenePacks,
  projectScenes,
} from '../db/schema'
import { deleteImageFiles } from '../services/image'
import type { ScenePositionSpec } from '@/lib/character-positions'
import type { OutfitEntry } from '@/lib/character-parts'
import { parseAxisValues, stringifyOutfitEntries } from '@/lib/character-parts'
import { encodePosition } from '@/lib/character-positions'

export const listProjectScenePacks = createServerFn({ method: 'GET' })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    const packs = db
      .select()
      .from(projectScenePacks)
      .where(eq(projectScenePacks.projectId, projectId))
      .orderBy(asc(projectScenePacks.sortOrder), asc(projectScenePacks.id))
      .all()

    const result = []
    for (const pack of packs) {
      const sceneList = db
        .select()
        .from(projectScenes)
        .where(eq(projectScenes.projectScenePackId, pack.id))
        .orderBy(asc(projectScenes.sortOrder), asc(projectScenes.id))
        .all()
      result.push({ ...pack, scenes: sceneList })
    }
    return result
  })

export const updateProjectScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      name?: string
      placeholders?: string
      thumbnailImageId?: number | null
    }) => data,
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
    (data: {
      projectSceneId: number
      characterId: number
      placeholders: string
    }) => data,
  )
  .handler(async ({ data }) => {
    db.insert(characterSceneOverrides)
      .values({
        projectSceneId: data.projectSceneId,
        characterId: data.characterId,
        placeholders: data.placeholders,
      })
      .onConflictDoUpdate({
        target: [
          characterSceneOverrides.projectSceneId,
          characterSceneOverrides.characterId,
        ],
        set: { placeholders: data.placeholders },
      })
      .run()
    return { success: true }
  })

/** Set the scene's values for global axes (replaces the whole map). */
export const updateSceneParts = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { sceneId: number; axisValues: Record<string, number> }) => data,
  )
  .handler(async ({ data }) => {
    db.update(projectScenes)
      .set({
        axisValues: JSON.stringify(data.axisValues),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(projectScenes.id, data.sceneId))
      .run()
    return { success: true }
  })

/** Merge: given keys are set on every scene, other keys stay untouched. */
export const bulkSetSceneAxisValues = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      sceneIds: Array<number>
      axisValues: Record<string, number>
    }) => data,
  )
  .handler(async ({ data }) => {
    if (data.sceneIds.length === 0) return { success: true, updated: 0 }
    const now = new Date().toISOString()
    db.transaction((tx) => {
      const rows = tx
        .select({ id: projectScenes.id, axisValues: projectScenes.axisValues })
        .from(projectScenes)
        .where(inArray(projectScenes.id, data.sceneIds))
        .all()
      for (const row of rows) {
        const merged = { ...parseAxisValues(row.axisValues), ...data.axisValues }
        tx.update(projectScenes)
          .set({ axisValues: JSON.stringify(merged), updatedAt: now })
          .where(eq(projectScenes.id, row.id))
          .run()
      }
    })
    return { success: true, updated: data.sceneIds.length }
  })

/**
 * Upsert the per-scene parts of a character override. `axisValues` replaces
 * the map; `outfitItemIds`: array = replace outfit for this scene, null =
 * reset to the slot default. Omitted fields are untouched.
 */
export const updateCharacterOverrideParts = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      sceneId: number
      characterId: number
      axisValues?: Record<string, number>
      outfitItemIds?: Array<number | OutfitEntry> | null
    }) => data,
  )
  .handler(async ({ data }) => {
    const patch: { axisValues?: string; outfitItemIds?: string | null } = {}
    if (data.axisValues !== undefined) {
      patch.axisValues = JSON.stringify(data.axisValues)
    }
    if (data.outfitItemIds !== undefined) {
      patch.outfitItemIds =
        data.outfitItemIds === null
          ? null
          : stringifyOutfitEntries(data.outfitItemIds)
    }
    db.insert(characterSceneOverrides)
      .values({
        projectSceneId: data.sceneId,
        characterId: data.characterId,
        ...patch,
      })
      .onConflictDoUpdate({
        target: [
          characterSceneOverrides.projectSceneId,
          characterSceneOverrides.characterId,
        ],
        set: patch,
      })
      .run()
    return { success: true }
  })

/** Set (or clear with null = inherit) the position override of one character in one or more scenes */
export const setCharacterPositionOverride = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectSceneIds: Array<number>
      characterId: number
      position: ScenePositionSpec | null
    }) => data,
  )
  .handler(async ({ data }) => {
    const position = encodePosition(data.position)
    db.transaction((tx) => {
      for (const projectSceneId of data.projectSceneIds) {
        tx.insert(characterSceneOverrides)
          .values({ projectSceneId, characterId: data.characterId, position })
          .onConflictDoUpdate({
            target: [
              characterSceneOverrides.projectSceneId,
              characterSceneOverrides.characterId,
            ],
            set: { position },
          })
          .run()
      }
    })
    return { success: true }
  })

export const addProjectScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId: number
      name: string
      /** Target pack; default = the project's first pack (created if none) */
      packId?: number
      /** Copy placeholders and character overrides from this scene */
      copyFromSceneId?: number
    }) => data,
  )
  .handler(async ({ data }) => {
    return db.transaction((tx) => {
      let pack = data.packId
        ? tx
            .select()
            .from(projectScenePacks)
            .where(eq(projectScenePacks.id, data.packId))
            .get()
        : tx
            .select()
            .from(projectScenePacks)
            .where(eq(projectScenePacks.projectId, data.projectId))
            .orderBy(
              asc(projectScenePacks.sortOrder),
              asc(projectScenePacks.id),
            )
            .get()
      if (pack && pack.projectId !== data.projectId) {
        throw new Error('Pack not found')
      }
      if (data.packId && !pack) throw new Error('Pack not found')

      if (!pack) {
        pack = tx
          .insert(projectScenePacks)
          .values({
            projectId: data.projectId,
            name: 'Scenes',
          })
          .returning()
          .get()
      }

      const duplicate = tx
        .select({ id: projectScenes.id })
        .from(projectScenes)
        .where(
          and(
            eq(projectScenes.projectScenePackId, pack.id),
            eq(projectScenes.name, data.name),
          ),
        )
        .get()
      if (duplicate) throw new Error('DUPLICATE_SCENE_NAME')

      const source = data.copyFromSceneId
        ? tx
            .select()
            .from(projectScenes)
            .where(eq(projectScenes.id, data.copyFromSceneId))
            .get()
        : undefined

      if (source) {
        const sourcePack = tx
          .select()
          .from(projectScenePacks)
          .where(eq(projectScenePacks.id, source.projectScenePackId))
          .get()
        if (sourcePack?.projectId !== data.projectId) {
          throw new Error('Scene not found')
        }
      }

      // New scenes go to the end of the pack
      const maxSort = tx
        .select({
          max: sql<number>`coalesce(max(${projectScenes.sortOrder}), -1)`,
        })
        .from(projectScenes)
        .where(eq(projectScenes.projectScenePackId, pack.id))
        .get()

      const scene = tx
        .insert(projectScenes)
        .values({
          projectScenePackId: pack.id,
          name: data.name,
          placeholders: source?.placeholders ?? '{}',
          axisValues: source?.axisValues ?? '{}',
          sortOrder: (maxSort?.max ?? -1) + 1,
        })
        .returning()
        .get()

      if (source) {
        const overrides = tx
          .select()
          .from(characterSceneOverrides)
          .where(eq(characterSceneOverrides.projectSceneId, source.id))
          .all()
        for (const override of overrides) {
          tx.insert(characterSceneOverrides)
            .values({
              projectSceneId: scene.id,
              characterId: override.characterId,
              placeholders: override.placeholders,
              axisValues: override.axisValues,
              outfitItemIds: override.outfitItemIds,
              position: override.position,
            })
            .run()
        }
      }

      return scene
    })
  })

export const deleteProjectScene = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; deleteFiles?: boolean }) => data)
  .handler(async ({ data: { id: projectSceneId, deleteFiles = false } }) => {
    // Collect file paths before cascade delete
    const files = db
      .select({
        filePath: generatedImages.filePath,
        thumbnailPath: generatedImages.thumbnailPath,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectSceneId, projectSceneId))
      .all()

    db.delete(projectScenes).where(eq(projectScenes.id, projectSceneId)).run()
    // Kept files become orphans (cleaned up via Settings > Storage)
    if (deleteFiles) deleteImageFiles(files)

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

export const duplicateProjectScene = createServerFn({ method: 'POST' })
  .inputValidator((projectSceneId: number) => projectSceneId)
  .handler(async ({ data: projectSceneId }) => {
    const scene = db
      .select()
      .from(projectScenes)
      .where(eq(projectScenes.id, projectSceneId))
      .get()

    if (!scene) throw new Error('Scene not found')

    return db.transaction((tx) => {
      // Free name: "(Copy)", "(Copy 2)", ...
      const taken = new Set(
        tx
          .select({ name: projectScenes.name })
          .from(projectScenes)
          .where(eq(projectScenes.projectScenePackId, scene.projectScenePackId))
          .all()
          .map((r) => r.name),
      )
      let name = `${scene.name} (Copy)`
      for (let n = 2; taken.has(name); n++) {
        name = `${scene.name} (Copy ${n})`
      }

      // Make room right after the source scene
      tx.update(projectScenes)
        .set({ sortOrder: sql`${projectScenes.sortOrder} + 1` })
        .where(
          and(
            eq(projectScenes.projectScenePackId, scene.projectScenePackId),
            sql`${projectScenes.sortOrder} > ${scene.sortOrder}`,
          ),
        )
        .run()

      // Insert duplicated scene
      const newScene = db
        .insert(projectScenes)
        .values({
          projectScenePackId: scene.projectScenePackId,
          sourceSceneId: scene.sourceSceneId,
          name,
          placeholders: scene.placeholders,
          axisValues: scene.axisValues,
          sortOrder: (scene.sortOrder ?? 0) + 1,
        })
        .returning()
        .get()

      // Copy character overrides
      const overrides = db
        .select()
        .from(characterSceneOverrides)
        .where(eq(characterSceneOverrides.projectSceneId, projectSceneId))
        .all()

      for (const override of overrides) {
        tx.insert(characterSceneOverrides)
          .values({
            projectSceneId: newScene.id,
            characterId: override.characterId,
            placeholders: override.placeholders,
            axisValues: override.axisValues,
            outfitItemIds: override.outfitItemIds,
            position: override.position,
          })
          .run()
      }

      return newScene
    })
  })

export const bulkDeleteProjectScenes = createServerFn({ method: 'POST' })
  .inputValidator((data: { ids: Array<number>; deleteFiles?: boolean }) => data)
  .handler(async ({ data: { ids: sceneIds, deleteFiles = false } }) => {
    if (sceneIds.length === 0) return { success: true, deletedCount: 0 }

    let deletedCount = 0
    for (const sceneId of sceneIds) {
      const scene = db
        .select({ projectScenePackId: projectScenes.projectScenePackId })
        .from(projectScenes)
        .where(eq(projectScenes.id, sceneId))
        .get()

      if (!scene) continue

      // Collect file paths before cascade delete
      const files = db
        .select({
          filePath: generatedImages.filePath,
          thumbnailPath: generatedImages.thumbnailPath,
        })
        .from(generatedImages)
        .where(eq(generatedImages.projectSceneId, sceneId))
        .all()

      db.delete(projectScenes).where(eq(projectScenes.id, sceneId)).run()
      if (deleteFiles) deleteImageFiles(files)
      deletedCount++
    }

    return { success: true, deletedCount }
  })

export const bulkUpdatePlaceholders = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { updates: Array<{ sceneId: number; placeholders: string }> }) =>
      data,
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
  .inputValidator((projectSceneIds: Array<number>) => projectSceneIds)
  .handler(async ({ data: projectSceneIds }) => {
    if (projectSceneIds.length === 0) return []
    return db
      .select()
      .from(characterSceneOverrides)
      .where(inArray(characterSceneOverrides.projectSceneId, projectSceneIds))
      .all()
  })
