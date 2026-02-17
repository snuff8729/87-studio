import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { characters } from '../db/schema'
import { eq, max } from 'drizzle-orm'
import { createLogger } from '../services/logger'

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
  .inputValidator((data: { projectId: number; name: string; charPrompt?: string; charNegative?: string }) => data)
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
      })
      .returning()
      .get()
    log.info('create', 'Character created', { characterId: result.id, projectId: data.projectId, name: data.name })
    return result
  })

export const updateCharacter = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; name?: string; charPrompt?: string; charNegative?: string }) => data)
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    db.update(characters)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(characters.id, id))
      .run()
    return { success: true }
  })

export const deleteCharacter = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    log.info('delete', 'Character deleted', { characterId: id })
    db.delete(characters).where(eq(characters.id, id)).run()
    return { success: true }
  })
