import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { generatedImages, projects, projectScenes } from '../db/schema'
import { eq, and, sql, desc, inArray } from 'drizzle-orm'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { zipSync } from 'fflate'
import { randomUUID } from 'node:crypto'
import { createLogger } from '../services/logger'
import { resolveFilenameTemplate, DEFAULT_FILENAME_TEMPLATE } from '../services/download'
import type { FilenameVars } from '../services/download'

const log = createLogger('fn.download')

const DOWNLOADS_DIR = resolve('./data/downloads')
const AUTO_DELETE_MS = 5 * 60 * 1000 // 5 minutes

export const prepareDownload = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId?: number
      projectSceneIds?: number[]
      isFavorite?: boolean
      minRating?: number
      minWinRate?: number
      filenameTemplate?: string
      imageIds?: number[]
      tagIds?: number[]
    }) => data,
  )
  .handler(async ({ data }) => {
    const template = data.filenameTemplate || DEFAULT_FILENAME_TEMPLATE

    // Build query conditions
    const conditions = []
    if (data.imageIds && data.imageIds.length > 0) {
      conditions.push(inArray(generatedImages.id, data.imageIds))
    } else {
      if (data.projectId) conditions.push(eq(generatedImages.projectId, data.projectId))
      if (data.projectSceneIds && data.projectSceneIds.length > 0) {
        conditions.push(inArray(generatedImages.projectSceneId, data.projectSceneIds))
      }
      if (data.isFavorite) conditions.push(eq(generatedImages.isFavorite, 1))
      if (data.minRating) conditions.push(sql`${generatedImages.rating} >= ${data.minRating}`)
      if (data.minWinRate) {
        conditions.push(
          sql`CASE WHEN (${generatedImages.tournamentWins} + ${generatedImages.tournamentLosses}) > 0
              THEN CAST(${generatedImages.tournamentWins} AS REAL) / (${generatedImages.tournamentWins} + ${generatedImages.tournamentLosses}) * 100
              ELSE 0 END >= ${data.minWinRate}`,
        )
      }
      if (data.tagIds && data.tagIds.length > 0) {
        conditions.push(
          sql`${generatedImages.id} IN (SELECT image_id FROM image_tags WHERE tag_id IN (${sql.join(data.tagIds.map(id => sql`${id}`), sql`, `)}))`,
        )
      }
    }

    let query = db
      .select()
      .from(generatedImages)
      .orderBy(desc(generatedImages.createdAt))

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query
    }

    const images = query.all()

    if (images.length === 0) {
      return { downloadId: null, imageCount: 0, sizeBytes: 0 }
    }

    // Lookup project names
    const projectIds = [...new Set(images.map((img) => img.projectId))]
    const projectMap = new Map<number, string>()
    for (const pid of projectIds) {
      const proj = db.select({ name: projects.name }).from(projects).where(eq(projects.id, pid)).get()
      if (proj) projectMap.set(pid, proj.name)
    }

    // Lookup scene names
    const sceneIds = [...new Set(images.map((img) => img.projectSceneId))]
    const sceneMap = new Map<number, string>()
    for (const sid of sceneIds) {
      const scene = db.select({ name: projectScenes.name }).from(projectScenes).where(eq(projectScenes.id, sid)).get()
      if (scene) sceneMap.set(sid, scene.name)
    }

    // Build ZIP
    const files: Record<string, Uint8Array> = {}
    const usedNames = new Map<string, number>()

    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      const filePath = resolve(img.filePath)
      if (!existsSync(filePath)) {
        log.warn('prepareDownload', 'File not found, skipping', { filePath })
        continue
      }

      const totalMatches = (img.tournamentWins ?? 0) + (img.tournamentLosses ?? 0)
      const winRate = totalMatches > 0
        ? ((img.tournamentWins ?? 0) / totalMatches * 100).toFixed(1)
        : '0.0'

      const vars: FilenameVars = {
        project_name: projectMap.get(img.projectId) ?? 'unknown',
        scene_name: sceneMap.get(img.projectSceneId) ?? 'unknown',
        seed: img.seed,
        index: i + 1,
        date: img.createdAt ? img.createdAt.split('T')[0] ?? img.createdAt.split(' ')[0] : '',
        rating: img.rating,
        id: img.id,
        wins: img.tournamentWins ?? 0,
        win_rate: winRate,
      }

      let baseName = resolveFilenameTemplate(template, vars)

      // Handle duplicate filenames
      const count = usedNames.get(baseName) ?? 0
      if (count > 0) {
        baseName = `${baseName}_${count}`
      }
      usedNames.set(baseName, count + 1)

      const fileData = readFileSync(filePath)
      files[`${baseName}.png`] = new Uint8Array(fileData)
    }

    if (Object.keys(files).length === 0) {
      return { downloadId: null, imageCount: 0, sizeBytes: 0 }
    }

    // Create ZIP (level 0 = store, no compression since PNGs are already compressed)
    const zipped = zipSync(files, { level: 0 })

    // Ensure downloads directory exists
    mkdirSync(DOWNLOADS_DIR, { recursive: true })

    const downloadId = randomUUID()
    const zipPath = resolve(DOWNLOADS_DIR, `${downloadId}.zip`)
    writeFileSync(zipPath, zipped)

    log.info('prepareDownload', 'ZIP created', {
      downloadId,
      imageCount: Object.keys(files).length,
      sizeBytes: zipped.byteLength,
    })

    // Auto-delete after 5 minutes
    setTimeout(() => {
      try {
        if (existsSync(zipPath)) {
          unlinkSync(zipPath)
          log.info('prepareDownload', 'Auto-deleted ZIP', { downloadId })
        }
      } catch {
        // ignore
      }
    }, AUTO_DELETE_MS)

    return {
      downloadId,
      imageCount: Object.keys(files).length,
      sizeBytes: zipped.byteLength,
    }
  })
