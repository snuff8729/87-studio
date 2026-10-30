import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { projectScenePacks, projectScenes } from '../db/schema'
import {
  isNameTaken,
  swapNeighbor,
  uniqueSuffixedName,
} from '@/lib/project-packs'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

function packsOf(tx: Tx, projectId: number) {
  return tx
    .select()
    .from(projectScenePacks)
    .where(eq(projectScenePacks.projectId, projectId))
    .orderBy(asc(projectScenePacks.sortOrder), asc(projectScenePacks.id))
    .all()
}

function scenesOf(tx: Tx, packId: number) {
  return tx
    .select()
    .from(projectScenes)
    .where(eq(projectScenes.projectScenePackId, packId))
    .orderBy(asc(projectScenes.sortOrder), asc(projectScenes.id))
    .all()
}

function ownedPack(tx: Tx, projectId: number, packId: number) {
  const pack = tx
    .select()
    .from(projectScenePacks)
    .where(eq(projectScenePacks.id, packId))
    .get()
  if (!pack || pack.projectId !== projectId) throw new Error('Pack not found')
  return pack
}

export const createProjectScenePack = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: number; name: string }) => data)
  .handler(async ({ data }) => {
    const name = data.name.trim()
    if (!name) throw new Error('Name required')
    return db.transaction((tx) => {
      const packs = packsOf(tx, data.projectId)
      if (
        isNameTaken(
          name,
          packs.map((p) => p.name),
        )
      ) {
        throw new Error('DUPLICATE_PACK_NAME')
      }
      const maxSort = tx
        .select({
          max: sql<number>`coalesce(max(${projectScenePacks.sortOrder}), -1)`,
        })
        .from(projectScenePacks)
        .where(eq(projectScenePacks.projectId, data.projectId))
        .get()
      return tx
        .insert(projectScenePacks)
        .values({
          projectId: data.projectId,
          name,
          sortOrder: (maxSort?.max ?? -1) + 1,
        })
        .returning()
        .get()
    })
  })

export const renameProjectScenePack = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { projectId: number; id: number; name: string }) => data,
  )
  .handler(async ({ data }) => {
    const name = data.name.trim()
    if (!name) throw new Error('Name required')
    db.transaction((tx) => {
      ownedPack(tx, data.projectId, data.id)
      const others = packsOf(tx, data.projectId)
        .filter((p) => p.id !== data.id)
        .map((p) => p.name)
      if (isNameTaken(name, others)) throw new Error('DUPLICATE_PACK_NAME')
      tx.update(projectScenePacks)
        .set({ name })
        .where(eq(projectScenePacks.id, data.id))
        .run()
    })
    return { success: true }
  })

/** Moves a pack one step up/down; rewrites a dense 0..n-1 order. */
export const reorderProjectScenePack = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { projectId: number; id: number; direction: 'up' | 'down' }) => data,
  )
  .handler(async ({ data }) => {
    db.transaction((tx) => {
      ownedPack(tx, data.projectId, data.id)
      const ids = packsOf(tx, data.projectId).map((p) => p.id)
      const next = swapNeighbor(ids, data.id, data.direction)
      if (!next) return
      next.forEach((id, index) => {
        tx.update(projectScenePacks)
          .set({ sortOrder: index })
          .where(eq(projectScenePacks.id, id))
          .run()
      })
    })
    return { success: true }
  })

/**
 * Moves scenes to the end of `targetPackId` (in the given order). Names that
 * collide in the target get " (2)", " (3)", ... Returns moved/renamed counts.
 */
export const moveProjectScenes = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId: number
      sceneIds: Array<number>
      targetPackId: number
    }) => data,
  )
  .handler(async ({ data }) => {
    return db.transaction((tx) => {
      const target = ownedPack(tx, data.projectId, data.targetPackId)
      const projectPackIds = new Set(
        packsOf(tx, data.projectId).map((p) => p.id),
      )
      const rows =
        data.sceneIds.length > 0
          ? tx
              .select()
              .from(projectScenes)
              .where(inArray(projectScenes.id, data.sceneIds))
              .all()
          : []
      const byId = new Map(rows.map((r) => [r.id, r]))
      const ordered = data.sceneIds
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => r != null)
      if (ordered.length !== new Set(data.sceneIds).size) {
        throw new Error('Scene not found')
      }
      for (const scene of ordered) {
        if (!projectPackIds.has(scene.projectScenePackId)) {
          throw new Error('Scene not found')
        }
      }

      const targetScenes = scenesOf(tx, target.id)
      const taken = targetScenes.map((s) => s.name)
      let nextSort =
        targetScenes.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), -1) + 1
      const now = new Date().toISOString()
      let moved = 0
      let renamed = 0
      const movedIds: Array<number> = []
      for (const scene of ordered) {
        if (scene.projectScenePackId === target.id) continue
        const name = uniqueSuffixedName(scene.name, taken)
        if (name !== scene.name) renamed++
        taken.push(name)
        tx.update(projectScenes)
          .set({
            projectScenePackId: target.id,
            name,
            sortOrder: nextSort++,
            updatedAt: now,
          })
          .where(eq(projectScenes.id, scene.id))
          .run()
        moved++
        movedIds.push(scene.id)
      }
      return { moved, renamed, movedIds }
    })
  })

/** Moves a scene one step up/down inside its pack (dense re-numbering). */
export const moveProjectScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { projectId: number; id: number; direction: 'up' | 'down' }) => data,
  )
  .handler(async ({ data }) => {
    db.transaction((tx) => {
      const scene = tx
        .select()
        .from(projectScenes)
        .where(eq(projectScenes.id, data.id))
        .get()
      if (!scene) throw new Error('Scene not found')
      ownedPack(tx, data.projectId, scene.projectScenePackId)
      const ids = scenesOf(tx, scene.projectScenePackId).map((s) => s.id)
      const next = swapNeighbor(ids, data.id, data.direction)
      if (!next) return
      next.forEach((id, index) => {
        tx.update(projectScenes)
          .set({ sortOrder: index })
          .where(and(eq(projectScenes.id, id)))
          .run()
      })
    })
    return { success: true }
  })
