import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  fragments,
  generatedImages,
  imageAxisValues,
  imageLibraryLinks,
  libraryAreas,
  libraryAxes,
  libraryAxisValues,
  libraryCharacters,
  outfitItems,
  outfitPresets,
} from '../db/schema'
import type { AnyColumn } from 'drizzle-orm'
import type { Condition, CoverRule, PartsAxis } from '@/lib/character-parts'
import {
  parseCondition,
  parseCoverRules,
  parseIdList,
} from '@/lib/character-parts'

export type Tx = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

export interface LibraryFragment {
  id: number
  characterId: number | null
  itemId: number | null
  text: string
  conditions: Condition
  sortOrder: number
}

export interface LibraryAxis extends PartsAxis {
  sortOrder: number
}

export interface LibraryCharacterRow {
  /** Linked images (image_library_links) */
  imageCount: number
  /** Thumbnail image's thumbnail (if set and existing), else latest linked */
  thumbnailPath: string | null
  id: number
  name: string
  description: string | null
  /** null = global, otherwise project-only */
  projectId: number | null
  sourceId: number | null
  thumbnailImageId: number | null
  sortOrder: number
  fragments: Array<LibraryFragment>
}

export interface LibraryItemRow extends LibraryCharacterRow {
  conditions: Condition
  areaIds: Array<number>
  coverRules: Array<CoverRule>
}

export interface LibraryArea {
  id: number
  name: string
  sortOrder: number
}

export interface LibraryPreset {
  id: number
  name: string
  description: string | null
  itemIds: Array<number>
  sortOrder: number
}

export interface LibraryData {
  areas: Array<LibraryArea>
  axes: Array<LibraryAxis>
  characters: Array<LibraryCharacterRow>
  items: Array<LibraryItemRow>
  presets: Array<LibraryPreset>
}

export function fragmentOut(f: typeof fragments.$inferSelect): LibraryFragment {
  return {
    id: f.id,
    characterId: f.characterId,
    itemId: f.itemId,
    text: f.text ?? '',
    conditions: parseCondition(f.conditions),
    sortOrder: f.sortOrder ?? 0,
  }
}

/**
 * Load the whole parts library. Global rows always; project-only rows only for
 * `projectId`. Axes: all global + local axes of the returned characters/items.
 */
export function loadLibraryData(projectId?: number | null): LibraryData {
  const scope = (col: AnyColumn) =>
    projectId != null ? or(isNull(col), eq(col, projectId)) : isNull(col)

  const charRows = db
    .select()
    .from(libraryCharacters)
    .where(scope(libraryCharacters.projectId))
    .orderBy(asc(libraryCharacters.sortOrder), asc(libraryCharacters.id))
    .all()
  const itemRows = db
    .select()
    .from(outfitItems)
    .where(scope(outfitItems.projectId))
    .orderBy(asc(outfitItems.sortOrder), asc(outfitItems.id))
    .all()
  const charIds = new Set(charRows.map((c) => c.id))
  const itemIds = new Set(itemRows.map((i) => i.id))

  const fragRows = db
    .select()
    .from(fragments)
    .orderBy(asc(fragments.sortOrder), asc(fragments.id))
    .all()
  const fragsByChar = new Map<number, Array<LibraryFragment>>()
  const fragsByItem = new Map<number, Array<LibraryFragment>>()
  for (const row of fragRows) {
    const out = fragmentOut(row)
    if (row.characterId != null && charIds.has(row.characterId)) {
      const list = fragsByChar.get(row.characterId) ?? []
      list.push(out)
      fragsByChar.set(row.characterId, list)
    } else if (row.itemId != null && itemIds.has(row.itemId)) {
      const list = fragsByItem.get(row.itemId) ?? []
      list.push(out)
      fragsByItem.set(row.itemId, list)
    }
  }

  const axisRows = db
    .select()
    .from(libraryAxes)
    .orderBy(asc(libraryAxes.sortOrder), asc(libraryAxes.id))
    .all()
  const valueRows = db
    .select()
    .from(libraryAxisValues)
    .orderBy(asc(libraryAxisValues.sortOrder), asc(libraryAxisValues.id))
    .all()
  const valuesByAxis = new Map<number, Array<{ id: number; name: string }>>()
  for (const v of valueRows) {
    const list = valuesByAxis.get(v.axisId) ?? []
    list.push({ id: v.id, name: v.name })
    valuesByAxis.set(v.axisId, list)
  }
  const axes: Array<LibraryAxis> = axisRows
    .filter((a) => {
      if (a.ownerCharacterId != null) return charIds.has(a.ownerCharacterId)
      if (a.ownerItemId != null) return itemIds.has(a.ownerItemId)
      return true
    })
    .map((a) => ({
      id: a.id,
      name: a.name,
      ownerCharacterId: a.ownerCharacterId,
      ownerItemId: a.ownerItemId,
      sortOrder: a.sortOrder ?? 0,
      values: valuesByAxis.get(a.id) ?? [],
    }))

  const presets = db
    .select()
    .from(outfitPresets)
    .orderBy(asc(outfitPresets.sortOrder), asc(outfitPresets.id))
    .all()
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      itemIds: parseIdList(p.itemIds),
      sortOrder: p.sortOrder ?? 0,
    }))

  const linkCounts = new Map<string, number>()
  for (const r of db
    .select({
      kind: imageLibraryLinks.kind,
      refId: imageLibraryLinks.refId,
      n: sql<number>`count(*)`,
    })
    .from(imageLibraryLinks)
    .groupBy(imageLibraryLinks.kind, imageLibraryLinks.refId)
    .all()) {
    linkCounts.set(`${r.kind}:${r.refId}`, r.n)
  }
  const thumbOf = (
    kind: 'character' | 'item',
    id: number,
    thumbnailImageId: number | null,
  ): string | null => {
    if (thumbnailImageId != null) {
      const img = db
        .select({ t: generatedImages.thumbnailPath })
        .from(generatedImages)
        .where(eq(generatedImages.id, thumbnailImageId))
        .get()
      if (img?.t) return img.t
    }
    if (!linkCounts.get(`${kind}:${id}`)) return null
    const latest = db
      .select({ t: generatedImages.thumbnailPath })
      .from(imageLibraryLinks)
      .innerJoin(
        generatedImages,
        eq(imageLibraryLinks.imageId, generatedImages.id),
      )
      .where(
        and(eq(imageLibraryLinks.kind, kind), eq(imageLibraryLinks.refId, id)),
      )
      .orderBy(desc(generatedImages.createdAt), desc(generatedImages.id))
      .limit(1)
      .get()
    return latest?.t ?? null
  }

  const areas: Array<LibraryArea> = db
    .select()
    .from(libraryAreas)
    .orderBy(asc(libraryAreas.sortOrder), asc(libraryAreas.id))
    .all()
    .map((a) => ({ id: a.id, name: a.name, sortOrder: a.sortOrder ?? 0 }))

  return {
    areas,
    axes,
    characters: charRows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      projectId: c.projectId,
      sourceId: c.sourceId,
      thumbnailImageId: c.thumbnailImageId,
      sortOrder: c.sortOrder ?? 0,
      imageCount: linkCounts.get(`character:${c.id}`) ?? 0,
      thumbnailPath: thumbOf('character', c.id, c.thumbnailImageId),
      fragments: fragsByChar.get(c.id) ?? [],
    })),
    items: itemRows.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      projectId: i.projectId,
      sourceId: i.sourceId,
      thumbnailImageId: i.thumbnailImageId,
      sortOrder: i.sortOrder ?? 0,
      imageCount: linkCounts.get(`item:${i.id}`) ?? 0,
      thumbnailPath: thumbOf('item', i.id, i.thumbnailImageId),
      conditions: parseCondition(i.conditions),
      areaIds: parseIdList(i.areaIds),
      coverRules: parseCoverRules(i.coverRules),
      fragments: fragsByItem.get(i.id) ?? [],
    })),
    presets,
  }
}

export interface IdMaps {
  axes: Map<number, number>
  values: Map<number, number>
}

function remapCondition(cond: Condition, maps: IdMaps): Condition {
  const out: Condition = {}
  for (const [axisKey, ids] of Object.entries(cond)) {
    const newAxis = maps.axes.get(Number(axisKey))
    if (newAxis === undefined) {
      out[axisKey] = ids
    } else {
      out[String(newAxis)] = ids.map((id) => maps.values.get(id) ?? id)
    }
  }
  return out
}

export function remapCoverRules(
  rules: Array<CoverRule>,
  maps: IdMaps,
): Array<CoverRule> {
  return rules.map((r) => ({
    conditions: remapCondition(r.conditions, maps),
    areaIds: r.areaIds,
  }))
}

/** Remap {axisId: valueId} using local-axis id maps; other keys untouched. */
export function remapAxisValues(
  values: Record<string, number>,
  maps: IdMaps,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [axisKey, valueId] of Object.entries(values)) {
    const newAxis = maps.axes.get(Number(axisKey))
    if (newAxis === undefined) out[axisKey] = valueId
    else out[String(newAxis)] = maps.values.get(valueId) ?? valueId
  }
  return out
}

/**
 * Copy fragments and local axes (with values) from one owner to another,
 * remapping local axis/value ids inside fragment conditions.
 * Returns the id maps (and the remapped item condition if given).
 */
export function copyOwnerContents(
  tx: Tx,
  from: { characterId?: number; itemId?: number },
  to: { characterId?: number; itemId?: number },
  itemConditions?: Condition,
  coverRules?: Array<CoverRule>,
): { maps: IdMaps; itemConditions: Condition; coverRules: Array<CoverRule> } {
  const maps: IdMaps = { axes: new Map(), values: new Map() }
  const axisRows = tx
    .select()
    .from(libraryAxes)
    .where(
      from.characterId != null
        ? eq(libraryAxes.ownerCharacterId, from.characterId)
        : eq(libraryAxes.ownerItemId, from.itemId ?? -1),
    )
    .orderBy(asc(libraryAxes.sortOrder), asc(libraryAxes.id))
    .all()
  for (const axis of axisRows) {
    const created = tx
      .insert(libraryAxes)
      .values({
        name: axis.name,
        ownerCharacterId: to.characterId ?? null,
        ownerItemId: to.itemId ?? null,
        sortOrder: axis.sortOrder,
      })
      .returning()
      .get()
    maps.axes.set(axis.id, created.id)
    const vals = tx
      .select()
      .from(libraryAxisValues)
      .where(eq(libraryAxisValues.axisId, axis.id))
      .orderBy(asc(libraryAxisValues.sortOrder), asc(libraryAxisValues.id))
      .all()
    for (const v of vals) {
      const nv = tx
        .insert(libraryAxisValues)
        .values({ axisId: created.id, name: v.name, sortOrder: v.sortOrder })
        .returning()
        .get()
      maps.values.set(v.id, nv.id)
    }
  }

  const fragRows = tx
    .select()
    .from(fragments)
    .where(
      from.characterId != null
        ? eq(fragments.characterId, from.characterId)
        : eq(fragments.itemId, from.itemId ?? -1),
    )
    .orderBy(asc(fragments.sortOrder), asc(fragments.id))
    .all()
  for (const f of fragRows) {
    tx.insert(fragments)
      .values({
        characterId: to.characterId ?? null,
        itemId: to.itemId ?? null,
        text: f.text,
        conditions: JSON.stringify(
          remapCondition(parseCondition(f.conditions), maps),
        ),
        sortOrder: f.sortOrder,
      })
      .run()
  }
  return {
    maps,
    itemConditions: remapCondition(itemConditions ?? {}, maps),
    coverRules: remapCoverRules(coverRules ?? [], maps),
  }
}

/** Remove deleted axis / axis values from all fragment and item conditions. */
export function cleanConditions(
  tx: Tx,
  axisId: number,
  removeValueId?: number,
): void {
  const key = String(axisId)
  const fix = (raw: string | null): string | null => {
    const cond = parseCondition(raw)
    if (!(key in cond)) return null
    if (removeValueId === undefined) {
      delete cond[key]
    } else {
      const next = cond[key].filter((id) => id !== removeValueId)
      if (next.length === cond[key].length) return null
      // keep an empty list: the condition now never matches (not unconditional)
      cond[key] = next
    }
    return JSON.stringify(cond)
  }
  for (const f of tx.select().from(fragments).all()) {
    const next = fix(f.conditions)
    if (next !== null)
      tx.update(fragments)
        .set({ conditions: next })
        .where(eq(fragments.id, f.id))
        .run()
  }
  for (const i of tx.select().from(outfitItems).all()) {
    const next = fix(i.conditions)
    if (next !== null)
      tx.update(outfitItems)
        .set({ conditions: next })
        .where(eq(outfitItems.id, i.id))
        .run()
    // cover rule conditions are cleaned exactly like fragment conditions
    const rules = parseCoverRules(i.coverRules)
    let changed = false
    const nextRules = rules.map((r) => {
      const c = fix(JSON.stringify(r.conditions))
      if (c === null) return r
      changed = true
      return { ...r, conditions: JSON.parse(c) as Condition }
    })
    if (changed)
      tx.update(outfitItems)
        .set({ coverRules: JSON.stringify(nextRules) })
        .where(eq(outfitItems.id, i.id))
        .run()
  }
}

/** Remove a deleted area from all items' areas and cover rules. */
export function cleanAreas(tx: Tx, areaId: number): void {
  for (const i of tx.select().from(outfitItems).all()) {
    const areaIds = parseIdList(i.areaIds)
    const rules = parseCoverRules(i.coverRules)
    const usesRule = rules.some((r) => r.areaIds.includes(areaId))
    if (!areaIds.includes(areaId) && !usesRule) continue
    const nextRules = rules
      .map((r) => ({ ...r, areaIds: r.areaIds.filter((a) => a !== areaId) }))
      .filter((r) => r.areaIds.length > 0)
    tx.update(outfitItems)
      .set({
        areaIds: JSON.stringify(areaIds.filter((a) => a !== areaId)),
        coverRules: JSON.stringify(nextRules),
      })
      .where(eq(outfitItems.id, i.id))
      .run()
  }
}

/**
 * Distinct (global axis, value) pairs recorded in a job's resolved prompts,
 * restricted to pairs that still exist in the library (axis/value may have
 * been deleted since enqueue).
 */
export function globalAxisPairsOf(prompts: {
  characterPrompts: Array<{ axisValues?: Record<string, number> }>
}): Array<{ axisId: number; valueId: number }> {
  const candidates = new Map<string, { axisId: number; valueId: number }>()
  for (const c of prompts.characterPrompts) {
    for (const [axisKey, valueId] of Object.entries(c.axisValues ?? {})) {
      const axisId = Number(axisKey)
      if (!Number.isInteger(axisId) || !Number.isInteger(valueId)) continue
      candidates.set(`${axisId}:${valueId}`, { axisId, valueId })
    }
  }
  if (candidates.size === 0) return []
  const rows = db
    .select({ axisId: libraryAxisValues.axisId, valueId: libraryAxisValues.id })
    .from(libraryAxisValues)
    .innerJoin(libraryAxes, eq(libraryAxes.id, libraryAxisValues.axisId))
    .where(
      and(
        isNull(libraryAxes.ownerCharacterId),
        isNull(libraryAxes.ownerItemId),
        inArray(libraryAxisValues.axisId, [
          ...new Set([...candidates.values()].map((c) => c.axisId)),
        ]),
      ),
    )
    .all()
  return rows.filter((r) => candidates.has(`${r.axisId}:${r.valueId}`))
}

/** Insert the global axis values of an image (idempotent). */
export function recordImageAxisValues(
  imageId: number,
  prompts: Parameters<typeof globalAxisPairsOf>[0],
): void {
  for (const p of globalAxisPairsOf(prompts)) {
    db.insert(imageAxisValues)
      .values({ imageId, axisId: p.axisId, valueId: p.valueId })
      .onConflictDoNothing()
      .run()
  }
}

/**
 * Link an image to the library character / contributing outfit items recorded
 * in the job's resolved prompts. Ids that no longer exist are skipped.
 */
export function recordImageLibraryLinks(
  imageId: number,
  prompts: {
    characterPrompts: Array<{
      libraryCharacterId?: number
      outfitItemIds?: Array<number>
    }>
  },
): void {
  const chars = new Set<number>()
  const items = new Set<number>()
  for (const c of prompts.characterPrompts) {
    if (typeof c.libraryCharacterId === 'number')
      chars.add(c.libraryCharacterId)
    for (const id of c.outfitItemIds ?? []) items.add(id)
  }
  if (chars.size > 0) {
    for (const r of db
      .select({ id: libraryCharacters.id })
      .from(libraryCharacters)
      .where(inArray(libraryCharacters.id, [...chars]))
      .all()) {
      db.insert(imageLibraryLinks)
        .values({ imageId, kind: 'character', refId: r.id })
        .onConflictDoNothing()
        .run()
    }
  }
  if (items.size > 0) {
    for (const r of db
      .select({ id: outfitItems.id })
      .from(outfitItems)
      .where(inArray(outfitItems.id, [...items]))
      .all()) {
      db.insert(imageLibraryLinks)
        .values({ imageId, kind: 'item', refId: r.id })
        .onConflictDoNothing()
        .run()
    }
  }
}
