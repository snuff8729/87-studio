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
import {
  AI_POSITION,
  applyOverride,
  parsePositionSpec,
} from '@/lib/character-positions'
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

type Library = ReturnType<typeof loadLibraryData>

/**
 * Compose one character slot's library parts (rule 0): effective axis values,
 * occlusion and the `@{char}` / `@{outfit}` placement. `axisLayers` are merged
 * in order on top of the axis defaults (later wins). A slot without a library
 * link and with an empty default outfit has parts off entirely.
 */
export function composeSlotParts(
  library: Library,
  input: {
    charPrompt: string
    libraryCharacterId: number | null
    defaultOutfit: Array<OutfitEntry>
    /** Replaces the default outfit when set (scene override) */
    outfitOverride?: Array<OutfitEntry> | null
    axisLayers: Array<AxisValues>
  },
) {
  const libChar =
    input.libraryCharacterId != null
      ? (library.characters.find((c) => c.id === input.libraryCharacterId) ??
        null)
      : null
  const partsActive =
    input.libraryCharacterId != null || input.defaultOutfit.length > 0
  const outfitEntries = !partsActive
    ? []
    : (input.outfitOverride ?? input.defaultOutfit)
  const outfit = outfitEntries.flatMap((e) => {
    const item = library.items.find((i) => i.id === e.id)
    return item
      ? [{ ...item, varValues: resolveVarValues(item.variables, e.vars) }]
      : []
  })
  const axes = relevantAxes(
    library.axes,
    libChar?.id ?? null,
    outfit.map((i) => i.id),
  )
  const values = effectiveAxisValues(axes, input.axisLayers)
  const parts = composeParts({
    axes,
    character: libChar,
    items: outfit,
    values,
    areas: library.areas,
  })
  return {
    libChar,
    partsActive,
    outfitEntries,
    values,
    parts,
    composedPrompt: applyParts(input.charPrompt, parts),
  }
}

/** The parts fields recorded on a resolved character prompt. */
export function partsRecord(
  library: Library,
  s: ReturnType<typeof composeSlotParts>,
) {
  const { libChar, parts, outfitEntries, values } = s
  return {
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
  }
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
    const slotParts = composeSlotParts(library, {
      charPrompt: char.charPrompt,
      libraryCharacterId: char.libraryCharacterId,
      defaultOutfit: parseOutfitEntries(char.outfitItemIds),
      outfitOverride:
        overrideRow?.outfitItemIds != null
          ? parseOutfitEntries(overrideRow.outfitItemIds)
          : null,
      axisLayers: [
        parseAxisValues(char.axisValues),
        sceneAxisValues,
        parseAxisValues(overrideRow?.axisValues),
      ],
    })
    const { composedPrompt, partsActive } = slotParts

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
      ...(partsActive && partsRecord(library, slotParts)),
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

export interface QuickPromptInput {
  generalPrompt: string
  negativePrompt: string
  characters: Array<{
    name: string
    prompt: string
    negative: string
    position?: PositionSpec
    /** Linked library character (live link; a deleted one is ignored) */
    libraryCharacterId?: number | null
    /** Default outfit entries */
    outfit?: Array<OutfitEntry>
    /** Local (character/item) axis values */
    axisValues?: AxisValues
  }>
  /** Global axis values applied to every character */
  globalAxisValues?: AxisValues
}

/**
 * Quick Generate: compose library parts (global library only, no project) into
 * the character prompts, then resolve bundles. Slots are numbered -1, -2, ...
 */
export function composeQuickPrompts(input: QuickPromptInput): ResolvedPrompts {
  const library = loadLibraryData(null)
  const characterPrompts = input.characters.map((c, i) => {
    const slotParts = composeSlotParts(library, {
      charPrompt: c.prompt,
      libraryCharacterId: c.libraryCharacterId ?? null,
      defaultOutfit: c.outfit ?? [],
      axisLayers: [c.axisValues ?? {}, input.globalAxisValues ?? {}],
    })
    return {
      characterId: -(i + 1),
      name: c.name,
      prompt: slotParts.composedPrompt,
      negative: c.negative,
      position: c.position ?? AI_POSITION,
      ...(slotParts.partsActive && partsRecord(library, slotParts)),
    }
  })
  return resolveBundlesInRawPrompts({
    generalPrompt: input.generalPrompt,
    negativePrompt: input.negativePrompt,
    characterPrompts,
  })
}
