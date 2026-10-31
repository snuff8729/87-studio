import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  characterSceneOverrides,
  characters,
  projectScenes,
  projects,
  promptBundles,
} from '../db/schema'
import { createLogger } from './logger'
import { loadLibraryData } from './parts'
import type { AxisValues, OutfitEntry } from '@/lib/character-parts'
import type { PositionSpec } from '@/lib/character-positions'
import { resolvePlaceholders } from '@/lib/placeholder'
import {
  applyParts,
  composeParts,
  effectiveAxisValues,
  parseAxisValues,
  parseOutfitEntries,
  relevantAxes,
  resolveVarValues,
} from '@/lib/character-parts'
import { applyOverride, parsePositionSpec } from '@/lib/character-positions'
import { extractBundleReferences, resolveBundles } from '@/lib/bundle'

const log = createLogger('prompt')

export interface ResolvedPrompts {
  generalPrompt: string
  negativePrompt: string
  characterPrompts: Array<{
    characterId: number
    name: string
    prompt: string
    negative: string
    /** Resolved (default + scene override) position; absent = ai */
    position?: PositionSpec
    /**
     * Effective axis values (global + local) used to compose this slot; only
     * for slots that use parts. Recorded for the gallery axis filter.
     */
    axisValues?: AxisValues
    /** Outfit items hidden by occlusion in this scene (parts slots only) */
    hiddenItems?: Array<{ itemId: number; coveredBy: Array<number> }>
    /** Outfit items that yield no text under the scene's axis values (not hidden) */
    emptyItemIds?: Array<number>
    /** Linked library character yields no text under the scene's axis values */
    charEmpty?: boolean
    /** Items with some (not all) fragments hidden (parts slots only) */
    partialItems?: Array<{
      itemId: number
      fragmentIds: Array<number>
      coveredBy: Array<number>
      details: Array<{ fragmentId: number; coveredBy: Array<number> }>
    }>
    /** Effective outfit entries before occlusion (parts slots only) */
    outfitEntries?: Array<OutfitEntry>
    /** Linked library character (parts slots only) */
    libraryCharacterId?: number
    /** Outfit items that contributed at least one fragment (not hidden) */
    outfitItemIds?: Array<number>
  }>
  usedBundleIds?: Array<number>
}

/** Load all bundles as name→{id, content} map */
function loadBundleMap(): Map<string, { id: number; content: string }> {
  const rows = db
    .select({
      id: promptBundles.id,
      name: promptBundles.name,
      content: promptBundles.content,
    })
    .from(promptBundles)
    .all()
  return new Map(rows.map((r) => [r.name, { id: r.id, content: r.content }]))
}

/** Resolve @{bundleName} in a template and collect used bundle IDs */
function resolveBundlesWithTracking(
  template: string,
  bundleMap: Map<string, { id: number; content: string }>,
  usedIds: Set<number>,
): string {
  const contentMap: Record<string, string> = {}
  for (const name of extractBundleReferences(template)) {
    const entry = bundleMap.get(name)
    if (entry) {
      contentMap[name] = entry.content
      usedIds.add(entry.id)
    }
  }
  return resolveBundles(template, contentMap)
}

export function synthesizePrompts(
  projectId: number,
  projectSceneId: number,
): ResolvedPrompts {
  const project = db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get()
  if (!project) throw new Error('Project not found')

  const scene = db
    .select()
    .from(projectScenes)
    .where(eq(projectScenes.id, projectSceneId))
    .get()
  if (!scene) throw new Error('Project scene not found')

  const scenePlaceholders: Record<string, string> = JSON.parse(
    scene.placeholders || '{}',
  )

  // Load bundle map for @{...} resolution
  const bundleMap = loadBundleMap()
  const usedBundleIds = new Set<number>()

  // 1) Resolve @{bundle:...} first, then @{slot:...}
  const generalPrompt = resolvePlaceholders(
    resolveBundlesWithTracking(
      project.generalPrompt || '',
      bundleMap,
      usedBundleIds,
    ),
    scenePlaceholders,
  )

  const negativePrompt = resolvePlaceholders(
    resolveBundlesWithTracking(
      project.negativePrompt || '',
      bundleMap,
      usedBundleIds,
    ),
    scenePlaceholders,
  )

  // Resolve character prompts
  const chars = db
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId))
    .orderBy(characters.slotIndex)
    .all()

  const charOverridesData = db
    .select()
    .from(characterSceneOverrides)
    .where(eq(characterSceneOverrides.projectSceneId, projectSceneId))
    .all()

  const overrideMap = new Map(
    charOverridesData.map((o) => [
      o.characterId,
      JSON.parse(o.placeholders || '{}') as Record<string, string>,
    ]),
  )
  const overrideRowMap = new Map(
    charOverridesData.map((o) => [o.characterId, o]),
  )

  // Character parts library (global + this project's project-only rows)
  const library = loadLibraryData(projectId)
  const sceneAxisValues = parseAxisValues(scene.axisValues)
  const positionOverrideMap = new Map(
    charOverridesData.map((o) => [
      o.characterId,
      parsePositionSpec(o.position, true),
    ]),
  )

  const characterPrompts = chars.map((char) => {
    const charOverrides = overrideMap.get(char.id) || {}
    // General values as base, non-empty character overrides take priority
    const nonEmptyOverrides = Object.fromEntries(
      Object.entries(charOverrides).filter(([_, v]) => v !== ''),
    )
    const mergedPlaceholders = { ...scenePlaceholders, ...nonEmptyOverrides }
    // Compose library character / outfit fragments into the slot prompt
    const overrideRow = overrideRowMap.get(char.id)
    const libChar =
      char.libraryCharacterId != null
        ? (library.characters.find((c) => c.id === char.libraryCharacterId) ??
          null)
        : null
    // No library character and an empty default outfit: parts are off for
    // this slot entirely (scene overrides included)
    const defaultOutfit = parseOutfitEntries(char.outfitItemIds)
    const partsActive =
      char.libraryCharacterId != null || defaultOutfit.length > 0
    const outfitEntries = !partsActive
      ? []
      : overrideRow?.outfitItemIds != null
        ? parseOutfitEntries(overrideRow.outfitItemIds)
        : defaultOutfit
    const outfit = outfitEntries.flatMap((e) => {
      const item = library.items.find((i) => i.id === e.id)
      return item
        ? [
            {
              ...item,
              varValues: resolveVarValues(item.variables, e.vars),
            },
          ]
        : []
    })
    const axes = relevantAxes(
      library.axes,
      libChar?.id ?? null,
      outfit.map((i) => i.id),
    )
    const values = effectiveAxisValues(axes, [
      parseAxisValues(char.axisValues),
      sceneAxisValues,
      parseAxisValues(overrideRow?.axisValues),
    ])
    const parts = composeParts({
      axes,
      character: libChar,
      items: outfit,
      values,
      areas: library.areas,
    })
    const composedPrompt = applyParts(char.charPrompt, parts)

    return {
      characterId: char.id,
      name: char.name,
      prompt: resolvePlaceholders(
        resolveBundlesWithTracking(composedPrompt, bundleMap, usedBundleIds),
        mergedPlaceholders,
      ),
      negative: resolvePlaceholders(
        resolveBundlesWithTracking(char.charNegative, bundleMap, usedBundleIds),
        mergedPlaceholders,
      ),
      position: applyOverride(
        parsePositionSpec(char.position),
        positionOverrideMap.get(char.id),
      ),
      ...(partsActive && {
        axisValues: values,
        hiddenItems: parts.hidden,
        partialItems: parts.partial,
        emptyItemIds: parts.emptyItemIds,
        ...(libChar && !parts.char && { charEmpty: true }),
        outfitEntries: outfitEntries.filter((e) =>
          library.items.some((i) => i.id === e.id),
        ),
        ...(libChar && { libraryCharacterId: libChar.id }),
        outfitItemIds: parts.contributingItemIds,
      }),
    }
  })

  log.debug('synthesize', 'Prompts synthesized', {
    projectId,
    sceneId: projectSceneId,
    characterCount: chars.length,
    placeholderCount: Object.keys(scenePlaceholders).length,
    bundleCount: usedBundleIds.size,
  })

  return {
    generalPrompt,
    negativePrompt,
    characterPrompts,
    usedBundleIds: [...usedBundleIds],
  }
}

/** Resolve bundles in raw prompts (for Quick Generate) */
export function resolveBundlesInRawPrompts(
  prompts: ResolvedPrompts,
): ResolvedPrompts {
  const bundleMap = loadBundleMap()
  const usedBundleIds = new Set<number>()

  const generalPrompt = resolveBundlesWithTracking(
    prompts.generalPrompt,
    bundleMap,
    usedBundleIds,
  )
  const negativePrompt = resolveBundlesWithTracking(
    prompts.negativePrompt,
    bundleMap,
    usedBundleIds,
  )
  const characterPrompts = prompts.characterPrompts.map((c) => ({
    ...c,
    prompt: resolveBundlesWithTracking(c.prompt, bundleMap, usedBundleIds),
    negative: resolveBundlesWithTracking(c.negative, bundleMap, usedBundleIds),
  }))

  return {
    generalPrompt,
    negativePrompt,
    characterPrompts,
    usedBundleIds: [...usedBundleIds],
  }
}
