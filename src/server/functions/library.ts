import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  characterSceneOverrides,
  characters,
  fragments,
  generatedImages,
  imageAxisValues,
  imageBundles,
  imageLibraryLinks,
  libraryAreas,
  libraryAxes,
  libraryAxisValues,
  libraryCharacters,
  outfitItems,
  outfitPresets,
  promptBundles,
} from '../db/schema'
import {
  cleanAreas,
  cleanConditions,
  copyOwnerContents,
  fragmentOut,
  loadLibraryData,
  remapAxisValues,
  remapOutfitEntries,
  renameItemVariable,
} from '../services/parts'
import { createLogger } from '../services/logger'
import type {
  Condition,
  CoverRule,
  ItemVariable,
  OutfitEntry,
} from '@/lib/character-parts'
import {
  canSetParent,
  parseAxisValues,
  parseCoverRules,
  parseOutfitEntries,
  parseVariables,
  stringifyOutfitEntries,
} from '@/lib/character-parts'
import { nextCopyName } from '@/lib/scene-templates'

const log = createLogger('fn.library')

function nextSort(
  table:
    | 'library_characters'
    | 'outfit_items'
    | 'outfit_presets'
    | 'library_areas',
): number {
  const row = db.get<{ n: number }>(
    sql.raw(`select coalesce(max(sort_order), -1) + 1 as n from ${table}`),
  )
  return row?.n ?? 0
}

const now = () => new Date().toISOString()

const outfitEntryIdsOf = (raw: string | null) =>
  parseOutfitEntries(raw).map((e) => e.id)

// ─── Read ───────────────────────────────────────────────────────────────────

export const getLibrary = createServerFn({ method: 'GET' })
  .inputValidator((data: { projectId?: number | null } | undefined) => data)
  .handler(async ({ data }) =>
    loadLibraryData(data?.projectId ?? null, { includeImageStats: true }),
  )

/** Names for specific ids regardless of project scope (gallery filter chips). */
export const getLibraryNames = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: {
      characterIds?: Array<number>
      itemIds?: Array<number>
      presetIds?: Array<number>
    }) => data,
  )
  .handler(async ({ data }) => {
    const characterIds = data.characterIds ?? []
    const itemIds = data.itemIds ?? []
    const presetIds = data.presetIds ?? []
    return {
      presets: presetIds.length
        ? db
            .select({ id: outfitPresets.id, name: outfitPresets.name })
            .from(outfitPresets)
            .where(inArray(outfitPresets.id, presetIds))
            .all()
        : [],
      characters: characterIds.length
        ? db
            .select({ id: libraryCharacters.id, name: libraryCharacters.name })
            .from(libraryCharacters)
            .where(inArray(libraryCharacters.id, characterIds))
            .all()
        : [],
      items: itemIds.length
        ? db
            .select({ id: outfitItems.id, name: outfitItems.name })
            .from(outfitItems)
            .where(inArray(outfitItems.id, itemIds))
            .all()
        : [],
    }
  })

export const getLibraryUsage = createServerFn({ method: 'GET' })
  .inputValidator((data: { kind: 'character' | 'item'; id: number }) => data)
  .handler(async ({ data }) => {
    const slots = new Set<number>()
    const projectIds = new Set<number>()
    if (data.kind === 'character') {
      for (const c of db
        .select({ id: characters.id, projectId: characters.projectId })
        .from(characters)
        .where(eq(characters.libraryCharacterId, data.id))
        .all()) {
        slots.add(c.id)
        projectIds.add(c.projectId)
      }
    } else {
      const rows = db.select().from(characters).all()
      const slotProject = new Map(rows.map((c) => [c.id, c.projectId]))
      for (const c of rows) {
        if (parseOutfitEntries(c.outfitItemIds).some((e) => e.id === data.id)) {
          slots.add(c.id)
          projectIds.add(c.projectId)
        }
      }
      for (const o of db.select().from(characterSceneOverrides).all()) {
        if (
          o.outfitItemIds &&
          parseOutfitEntries(o.outfitItemIds).some((e) => e.id === data.id)
        ) {
          const pid = slotProject.get(o.characterId)
          if (pid !== undefined) {
            slots.add(o.characterId)
            projectIds.add(pid)
          }
        }
      }
    }
    return { slots: slots.size, projects: projectIds.size }
  })

/** Latest images generated with a library character / outfit item. */
export const listLibraryImages = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: {
      kind: 'character' | 'item' | 'preset'
      id: number
      limit?: number
    }) => data,
  )
  .handler(async ({ data }) => {
    return db
      .select({
        id: generatedImages.id,
        filePath: generatedImages.filePath,
        thumbnailPath: generatedImages.thumbnailPath,
        seed: generatedImages.seed,
        isFavorite: generatedImages.isFavorite,
        rating: generatedImages.rating,
        createdAt: generatedImages.createdAt,
      })
      .from(imageLibraryLinks)
      .innerJoin(
        generatedImages,
        eq(imageLibraryLinks.imageId, generatedImages.id),
      )
      .where(
        and(
          eq(imageLibraryLinks.kind, data.kind),
          eq(imageLibraryLinks.refId, data.id),
        ),
      )
      .orderBy(desc(generatedImages.createdAt), desc(generatedImages.id))
      .limit(data.limit ?? 24)
      .all()
  })

export type ImageLibraryInfo = {
  characters: Array<{ id: number; name: string; projectId: number | null }>
  items: Array<{ id: number; name: string; projectId: number | null }>
  presets: Array<{ id: number; name: string }>
  axes: Array<{ axisName: string; valueName: string }>
  bundles: Array<{ id: number; name: string }>
}

/** Library data an image was generated from (deleted library rows are skipped). */
export const getImageLibraryInfo = createServerFn({ method: 'GET' })
  .inputValidator((data: { imageId: number }) => data)
  .handler(async ({ data }): Promise<ImageLibraryInfo> => {
    const links = db
      .select()
      .from(imageLibraryLinks)
      .where(eq(imageLibraryLinks.imageId, data.imageId))
      .all()
    const idsOf = (kind: string) =>
      links.filter((l) => l.kind === kind).map((l) => l.refId)
    const charIds = idsOf('character')
    const itemIds = idsOf('item')
    const presetIds = idsOf('preset')
    const characters = charIds.length
      ? db
          .select({
            id: libraryCharacters.id,
            name: libraryCharacters.name,
            projectId: libraryCharacters.projectId,
          })
          .from(libraryCharacters)
          .where(inArray(libraryCharacters.id, charIds))
          .all()
      : []
    const items = itemIds.length
      ? db
          .select({
            id: outfitItems.id,
            name: outfitItems.name,
            projectId: outfitItems.projectId,
          })
          .from(outfitItems)
          .where(inArray(outfitItems.id, itemIds))
          .all()
      : []
    const presets = presetIds.length
      ? db
          .select({ id: outfitPresets.id, name: outfitPresets.name })
          .from(outfitPresets)
          .where(inArray(outfitPresets.id, presetIds))
          .all()
      : []
    const axes = db
      .select({
        axisName: libraryAxes.name,
        valueName: libraryAxisValues.name,
      })
      .from(imageAxisValues)
      .innerJoin(libraryAxes, eq(imageAxisValues.axisId, libraryAxes.id))
      .innerJoin(
        libraryAxisValues,
        eq(imageAxisValues.valueId, libraryAxisValues.id),
      )
      .where(eq(imageAxisValues.imageId, data.imageId))
      .orderBy(libraryAxes.sortOrder, libraryAxes.id)
      .all()
    const bundles = db
      .select({ id: promptBundles.id, name: promptBundles.name })
      .from(imageBundles)
      .innerJoin(promptBundles, eq(imageBundles.bundleId, promptBundles.id))
      .where(eq(imageBundles.imageId, data.imageId))
      .all()
    return { characters, items, presets, axes, bundles }
  })

// ─── Characters ─────────────────────────────────────────────────────────────

export const createLibraryCharacter = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { name: string; description?: string; projectId?: number }) => data,
  )
  .handler(async ({ data }) => {
    const row = db
      .insert(libraryCharacters)
      .values({
        name: data.name,
        description: data.description ?? null,
        projectId: data.projectId ?? null,
        sortOrder: nextSort('library_characters'),
      })
      .returning()
      .get()
    log.info('createCharacter', 'Library character created', { id: row.id })
    return row
  })

export const updateLibraryCharacter = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      name?: string
      description?: string | null
      thumbnailImageId?: number | null
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    db.update(libraryCharacters)
      .set({ ...updates, updatedAt: now() })
      .where(eq(libraryCharacters.id, id))
      .run()
    return { success: true }
  })

export const deleteLibraryCharacter = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    db.transaction((tx) => {
      tx.delete(imageLibraryLinks)
        .where(
          and(
            eq(imageLibraryLinks.kind, 'character'),
            eq(imageLibraryLinks.refId, id),
          ),
        )
        .run()
      tx.delete(libraryCharacters).where(eq(libraryCharacters.id, id)).run()
    })
    return { success: true }
  })

export const duplicateLibraryCharacter = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    return db.transaction((tx) => {
      const src = tx
        .select()
        .from(libraryCharacters)
        .where(eq(libraryCharacters.id, id))
        .get()
      if (!src) throw new Error('Library character not found')
      const names = tx
        .select({ name: libraryCharacters.name })
        .from(libraryCharacters)
        .all()
        .map((r) => r.name)
      const copy = tx
        .insert(libraryCharacters)
        .values({
          name: nextCopyName(src.name, names),
          description: src.description,
          projectId: src.projectId,
          thumbnailImageId: null,
          sortOrder: (src.sortOrder ?? 0) + 1,
        })
        .returning()
        .get()
      copyOwnerContents(tx, { characterId: src.id }, { characterId: copy.id })
      return copy
    })
  })

// ─── Outfit items ───────────────────────────────────────────────────────────

export const createOutfitItem = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      name: string
      description?: string
      projectId?: number
      conditions?: Condition
      areaIds?: Array<number>
      coverRules?: Array<CoverRule>
      variables?: Array<ItemVariable>
    }) => data,
  )
  .handler(async ({ data }) => {
    return db
      .insert(outfitItems)
      .values({
        name: data.name,
        description: data.description ?? null,
        projectId: data.projectId ?? null,
        conditions: JSON.stringify(data.conditions ?? {}),
        areaIds: JSON.stringify(data.areaIds ?? []),
        coverRules: JSON.stringify(data.coverRules ?? []),
        variables: JSON.stringify(parseVariables(data.variables ?? [])),
        sortOrder: nextSort('outfit_items'),
      })
      .returning()
      .get()
  })

export const updateOutfitItem = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      name?: string
      description?: string | null
      thumbnailImageId?: number | null
      conditions?: Condition
      areaIds?: Array<number>
      coverRules?: Array<CoverRule>
      variables?: Array<ItemVariable>
      /** Variable renames: fragment tokens + stored entry values follow */
      renames?: Array<{ from: string; to: string }>
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, conditions, areaIds, coverRules, variables, renames, ...rest } =
      data
    db.transaction((tx) => {
      for (const r of renames ?? []) {
        if (r.from !== r.to) renameItemVariable(tx, id, r.from, r.to)
      }
      tx.update(outfitItems)
        .set({
          ...rest,
          ...(variables !== undefined
            ? { variables: JSON.stringify(parseVariables(variables)) }
            : {}),
          ...(conditions !== undefined
            ? { conditions: JSON.stringify(conditions) }
            : {}),
          ...(areaIds !== undefined
            ? { areaIds: JSON.stringify(areaIds) }
            : {}),
          ...(coverRules !== undefined
            ? { coverRules: JSON.stringify(parseCoverRules(coverRules)) }
            : {}),
          updatedAt: now(),
        })
        .where(eq(outfitItems.id, id))
        .run()
    })
    return { success: true }
  })

export const deleteOutfitItem = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    db.transaction((tx) => {
      tx.delete(imageLibraryLinks)
        .where(
          and(
            eq(imageLibraryLinks.kind, 'item'),
            eq(imageLibraryLinks.refId, id),
          ),
        )
        .run()
      tx.delete(outfitItems).where(eq(outfitItems.id, id)).run()
    })
    return { success: true }
  })

export const duplicateOutfitItem = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    return db.transaction((tx) => {
      const src = tx
        .select()
        .from(outfitItems)
        .where(eq(outfitItems.id, id))
        .get()
      if (!src) throw new Error('Outfit item not found')
      const names = tx
        .select({ name: outfitItems.name })
        .from(outfitItems)
        .all()
        .map((r) => r.name)
      const copy = tx
        .insert(outfitItems)
        .values({
          name: nextCopyName(src.name, names),
          description: src.description,
          projectId: src.projectId,
          thumbnailImageId: null,
          conditions: '{}',
          areaIds: src.areaIds ?? '[]',
          variables: src.variables ?? '[]',
          sortOrder: (src.sortOrder ?? 0) + 1,
        })
        .returning()
        .get()
      const { itemConditions, coverRules } = copyOwnerContents(
        tx,
        { itemId: src.id },
        { itemId: copy.id },
        JSON.parse(src.conditions || '{}') as Condition,
        parseCoverRules(src.coverRules),
      )
      tx.update(outfitItems)
        .set({
          conditions: JSON.stringify(itemConditions),
          coverRules: JSON.stringify(coverRules),
        })
        .where(eq(outfitItems.id, copy.id))
        .run()
      return {
        ...copy,
        conditions: JSON.stringify(itemConditions),
        coverRules: JSON.stringify(coverRules),
      }
    })
  })

// ─── Fragments ──────────────────────────────────────────────────────────────

export const createFragment = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      characterId?: number
      itemId?: number
      text?: string
      conditions?: Condition
      areaIds?: Array<number>
    }) => data,
  )
  .handler(async ({ data }) => {
    if ((data.characterId == null) === (data.itemId == null)) {
      throw new Error('Exactly one of characterId / itemId is required')
    }
    const owner =
      data.characterId != null
        ? eq(fragments.characterId, data.characterId)
        : eq(fragments.itemId, data.itemId as number)
    const maxSort = db
      .select({
        max: sql<number>`coalesce(max(${fragments.sortOrder}), -1)`,
      })
      .from(fragments)
      .where(owner)
      .get()
    const row = db
      .insert(fragments)
      .values({
        characterId: data.characterId ?? null,
        itemId: data.itemId ?? null,
        text: data.text ?? '',
        conditions: JSON.stringify(data.conditions ?? {}),
        areaIds: JSON.stringify(
          data.itemId != null ? (data.areaIds ?? []) : [],
        ),
        sortOrder: (maxSort?.max ?? -1) + 1,
      })
      .returning()
      .get()
    return fragmentOut(row)
  })

export const updateFragment = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      text?: string
      conditions?: Condition
      areaIds?: Array<number>
    }) => data,
  )
  .handler(async ({ data }) => {
    db.update(fragments)
      .set({
        ...(data.text !== undefined ? { text: data.text } : {}),
        ...(data.areaIds !== undefined
          ? { areaIds: JSON.stringify([...new Set(data.areaIds)]) }
          : {}),
        ...(data.conditions !== undefined
          ? { conditions: JSON.stringify(data.conditions) }
          : {}),
        updatedAt: now(),
      })
      .where(eq(fragments.id, data.id))
      .run()
    return { success: true }
  })

export const deleteFragment = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    db.delete(fragments).where(eq(fragments.id, id)).run()
    return { success: true }
  })

export const reorderFragments = createServerFn({ method: 'POST' })
  .inputValidator((data: { ids: Array<number> }) => data)
  .handler(async ({ data }) => {
    db.transaction((tx) => {
      data.ids.forEach((id, i) => {
        tx.update(fragments)
          .set({ sortOrder: i })
          .where(eq(fragments.id, id))
          .run()
      })
    })
    return { success: true }
  })

// ─── Axes ───────────────────────────────────────────────────────────────────

export const createAxis = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      name: string
      ownerCharacterId?: number
      ownerItemId?: number
      values: Array<string>
    }) => data,
  )
  .handler(async ({ data }) => {
    return db.transaction((tx) => {
      const maxSort = tx
        .select({
          max: sql<number>`coalesce(max(${libraryAxes.sortOrder}), -1)`,
        })
        .from(libraryAxes)
        .all()
      const axis = tx
        .insert(libraryAxes)
        .values({
          name: data.name,
          ownerCharacterId: data.ownerCharacterId ?? null,
          ownerItemId: data.ownerItemId ?? null,
          sortOrder: (maxSort[0]?.max ?? -1) + 1,
        })
        .returning()
        .get()
      const values = data.values
        .map((v) => v.trim())
        .filter(Boolean)
        .map((name, i) =>
          tx
            .insert(libraryAxisValues)
            .values({ axisId: axis.id, name, sortOrder: i })
            .returning()
            .get(),
        )
      return {
        id: axis.id,
        name: axis.name,
        ownerCharacterId: axis.ownerCharacterId,
        ownerItemId: axis.ownerItemId,
        sortOrder: axis.sortOrder ?? 0,
        values: values.map((v) => ({ id: v.id, name: v.name })),
      }
    })
  })

export const renameAxis = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; name: string }) => data)
  .handler(async ({ data }) => {
    db.update(libraryAxes)
      .set({ name: data.name })
      .where(eq(libraryAxes.id, data.id))
      .run()
    return { success: true }
  })

export const deleteAxis = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    db.transaction((tx) => {
      cleanConditions(tx, id)
      tx.delete(libraryAxes).where(eq(libraryAxes.id, id)).run()
    })
    return { success: true }
  })

export const reorderAxes = createServerFn({ method: 'POST' })
  .inputValidator((data: { ids: Array<number> }) => data)
  .handler(async ({ data }) => {
    db.transaction((tx) => {
      data.ids.forEach((id, i) => {
        tx.update(libraryAxes)
          .set({ sortOrder: i })
          .where(eq(libraryAxes.id, id))
          .run()
      })
    })
    return { success: true }
  })

export const createAxisValue = createServerFn({ method: 'POST' })
  .inputValidator((data: { axisId: number; name: string }) => data)
  .handler(async ({ data }) => {
    const maxSort = db
      .select({
        max: sql<number>`coalesce(max(${libraryAxisValues.sortOrder}), -1)`,
      })
      .from(libraryAxisValues)
      .where(eq(libraryAxisValues.axisId, data.axisId))
      .get()
    const row = db
      .insert(libraryAxisValues)
      .values({
        axisId: data.axisId,
        name: data.name,
        sortOrder: (maxSort?.max ?? -1) + 1,
      })
      .returning()
      .get()
    return { id: row.id, name: row.name }
  })

export const renameAxisValue = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; name: string }) => data)
  .handler(async ({ data }) => {
    db.update(libraryAxisValues)
      .set({ name: data.name })
      .where(eq(libraryAxisValues.id, data.id))
      .run()
    return { success: true }
  })

export const deleteAxisValue = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    db.transaction((tx) => {
      const v = tx
        .select()
        .from(libraryAxisValues)
        .where(eq(libraryAxisValues.id, id))
        .get()
      if (!v) return
      cleanConditions(tx, v.axisId, id)
      tx.delete(libraryAxisValues).where(eq(libraryAxisValues.id, id)).run()
    })
    return { success: true }
  })

export const reorderAxisValues = createServerFn({ method: 'POST' })
  .inputValidator((data: { ids: Array<number> }) => data)
  .handler(async ({ data }) => {
    db.transaction((tx) => {
      data.ids.forEach((id, i) => {
        tx.update(libraryAxisValues)
          .set({ sortOrder: i })
          .where(eq(libraryAxisValues.id, id))
          .run()
      })
    })
    return { success: true }
  })

// ─── Body areas ─────────────────────────────────────────────────────────────

export const createArea = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; parentId?: number | null }) => data)
  .handler(async ({ data }) => {
    const parentId = data.parentId ?? null
    if (parentId !== null) {
      const parent = db
        .select()
        .from(libraryAreas)
        .where(eq(libraryAreas.id, parentId))
        .get()
      if (!parent || parent.parentId != null)
        throw new Error('Parent must be a top-level area')
    }
    const row = db
      .insert(libraryAreas)
      .values({
        name: data.name.trim(),
        parentId,
        sortOrder: nextSort('library_areas'),
      })
      .returning()
      .get()
    return {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      sortOrder: row.sortOrder ?? 0,
    }
  })

/** One level only: a parent must be top-level; an area with children cannot get one. */
export const setAreaParent = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; parentId: number | null }) => data)
  .handler(async ({ data }) => {
    const all = db.select().from(libraryAreas).all()
    if (!canSetParent(all, data.id, data.parentId))
      throw new Error('Invalid parent (one level only)')
    db.update(libraryAreas)
      .set({ parentId: data.parentId })
      .where(eq(libraryAreas.id, data.id))
      .run()
    return { success: true }
  })

export const renameArea = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; name: string }) => data)
  .handler(async ({ data }) => {
    db.update(libraryAreas)
      .set({ name: data.name.trim() })
      .where(eq(libraryAreas.id, data.id))
      .run()
    return { success: true }
  })

export const deleteArea = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    db.transaction((tx) => {
      cleanAreas(tx, id)
      tx.delete(libraryAreas).where(eq(libraryAreas.id, id)).run()
    })
    return { success: true }
  })

export const reorderAreas = createServerFn({ method: 'POST' })
  .inputValidator((data: { ids: Array<number> }) => data)
  .handler(async ({ data }) => {
    db.transaction((tx) => {
      data.ids.forEach((id, i) => {
        tx.update(libraryAreas)
          .set({ sortOrder: i })
          .where(eq(libraryAreas.id, id))
          .run()
      })
    })
    return { success: true }
  })

// ─── Presets ────────────────────────────────────────────────────────────────

export const createPreset = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      name: string
      description?: string
      /** Item ids or entries (id + variable values) */
      itemIds?: Array<number | OutfitEntry>
    }) => data,
  )
  .handler(async ({ data }) => {
    const entries = parseOutfitEntries(data.itemIds ?? [])
    const row = db
      .insert(outfitPresets)
      .values({
        name: data.name,
        description: data.description ?? null,
        itemIds: stringifyOutfitEntries(entries),
        sortOrder: nextSort('outfit_presets'),
      })
      .returning()
      .get()
    return { ...row, itemIds: entries.map((e) => e.id), entries }
  })

export const updatePreset = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      name?: string
      description?: string | null
      itemIds?: Array<number | OutfitEntry>
      thumbnailImageId?: number | null
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, itemIds, ...rest } = data
    db.update(outfitPresets)
      .set({
        ...rest,
        ...(itemIds !== undefined
          ? { itemIds: stringifyOutfitEntries(itemIds) }
          : {}),
        updatedAt: now(),
      })
      .where(eq(outfitPresets.id, id))
      .run()
    return { success: true }
  })

export const deletePreset = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    db.transaction((tx) => {
      tx.delete(imageLibraryLinks)
        .where(
          and(
            eq(imageLibraryLinks.kind, 'preset'),
            eq(imageLibraryLinks.refId, id),
          ),
        )
        .run()
      tx.delete(outfitPresets).where(eq(outfitPresets.id, id)).run()
    })
    return { success: true }
  })

// ─── Detach ─────────────────────────────────────────────────────────────────

/**
 * Make project-only copies of the slot's linked (global) character and every
 * global outfit item used by the slot (default outfit + its scene overrides),
 * and relink the slot / overrides. One transaction.
 */
export const detachCharacterSlot = createServerFn({ method: 'POST' })
  .inputValidator((data: { characterSlotId: number }) => data)
  .handler(async ({ data }) => {
    return db.transaction((tx) => {
      const slot = tx
        .select()
        .from(characters)
        .where(eq(characters.id, data.characterSlotId))
        .get()
      if (!slot) throw new Error('Character not found')

      const maps = {
        axes: new Map<number, number>(),
        values: new Map<number, number>(),
      }
      let libraryCharacterId = slot.libraryCharacterId

      // 1) character
      if (slot.libraryCharacterId != null) {
        const lib = tx
          .select()
          .from(libraryCharacters)
          .where(eq(libraryCharacters.id, slot.libraryCharacterId))
          .get()
        if (lib && lib.projectId == null) {
          const copy = tx
            .insert(libraryCharacters)
            .values({
              name: lib.name,
              description: lib.description,
              projectId: slot.projectId,
              sourceId: lib.id,
              thumbnailImageId: null,
              sortOrder: lib.sortOrder,
            })
            .returning()
            .get()
          const r = copyOwnerContents(
            tx,
            { characterId: lib.id },
            { characterId: copy.id },
          )
          r.maps.axes.forEach((v, k) => maps.axes.set(k, v))
          r.maps.values.forEach((v, k) => maps.values.set(k, v))
          libraryCharacterId = copy.id
        }
      }

      // 2) items used by the slot
      const overrides = tx
        .select()
        .from(characterSceneOverrides)
        .where(eq(characterSceneOverrides.characterId, slot.id))
        .all()
      const usedIds = new Set<number>(outfitEntryIdsOf(slot.outfitItemIds))
      for (const o of overrides) {
        if (o.outfitItemIds) {
          outfitEntryIdsOf(o.outfitItemIds).forEach((i) => usedIds.add(i))
        }
      }
      const itemMap = new Map<number, number>()
      const used = [...usedIds]
      const itemRows = used.length
        ? tx
            .select()
            .from(outfitItems)
            .where(inArray(outfitItems.id, used))
            .all()
        : []
      for (const item of itemRows) {
        if (item.projectId != null) continue
        const copy = tx
          .insert(outfitItems)
          .values({
            name: item.name,
            description: item.description,
            projectId: slot.projectId,
            sourceId: item.id,
            thumbnailImageId: null,
            conditions: '{}',
            areaIds: item.areaIds ?? '[]',
            variables: item.variables ?? '[]',
            sortOrder: item.sortOrder,
          })
          .returning()
          .get()
        const r = copyOwnerContents(
          tx,
          { itemId: item.id },
          { itemId: copy.id },
          JSON.parse(item.conditions || '{}') as Condition,
          parseCoverRules(item.coverRules),
        )
        tx.update(outfitItems)
          .set({
            conditions: JSON.stringify(r.itemConditions),
            coverRules: JSON.stringify(r.coverRules),
          })
          .where(eq(outfitItems.id, copy.id))
          .run()
        r.maps.axes.forEach((v, k) => maps.axes.set(k, v))
        r.maps.values.forEach((v, k) => maps.values.set(k, v))
        itemMap.set(item.id, copy.id)
      }
      // 3) relink EVERY slot of the project (and its scene overrides) that
      // uses the same global character / copied items, with one shared id map
      const charMap = new Map<number, number>()
      if (
        slot.libraryCharacterId != null &&
        libraryCharacterId != null &&
        libraryCharacterId !== slot.libraryCharacterId
      ) {
        charMap.set(slot.libraryCharacterId, libraryCharacterId)
      }
      const mapIds = (raw: string | null) => remapOutfitEntries(raw, itemMap)
      const mapAxes = (raw: string | null) =>
        JSON.stringify(remapAxisValues(parseAxisValues(raw), maps))
      const projectSlots = tx
        .select()
        .from(characters)
        .where(eq(characters.projectId, slot.projectId))
        .all()
      for (const c of projectSlots) {
        const nextLib =
          c.libraryCharacterId != null
            ? (charMap.get(c.libraryCharacterId) ?? c.libraryCharacterId)
            : null
        const nextOutfit = mapIds(c.outfitItemIds)
        const nextAxes = mapAxes(c.axisValues)
        if (
          nextLib !== c.libraryCharacterId ||
          nextOutfit !== (c.outfitItemIds ?? '[]') ||
          nextAxes !== (c.axisValues ?? '{}')
        ) {
          tx.update(characters)
            .set({
              libraryCharacterId: nextLib,
              outfitItemIds: nextOutfit,
              axisValues: nextAxes,
              updatedAt: now(),
            })
            .where(eq(characters.id, c.id))
            .run()
        }
        const slotOverrides =
          c.id === slot.id
            ? overrides
            : tx
                .select()
                .from(characterSceneOverrides)
                .where(eq(characterSceneOverrides.characterId, c.id))
                .all()
        for (const o of slotOverrides) {
          const oOutfit = o.outfitItemIds ? mapIds(o.outfitItemIds) : null
          const oAxes = mapAxes(o.axisValues)
          if (oOutfit === o.outfitItemIds && oAxes === (o.axisValues ?? '{}'))
            continue
          tx.update(characterSceneOverrides)
            .set({ axisValues: oAxes, outfitItemIds: oOutfit })
            .where(eq(characterSceneOverrides.id, o.id))
            .run()
        }
      }

      log.info('detach', 'Character slot detached', {
        slotId: slot.id,
        libraryCharacterId,
        items: itemMap.size,
      })
      return {
        libraryCharacterId,
        itemIdMap: Object.fromEntries(itemMap),
      }
    })
  })
