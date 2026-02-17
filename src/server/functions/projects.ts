import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { projects, projectScenePacks, projectScenes, scenes, scenePacks, generatedImages } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { createLogger } from '../services/logger'

const log = createLogger('fn.projects')

export const listProjects = createServerFn({ method: 'GET' }).handler(async () => {
  const rows = db.select().from(projects).orderBy(desc(projects.createdAt)).all()

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

    return { ...project, thumbnailPath }
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
    log.info('delete', 'Project deleted', { projectId: id })
    db.delete(projects).where(eq(projects.id, id)).run()
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

export const removeProjectScenePack = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    log.info('removeScenePack', 'Project scene pack removed', { projectScenePackId: id })
    db.delete(projectScenePacks).where(eq(projectScenePacks.id, id)).run()
    return { success: true }
  })
