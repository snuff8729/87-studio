import { createServerFn } from '@tanstack/react-start'
import { eq, max } from 'drizzle-orm'
import { db } from '../db'
import { characterSceneOverrides, characters } from '../db/schema'
import { createLogger } from '../services/logger'
import type { PositionSpec } from '@/lib/character-positions'
import type { OutfitEntry } from '@/lib/character-parts'
import type { Appearance } from '@/lib/scene-characters'
import {
  parseOutfitEntries,
  stringifyOutfitEntries,
} from '@/lib/character-parts'
import { encodePosition } from '@/lib/character-positions'

const log = createLogger('fn.characters')

export const listCharacters = createServerFn({ method: 'GET' })
  .inputValidator((projectId: number) => projectId)
  .handler(async ({ data: projectId }) => {
    return db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .orderBy(characters.slotIndex)
      .all()
  })

export const createCharacter = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId: number
      name: string
      charPrompt?: string
      charNegative?: string
      position?: PositionSpec | null
    }) => data,
  )
  .handler(async ({ data }) => {
    const maxSlot = db
      .select({ max: max(characters.slotIndex) })
      .from(characters)
      .where(eq(characters.projectId, data.projectId))
      .get()
    const slotIndex = (maxSlot?.max ?? -1) + 1

    const result = db
      .insert(characters)
      .values({
        projectId: data.projectId,
        slotIndex,
        name: data.name,
        charPrompt: data.charPrompt ?? '',
        charNegative: data.charNegative ?? '',
        position: encodePosition(data.position, true),
      })
      .returning()
      .get()
    log.info('create', 'Character created', {
      characterId: result.id,
      projectId: data.projectId,
      name: data.name,
    })
    return result
  })

export const updateCharacter = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      name?: string
      charPrompt?: string
      charNegative?: string
      /** Link / unlink a library character (null = unlink) */
      libraryCharacterId?: number | null
      /** Default outfit: ordered outfit item ids */
      outfitItemIds?: Array<number | OutfitEntry>
      /** Slot defaults for local axes: { [axisId]: valueId } */
      axisValues?: Record<string, number>
      /** PositionSpec (null/ai = AI decides) */
      position?: PositionSpec | null
      /** Scene appearance default (all scenes / only selected scenes) */
      appearance?: Appearance
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, outfitItemIds, axisValues, position, ...rest } = data
    db.update(characters)
      .set({
        ...rest,
        ...(outfitItemIds !== undefined
          ? { outfitItemIds: stringifyOutfitEntries(outfitItemIds) }
          : {}),
        ...(axisValues !== undefined
          ? { axisValues: JSON.stringify(axisValues) }
          : {}),
        ...(position !== undefined
          ? { position: encodePosition(position, true) }
          : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(characters.id, id))
      .run()
    // Unlinked slot with an empty default outfit uses no parts at all: drop
    // stale per-scene outfit overrides so they cannot resurface on relink
    const row = db.select().from(characters).where(eq(characters.id, id)).get()
    if (
      row &&
      row.libraryCharacterId === null &&
      parseOutfitEntries(row.outfitItemIds).length === 0
    ) {
      db.update(characterSceneOverrides)
        .set({ outfitItemIds: null })
        .where(eq(characterSceneOverrides.characterId, id))
        .run()
    }
    return { success: true }
  })

export const deleteCharacter = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    log.info('delete', 'Character deleted', { characterId: id })
    db.delete(characters).where(eq(characters.id, id)).run()
    return { success: true }
  })

export const moveCharacter = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; direction: -1 | 1 }) => data)
  .handler(async ({ data }) => {
    return db.transaction((tx) => {
      const current = tx
        .select()
        .from(characters)
        .where(eq(characters.id, data.id))
        .get()
      if (!current) return { success: false }
      const siblings = tx
        .select()
        .from(characters)
        .where(eq(characters.projectId, current.projectId))
        .orderBy(characters.slotIndex)
        .all()
      const index = siblings.findIndex((c) => c.id === current.id)
      const other = siblings[index + data.direction]
      if (!other) return { success: false }
      // UNIQUE(project_id, slot_index): park one row on a temporary index
      const a = current.slotIndex ?? 0
      const b = other.slotIndex ?? 0
      tx.update(characters)
        .set({ slotIndex: -1 })
        .where(eq(characters.id, current.id))
        .run()
      tx.update(characters)
        .set({ slotIndex: a })
        .where(eq(characters.id, other.id))
        .run()
      tx.update(characters)
        .set({ slotIndex: b })
        .where(eq(characters.id, current.id))
        .run()
      return { success: true }
    })
  })

/** Set the slot order of a project's characters (ids = all of them, new order). */
export const reorderCharacters = createServerFn({ method: 'POST' })
  .inputValidator((data: { ids: Array<number> }) => data)
  .handler(async ({ data }) => {
    return db.transaction((tx) => {
      const first = tx
        .select()
        .from(characters)
        .where(eq(characters.id, data.ids[0] ?? -1))
        .get()
      if (!first) return { success: false }
      const siblings = tx
        .select()
        .from(characters)
        .where(eq(characters.projectId, first.projectId))
        .all()
      const same =
        siblings.length === data.ids.length &&
        new Set(data.ids).size === data.ids.length &&
        siblings.every((c) => data.ids.includes(c.id))
      if (!same) throw new Error('Character list is out of date')
      // UNIQUE(project_id, slot_index): park every row on a temporary index first
      data.ids.forEach((id, i) => {
        tx.update(characters)
          .set({ slotIndex: -(i + 1) })
          .where(eq(characters.id, id))
          .run()
      })
      data.ids.forEach((id, i) => {
        tx.update(characters)
          .set({ slotIndex: i })
          .where(eq(characters.id, id))
          .run()
      })
      return { success: true }
    })
  })

export const duplicateCharacter = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; name: string }) => data)
  .handler(async ({ data }) => {
    return db.transaction((tx) => {
      const source = tx
        .select()
        .from(characters)
        .where(eq(characters.id, data.id))
        .get()
      if (!source) throw new Error('Character not found')
      const maxSlot = tx
        .select({ max: max(characters.slotIndex) })
        .from(characters)
        .where(eq(characters.projectId, source.projectId))
        .get()
      const copy = tx
        .insert(characters)
        .values({
          projectId: source.projectId,
          slotIndex: (maxSlot?.max ?? -1) + 1,
          name: data.name,
          charPrompt: source.charPrompt,
          charNegative: source.charNegative,
          libraryCharacterId: source.libraryCharacterId,
          outfitItemIds: source.outfitItemIds,
          axisValues: source.axisValues,
          position: source.position,
          appearance: source.appearance,
        })
        .returning()
        .get()
      const overrides = tx
        .select()
        .from(characterSceneOverrides)
        .where(eq(characterSceneOverrides.characterId, source.id))
        .all()
      for (const o of overrides) {
        tx.insert(characterSceneOverrides)
          .values({
            projectSceneId: o.projectSceneId,
            characterId: copy.id,
            placeholders: o.placeholders,
            axisValues: o.axisValues,
            outfitItemIds: o.outfitItemIds,
            position: o.position,
            presence: o.presence,
            replacePrompt: o.replacePrompt,
            replaceNegative: o.replaceNegative,
          })
          .run()
      }
      log.info('duplicate', 'Character duplicated', {
        sourceId: source.id,
        characterId: copy.id,
        overrides: overrides.length,
      })
      return copy
    })
  })
