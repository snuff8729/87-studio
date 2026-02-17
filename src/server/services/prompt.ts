import { db } from '../db'
import {
  projects,
  characters,
  projectScenes,
  characterSceneOverrides,
} from '../db/schema'
import { eq } from 'drizzle-orm'
import { resolvePlaceholders } from '@/lib/placeholder'
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

  // Resolve general prompt
  const generalPrompt = resolvePlaceholders(
    project.generalPrompt || '',
    scenePlaceholders,
  )

  const negativePrompt = resolvePlaceholders(
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
      prompt: resolvePlaceholders(char.charPrompt, mergedPlaceholders),
      negative: resolvePlaceholders(char.charNegative, mergedPlaceholders),
    }
  })

  log.info('synthesize', 'Prompts synthesized', {
    projectId,
    sceneId: projectSceneId,
    characterCount: chars.length,
    placeholderCount: Object.keys(scenePlaceholders).length,
  })

  return { generalPrompt, negativePrompt, characterPrompts }
}
