import { createServerFn } from '@tanstack/react-start'
import { count, desc, eq, inArray, max } from 'drizzle-orm'
import { db } from '../db'
import {
  characterSceneOverrides,
  characters,
  generatedImages,
  libraryCharacters,
  outfitItems,
  projectScenePacks,
  projectScenes,
  projects,
  scenePacks,
  scenes,
} from '../db/schema'
import { createLogger } from '../services/logger'
import { deleteImageFiles } from '../services/image'
import { copyOwnerContents, remapAxisValues } from '../services/parts'
import {
  parseAxisValues,
  parseCondition,
  parseIdList,
} from '@/lib/character-parts'

/** Next free pack order for a project (new packs go to the end). */
function nextPackSortOrder(projectId: number): number {
  const row = db
    .select({ max: max(projectScenePacks.sortOrder) })
    .from(projectScenePacks)
    .where(eq(projectScenePacks.projectId, projectId))
    .get()
  return (row?.max ?? -1) + 1
}

const log = createLogger('fn.projects')

export const listProjects = createServerFn({ method: 'GET' }).handler(
  async () => {
    const rows = db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt))
      .all()

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

    const sceneCounts = db
      .select({
        projectId: projectScenePacks.projectId,
        sceneCount: count(projectScenes.id),
      })
      .from(projectScenes)
      .innerJoin(
        projectScenePacks,
        eq(projectScenes.projectScenePackId, projectScenePacks.id),
      )
      .groupBy(projectScenePacks.projectId)
      .all()
    const sceneCountMap = new Map(
      sceneCounts.map((s) => [s.projectId, s.sceneCount]),
    )

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
        sceneCount: sceneCountMap.get(project.id) ?? 0,
        lastActivityAt: s?.lastActivityAt ?? null,
      }
    })
  },
)

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
    log.info('create', 'Project created', {
      projectId: result.id,
      name: data.name,
    })
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
  .inputValidator((data: { id: number; deleteFiles?: boolean }) => data)
  .handler(async ({ data: { id, deleteFiles = false } }) => {
    // Collect file paths before cascade delete
    const files = db
      .select({
        filePath: generatedImages.filePath,
        thumbnailPath: generatedImages.thumbnailPath,
      })
      .from(generatedImages)
      .where(eq(generatedImages.projectId, id))
      .all()
    log.info('delete', 'Project deleted', {
      projectId: id,
      imageFiles: files.length,
    })
    db.delete(projects).where(eq(projects.id, id)).run()
    // Kept files become orphans (cleaned up via Settings > Storage)
    if (deleteFiles) deleteImageFiles(files)
    return { success: true }
  })

export const assignScenePack = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId: number
      scenePackId: number
      /** Only copy these scenes (default: every scene of the pack) */
      sceneIds?: Array<number>
    }) => data,
  )
  .handler(async ({ data }) => {
    const pack = db
      .select()
      .from(scenePacks)
      .where(eq(scenePacks.id, data.scenePackId))
      .get()
    if (!pack) throw new Error('Scene pack not found')

    const allPackScenes = db
      .select()
      .from(scenes)
      .where(eq(scenes.scenePackId, data.scenePackId))
      .orderBy(scenes.sortOrder)
      .all()
    const wanted = data.sceneIds ? new Set(data.sceneIds) : null
    const packScenes = wanted
      ? allPackScenes.filter((s) => wanted.has(s.id))
      : allPackScenes
    if (wanted && packScenes.length === 0) throw new Error('No scenes selected')

    // Create project scene pack (snapshot)
    const psp = db
      .insert(projectScenePacks)
      .values({
        projectId: data.projectId,
        scenePackId: data.scenePackId,
        name: pack.name,
        sortOrder: nextPackSortOrder(data.projectId),
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
          axisValues: scene.axisValues,
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

    // Project-only library rows are copied with the project (ids remapped)
    const partsMaps = {
      axes: new Map<number, number>(),
      values: new Map<number, number>(),
    }
    const libCharMap = new Map<number, number>()
    const itemMap = new Map<number, number>()
    for (const lc of db
      .select()
      .from(libraryCharacters)
      .where(eq(libraryCharacters.projectId, id))
      .all()) {
      const copy = db
        .insert(libraryCharacters)
        .values({
          name: lc.name,
          description: lc.description,
          projectId: newProject.id,
          sourceId: lc.sourceId,
          thumbnailImageId: null,
          sortOrder: lc.sortOrder,
        })
        .returning()
        .get()
      const r = copyOwnerContents(
        db,
        { characterId: lc.id },
        { characterId: copy.id },
      )
      r.maps.axes.forEach((v, k) => partsMaps.axes.set(k, v))
      r.maps.values.forEach((v, k) => partsMaps.values.set(k, v))
      libCharMap.set(lc.id, copy.id)
    }
    for (const it of db
      .select()
      .from(outfitItems)
      .where(eq(outfitItems.projectId, id))
      .all()) {
      const copy = db
        .insert(outfitItems)
        .values({
          name: it.name,
          description: it.description,
          projectId: newProject.id,
          sourceId: it.sourceId,
          thumbnailImageId: null,
          conditions: '{}',
          sortOrder: it.sortOrder,
        })
        .returning()
        .get()
      const r = copyOwnerContents(
        db,
        { itemId: it.id },
        { itemId: copy.id },
        parseCondition(it.conditions),
      )
      db.update(outfitItems)
        .set({ conditions: JSON.stringify(r.itemConditions) })
        .where(eq(outfitItems.id, copy.id))
        .run()
      r.maps.axes.forEach((v, k) => partsMaps.axes.set(k, v))
      r.maps.values.forEach((v, k) => partsMaps.values.set(k, v))
      itemMap.set(it.id, copy.id)
    }
    const remapIdList = (raw: string | null) =>
      JSON.stringify(parseIdList(raw).map((i) => itemMap.get(i) ?? i))

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
          libraryCharacterId:
            ch.libraryCharacterId != null
              ? (libCharMap.get(ch.libraryCharacterId) ?? ch.libraryCharacterId)
              : null,
          outfitItemIds: remapIdList(ch.outfitItemIds),
          axisValues: JSON.stringify(
            remapAxisValues(parseAxisValues(ch.axisValues), partsMaps),
          ),
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
          sortOrder: pack.sortOrder,
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
            axisValues: scene.axisValues,
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
                axisValues: JSON.stringify(
                  remapAxisValues(parseAxisValues(ovr.axisValues), partsMaps),
                ),
                outfitItemIds: ovr.outfitItemIds
                  ? remapIdList(ovr.outfitItemIds)
                  : null,
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
  .inputValidator(
    (data: { id: number; projectId?: number; deleteFiles?: boolean }) => data,
  )
  .handler(async ({ data: { id, projectId, deleteFiles = false } }) => {
    if (projectId != null) {
      const owner = db
        .select({ projectId: projectScenePacks.projectId })
        .from(projectScenePacks)
        .where(eq(projectScenePacks.id, id))
        .get()
      if (owner?.projectId !== projectId) throw new Error('Pack not found')
    }
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
        .select({
          filePath: generatedImages.filePath,
          thumbnailPath: generatedImages.thumbnailPath,
        })
        .from(generatedImages)
        .where(inArray(generatedImages.projectSceneId, sceneIds))
        .all()
    }
    log.info('removeScenePack', 'Project scene pack removed', {
      projectScenePackId: id,
      imageFiles: files.length,
    })
    db.delete(projectScenePacks).where(eq(projectScenePacks.id, id)).run()
    if (deleteFiles) deleteImageFiles(files)
    return { success: true }
  })
