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
import type { BundleDef, ParsedBundleRef, WildcardEntry } from '@/lib/wildcard'
import type { StyleSlot } from '@/lib/style-bundles'
import {
  appendStyleNegative,
  firstStyleIn,
  parseStyleParams,
  toStyleInfo,
} from '@/lib/style-bundles'
import { extractPlaceholders, resolvePlaceholders } from '@/lib/placeholder'
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
import {
  effectiveMode,
  normalizeKind,
  normalizeMode,
  parseWildcardOptions,
  previewWildcardPrompts,
  replaceBundleRefs,
  wildcardMarker,
} from '@/lib/wildcard'
import { effectivePresence } from '@/lib/scene-characters'

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
  /**
   * Wildcard bundle occurrences. The prompt strings hold `@{wc:N}` markers;
   * the generation loop picks one option per image (see `@/lib/wildcard`).
   */
  wildcards?: Array<WildcardEntry>
  /**
   * Style bundles in the general prompt, in text order. The generation loop
   * picks the image's style from these (see `@/lib/style-bundles`).
   */
  styleSlots?: Array<StyleSlot>
}

/** Prompts with wildcard markers shown as `{a | b | c}` (previews, queue view) */
export function previewResolvedPrompts<T extends ResolvedPrompts>(
  prompts: T,
): T {
  const shown = previewWildcardPrompts(prompts)
  // A static style's negative is appended to the final negative
  const first = prompts.styleSlots?.[0]
  if (first?.kind !== 'static') return shown
  return {
    ...shown,
    negativePrompt: appendStyleNegative(shown.negativePrompt, first.style),
  }
}

/** Load all bundles as name→definition map */
function loadBundleMap(): Map<string, BundleDef> {
  const rows = db
    .select({
      id: promptBundles.id,
      name: promptBundles.name,
      content: promptBundles.content,
      kind: promptBundles.kind,
      wildcardMode: promptBundles.wildcardMode,
      negative: promptBundles.negative,
      styleParams: promptBundles.styleParams,
    })
    .from(promptBundles)
    .all()
  return new Map(
    rows.map((r) => [
      r.name,
      {
        id: r.id,
        name: r.name,
        content: r.content,
        kind: normalizeKind(r.kind),
        wildcardMode: normalizeMode(r.wildcardMode),
        negative: r.negative,
        styleParams: parseStyleParams(r.styleParams),
      },
    ]),
  )
}

/**
 * Bundle resolution state for one synthesis: tracks used bundle ids and
 * collects wildcard entries. Text bundles are inlined (single pass, as always);
 * a wildcard becomes a `@{wc:N}` marker whose options are resolved here
 * (text bundles inlined, slots filled, nested wildcards dropped).
 */
class BundleResolver {
  readonly usedIds = new Set<number>()
  readonly wildcards: Array<WildcardEntry> = []
  readonly styleSlots: Array<StyleSlot> = []

  constructor(private readonly bundleMap: Map<string, BundleDef>) {}

  private lookup = (name: string) => this.bundleMap.get(name)

  private addWildcard(
    ref: ParsedBundleRef,
    placeholders?: Record<string, string>,
    captureStyle = false,
  ): string {
    const { bundle } = ref
    this.usedIds.add(bundle.id)
    const before = new Set(this.usedIds)
    const all = parseWildcardOptions(bundle.content)
    const rawOptions = ref.fixed ? [all[ref.fixed.index]] : all
    const options = rawOptions.map((o) => this.resolve(o, placeholders, false))
    // The first style bundle in an option line is that option's style
    const optionStyles = rawOptions.map((o) => firstStyleIn(o, this.lookup))
    // Option bundles are not linked to images (only the wildcard bundle is)
    for (const used of [...this.usedIds]) {
      if (!before.has(used)) this.usedIds.delete(used)
    }
    const id = this.wildcards.length
    if (captureStyle && optionStyles.some((s) => s)) {
      this.styleSlots.push({ kind: 'wildcard', wildcardId: id })
    }
    this.wildcards.push({
      id,
      bundleId: bundle.id,
      bundle: bundle.name,
      mode: effectiveMode(ref),
      options,
      ...(ref.fixed && { fixedIndex: ref.fixed.index }),
      ...(optionStyles.some((s) => s) && { optionStyles }),
    })
    return wildcardMarker(id)
  }

  /**
   * Resolve bundles, then (when given) `@{slot:...}` placeholders. Wildcard
   * choice comes first so options can still hold slots. Slot values may hold
   * wildcard refs too (their text-bundle refs stay literal, as before; style
   * refs are inlined). `captureStyle` records style bundles (static and
   * wildcard) in text order — only for the general prompt.
   */
  resolve(
    template: string,
    placeholders?: Record<string, string>,
    allowWildcard = true,
    captureStyle = false,
  ): string {
    const body = replaceBundleRefs(template, this.lookup, (ref) => {
      if (ref.bundle.kind !== 'wildcard') {
        this.usedIds.add(ref.bundle.id)
        if (captureStyle && ref.bundle.kind === 'style') {
          this.styleSlots.push({
            kind: 'static',
            style: toStyleInfo(ref.bundle),
          })
        }
        return ref.bundle.content
      }
      return allowWildcard
        ? this.addWildcard(ref, placeholders, captureStyle)
        : ''
    })
    if (!placeholders) return body
    if (!allowWildcard) return resolvePlaceholders(body, placeholders)
    const values: Record<string, string> = { ...placeholders }
    for (const key of extractPlaceholders(body)) {
      const v = values[key]
      if (v?.includes('@{bundle:')) {
        values[key] = replaceBundleRefs(
          v,
          this.lookup,
          (ref) => {
            if (ref.bundle.kind === 'wildcard') {
              return this.addWildcard(ref, placeholders, captureStyle)
            }
            if (ref.bundle.kind === 'style') {
              this.usedIds.add(ref.bundle.id)
              if (captureStyle) {
                this.styleSlots.push({
                  kind: 'static',
                  style: toStyleInfo(ref.bundle),
                })
              }
              return ref.bundle.content
            }
            return ref.match ?? ''
          },
          (m) => m,
        )
      }
    }
    return resolvePlaceholders(body, values)
  }

  record(): Pick<
    ResolvedPrompts,
    'usedBundleIds' | 'wildcards' | 'styleSlots'
  > {
    return {
      usedBundleIds: [...this.usedIds],
      ...(this.wildcards.length > 0 && { wildcards: this.wildcards }),
      ...(this.styleSlots.length > 0 && { styleSlots: this.styleSlots }),
    }
  }
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
  const resolver = new BundleResolver(loadBundleMap())

  // 1) Resolve @{bundle:...} first, then @{slot:...}
  const generalPrompt = resolver.resolve(
    project.generalPrompt || '',
    scenePlaceholders,
    true,
    true,
  )

  const negativePrompt = resolver.resolve(
    project.negativePrompt || '',
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

  // Scene cast: characters that are Off in this scene are omitted entirely
  const presenceOf = (char: (typeof chars)[number]) =>
    effectivePresence(char.appearance, overrideRowMap.get(char.id)?.presence)
  const presentChars = chars.filter((c) => presenceOf(c) !== 'off')

  const characterPrompts = presentChars.map((char) => {
    const charOverrides = overrideMap.get(char.id) || {}
    // General values as base, non-empty character overrides take priority
    const nonEmptyOverrides = Object.fromEntries(
      Object.entries(charOverrides).filter(([_, v]) => v !== ''),
    )
    const mergedPlaceholders = { ...scenePlaceholders, ...nonEmptyOverrides }
    // Compose library character / outfit fragments into the slot prompt
    const overrideRow = overrideRowMap.get(char.id)
    if (presenceOf(char) === 'replace') {
      // Replace: scene-only prompt instead of char prompt/negative and parts
      return {
        characterId: char.id,
        name: char.name,
        prompt: resolver.resolve(
          overrideRow?.replacePrompt ?? '',
          mergedPlaceholders,
        ),
        negative: resolver.resolve(
          overrideRow?.replaceNegative ?? '',
          mergedPlaceholders,
        ),
        position: applyOverride(
          parsePositionSpec(char.position),
          positionOverrideMap.get(char.id),
        ),
      }
    }
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
      prompt: resolver.resolve(composedPrompt, mergedPlaceholders),
      negative: resolver.resolve(char.charNegative, mergedPlaceholders),
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
    characterCount: presentChars.length,
    placeholderCount: Object.keys(scenePlaceholders).length,
    bundleCount: resolver.usedIds.size,
  })

  return {
    generalPrompt,
    negativePrompt,
    characterPrompts,
    ...resolver.record(),
  }
}

/** Resolve bundles in raw prompts (for Quick Generate) */
export function resolveBundlesInRawPrompts(
  prompts: ResolvedPrompts,
): ResolvedPrompts {
  const resolver = new BundleResolver(loadBundleMap())

  const generalPrompt = resolver.resolve(
    prompts.generalPrompt,
    undefined,
    true,
    true,
  )
  const negativePrompt = resolver.resolve(prompts.negativePrompt)
  const characterPrompts = prompts.characterPrompts.map((c) => ({
    ...c,
    prompt: resolver.resolve(c.prompt),
    negative: resolver.resolve(c.negative),
  }))

  return {
    generalPrompt,
    negativePrompt,
    characterPrompts,
    ...resolver.record(),
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
