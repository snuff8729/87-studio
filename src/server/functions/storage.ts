import { dirname } from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { existsSync, readdirSync, rmSync, unlinkSync } from '../data-fs'
import { db } from '../db'
import { generatedImages, tagBookmarkImages } from '../db/schema'
import { createLogger } from '../services/logger'
import { getAllStoredFiles, getFileSize } from '../services/image'

const log = createLogger('fn.storage')

/** Files referenced by the DB. Gallery-sourced bookmark images reuse data/images paths. */
function collectReferencedPaths(): Set<string> {
  const paths = new Set<string>()
  const add = (
    rows: Array<{ filePath: string; thumbnailPath: string | null }>,
  ) => {
    for (const r of rows) {
      paths.add(r.filePath)
      if (r.thumbnailPath) paths.add(r.thumbnailPath)
    }
  }
  add(
    db
      .select({
        filePath: generatedImages.filePath,
        thumbnailPath: generatedImages.thumbnailPath,
      })
      .from(generatedImages)
      .all(),
  )
  add(
    db
      .select({
        filePath: tagBookmarkImages.filePath,
        thumbnailPath: tagBookmarkImages.thumbnailPath,
      })
      .from(tagBookmarkImages)
      .all(),
  )
  return paths
}

export const getStorageStats = createServerFn({ method: 'GET' }).handler(
  async () => {
    // Get all file paths from DB
    const dbFilePaths = collectReferencedPaths()

    // Get all files from filesystem
    const stored = getAllStoredFiles()
    const allFiles = [...stored.images, ...stored.thumbnails]

    // Find orphans (files on disk but not in DB)
    const orphanFiles: Array<string> = []
    let orphanSize = 0
    let totalSize = 0

    for (const file of allFiles) {
      const size = getFileSize(file)
      totalSize += size
      if (!dbFilePaths.has(file)) {
        orphanFiles.push(file)
        orphanSize += size
      }
    }

    return {
      totalFiles: allFiles.length,
      totalSize,
      dbRecords: db.$count(generatedImages),
      orphanFiles: orphanFiles.length,
      orphanSize,
      imageFiles: stored.images.length,
      thumbnailFiles: stored.thumbnails.length,
    }
  },
)

export const cleanupOrphanFiles = createServerFn({ method: 'POST' }).handler(
  async () => {
    const dbFilePaths = collectReferencedPaths()

    const stored = getAllStoredFiles()
    const allFiles = [...stored.images, ...stored.thumbnails]

    let deleted = 0
    let failed = 0
    const affectedDirs = new Set<string>()

    for (const file of allFiles) {
      if (!dbFilePaths.has(file)) {
        try {
          unlinkSync(file)
          affectedDirs.add(dirname(file))
          deleted++
        } catch {
          failed++
        }
      }
    }

    // Clean up empty directories
    for (const dir of affectedDirs) {
      try {
        if (existsSync(dir) && readdirSync(dir).length === 0) {
          rmSync(dir, { recursive: true })
        }
      } catch {
        /* ignore */
      }
    }

    log.info('cleanup', 'Orphan files cleaned up', { deleted, failed })
    return { deleted, failed }
  },
)
