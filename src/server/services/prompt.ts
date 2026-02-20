import { db } from '../db'
import {
  projects,
  characters,
  projectScenes,
  characterSceneOverrides,
  promptBundles,
} from '../db/schema'
import { eq } from 'drizzle-orm'
import { resolvePlaceholders } from '@/lib/placeholder'
import { resolveBundles, extractBundleReferences } from '@/lib/bundle'
import { createLogger } from './logger'

const log = createLogger('prompt')

export interface ResolvedPrompts {
  generalPrompt: string
  negativePrompt: string
  characterPrompts: Array<{
    characterId: number
    name: string
    prompt: string
    negative: string
  }>
  usedBundleIds?: number[]
}

/** Load all bundles as name→{id, content} map */
function loadBundleMap(): Map<string, { id: number; content: string }> {
  const rows = db
    .select({ id: promptBundles.id, name: promptBundles.name, content: promptBundles.content })
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

  // 1) Resolve @{bundles} first, then \\placeholders\\
  const generalPrompt = resolvePlaceholders(
    resolveBundlesWithTracking(project.generalPrompt || '', bundleMap, usedBundleIds),
    scenePlaceholders,
  )

  const negativePrompt = resolvePlaceholders(
    resolveBundlesWithTracking(project.negativePrompt || '', bundleMap, usedBundleIds),
    scenePlaceholders,
  )

  // Resolve character prompts
  const chars = db
    .select()
    .from(characters)
    .where(eq(characters.projectId, projectId))
    .orderBy(characters.slotIndex)
    .all()

  const charOverrides = db
    .select()
    .from(characterSceneOverrides)
    .where(eq(characterSceneOverrides.projectSceneId, projectSceneId))
    .all()

  const overrideMap = new Map(
    charOverrides.map((o) => [
      o.characterId,
      JSON.parse(o.placeholders || '{}') as Record<string, string>,
    ]),
  )

  const characterPrompts = chars.map((char) => {
    const charOverrides = overrideMap.get(char.id) || {}
    // General values as base, non-empty character overrides take priority
    const nonEmptyOverrides = Object.fromEntries(
      Object.entries(charOverrides).filter(([_, v]) => v !== ''),
    )
    const mergedPlaceholders = { ...scenePlaceholders, ...nonEmptyOverrides }
    return {
      characterId: char.id,
      name: char.name,
      prompt: resolvePlaceholders(
        resolveBundlesWithTracking(char.charPrompt, bundleMap, usedBundleIds),
        mergedPlaceholders,
      ),
      negative: resolvePlaceholders(
        resolveBundlesWithTracking(char.charNegative, bundleMap, usedBundleIds),
        mergedPlaceholders,
      ),
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
export function resolveBundlesInRawPrompts(prompts: ResolvedPrompts): ResolvedPrompts {
  const bundleMap = loadBundleMap()
  const usedBundleIds = new Set<number>()

  const generalPrompt = resolveBundlesWithTracking(prompts.generalPrompt, bundleMap, usedBundleIds)
  const negativePrompt = resolveBundlesWithTracking(prompts.negativePrompt, bundleMap, usedBundleIds)
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
