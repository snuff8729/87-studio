import { db } from '../db'
import {
  projects,
  characters,
  projectScenes,
  characterSceneOverrides,
} from '../db/schema'
import { eq } from 'drizzle-orm'
import { resolvePlaceholders } from '@/lib/placeholder'

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
    const charPlaceholders = overrideMap.get(char.id) || {}
    return {
      characterId: char.id,
      name: char.name,
      prompt: resolvePlaceholders(char.charPrompt, charPlaceholders),
      negative: resolvePlaceholders(char.charNegative, charPlaceholders),
    }
  })

  return { generalPrompt, negativePrompt, characterPrompts }
}
