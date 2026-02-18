import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { projects, projectScenePacks, projectScenes, scenes, scenePacks, generatedImages, characters, characterSceneOverrides } from '../db/schema'
import { eq, desc, inArray, count, max } from 'drizzle-orm'
import { createLogger } from '../services/logger'
import { deleteImageFiles } from '../services/image'

const log = createLogger('fn.projects')

export const listProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = db.select().from(projects).orderBy(desc(projects.createdAt)).all()

  // Batch: image count + last activity per project
  const stats = db
    .select({
      projectId: generatedImages.projectId,
      imageCount: count(generatedImages.id),
      lastActivityAt: max(generatedImages.createdAt),
    })
    .from(generatedImages)
    .groupBy(generatedImages.projectId)
    .all()

  const statsMap = new Map(stats.map((s) => [s.projectId, s]))

  return rows.map((project) => {
    let thumbnailPath: string | null = null

    // Explicit thumbnail pick
    if (project.thumbnailImageId) {
      const picked = db
        .select({ thumbnailPath: generatedImages.thumbnailPath })
        .from(generatedImages)
        .where(eq(generatedImages.id, project.thumbnailImageId))
        .get()
      thumbnailPath = picked?.thumbnailPath ?? null
    }

    // Fallback: most recent image in project
    if (!thumbnailPath) {
      const latest = db
        .select({ thumbnailPath: generatedImages.thumbnailPath })
        .from(generatedImages)
        .where(eq(generatedImages.projectId, project.id))
        .orderBy(desc(generatedImages.createdAt))
        .limit(1)
        .get()
      thumbnailPath = latest?.thumbnailPath ?? null
    }

    const s = statsMap.get(project.id)

    return {
      ...project,
      thumbnailPath,
      imageCount: s?.imageCount ?? 0,
      lastActivityAt: s?.lastActivityAt ?? null,
    }
  })
})

export const getProject = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const project = db.select().from(projects).where(eq(projects.id, id)).get()
    if (!project) throw new Error('Project not found')
    return project
  })

export const createProject = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; description?: string }) => data)
  .handler(async ({ data }) => {
    const result = db
      .insert(projects)
      .values({ name: data.name, description: data.description })
      .returning()
      .get()
    log.info('create', 'Project created', { projectId: result.id, name: data.name })
    return result
  })

export const updateProject = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number
      name?: string
      description?: string
      generalPrompt?: string
      negativePrompt?: string
      parameters?: string
      thumbnailImageId?: number | null
    }) => data,
  )
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    db.update(projects)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, id))
      .run()
    return { success: true }
  })

export const deleteProject = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    // Collect file paths before cascade delete
    const files = db
      .select({ filePath: generatedImages.filePath, thumbnailPath: generatedImages.thumbnailPath })
      .from(generatedImages)
      .where(eq(generatedImages.projectId, id))
      .all()
    log.info('delete', 'Project deleted', { projectId: id, imageFiles: files.length })
    db.delete(projects).where(eq(projects.id, id)).run()
    deleteImageFiles(files)
    return { success: true }
  })

export const assignScenePack = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: number; scenePackId: number }) => data)
  .handler(async ({ data }) => {
    const pack = db
      .select()
      .from(scenePacks)
      .where(eq(scenePacks.id, data.scenePackId))
      .get()
    if (!pack) throw new Error('Scene pack not found')

    const packScenes = db
      .select()
      .from(scenes)
      .where(eq(scenes.scenePackId, data.scenePackId))
      .orderBy(scenes.sortOrder)
      .all()

    // Create project scene pack (snapshot)
    const psp = db
      .insert(projectScenePacks)
      .values({
        projectId: data.projectId,
        scenePackId: data.scenePackId,
        name: pack.name,
      })
      .returning()
      .get()

    // Copy each scene
    for (const scene of packScenes) {
      db.insert(projectScenes)
        .values({
          projectScenePackId: psp.id,
          sourceSceneId: scene.id,
          name: scene.name,
          placeholders: scene.placeholders,
          sortOrder: scene.sortOrder,
        })
        .run()
    }

    log.info('assignScenePack', 'Scene pack assigned to project', {
      projectId: data.projectId,
      scenePackId: data.scenePackId,
      projectScenePackId: psp.id,
      sceneCount: packScenes.length,
    })

    return psp
  })

export const duplicateProject = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const source = db.select().from(projects).where(eq(projects.id, id)).get()
    if (!source) throw new Error('Project not found')

    // 1. Create new project
    const newProject = db
      .insert(projects)
      .values({
        name: `${source.name} (Copy)`,
        description: source.description,
        generalPrompt: source.generalPrompt,
        negativePrompt: source.negativePrompt,
        parameters: source.parameters,
        thumbnailImageId: null,
      })
      .returning()
      .get()

    // 2. Copy characters (old id → new id mapping for overrides)
    const sourceChars = db
      .select()
      .from(characters)
      .where(eq(characters.projectId, id))
      .all()

    const charIdMap = new Map<number, number>()
    for (const ch of sourceChars) {
      const newChar = db
        .insert(characters)
        .values({
          projectId: newProject.id,
          slotIndex: ch.slotIndex,
          name: ch.name,
          charPrompt: ch.charPrompt,
          charNegative: ch.charNegative,
        })
        .returning()
        .get()
      charIdMap.set(ch.id, newChar.id)
    }

    // 3. Copy project scene packs + scenes + character overrides
    const sourcePacks = db
      .select()
      .from(projectScenePacks)
      .where(eq(projectScenePacks.projectId, id))
      .all()

    for (const pack of sourcePacks) {
      const newPack = db
        .insert(projectScenePacks)
        .values({
          projectId: newProject.id,
          scenePackId: pack.scenePackId,
          name: pack.name,
        })
        .returning()
        .get()

      const sourceSceneRows = db
        .select()
        .from(projectScenes)
        .where(eq(projectScenes.projectScenePackId, pack.id))
        .all()

      for (const scene of sourceSceneRows) {
        const newScene = db
          .insert(projectScenes)
          .values({
            projectScenePackId: newPack.id,
            sourceSceneId: scene.sourceSceneId,
            name: scene.name,
            placeholders: scene.placeholders,
            thumbnailImageId: null,
            sortOrder: scene.sortOrder,
          })
          .returning()
          .get()

        // Copy character scene overrides
        const overrides = db
          .select()
          .from(characterSceneOverrides)
          .where(eq(characterSceneOverrides.projectSceneId, scene.id))
          .all()

        for (const ovr of overrides) {
          const newCharId = charIdMap.get(ovr.characterId)
          if (newCharId) {
            db.insert(characterSceneOverrides)
              .values({
                projectSceneId: newScene.id,
                characterId: newCharId,
                placeholders: ovr.placeholders,
              })
              .run()
          }
        }
      }
    }

    log.info('duplicate', 'Project duplicated', {
      sourceId: id,
      newProjectId: newProject.id,
      characters: sourceChars.length,
      scenePacks: sourcePacks.length,
    })

    return newProject
  })

export const removeProjectScenePack = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    // Collect image files for scenes in this pack before cascade delete
    const sceneIds = db
      .select({ id: projectScenes.id })
      .from(projectScenes)
      .where(eq(projectScenes.projectScenePackId, id))
      .all()
      .map((s) => s.id)
    let files: Array<{ filePath: string; thumbnailPath: string | null }> = []
    if (sceneIds.length > 0) {
      files = db
        .select({ filePath: generatedImages.filePath, thumbnailPath: generatedImages.thumbnailPath })
        .from(generatedImages)
        .where(inArray(generatedImages.projectSceneId, sceneIds))
        .all()
    }
    log.info('removeScenePack', 'Project scene pack removed', { projectScenePackId: id, imageFiles: files.length })
    db.delete(projectScenePacks).where(eq(projectScenePacks.id, id)).run()
    deleteImageFiles(files)
    return { success: true }
  })
