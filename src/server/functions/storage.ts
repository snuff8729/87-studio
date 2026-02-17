import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { generatedImages } from '../db/schema'
import { createLogger } from '../services/logger'
import { getAllStoredFiles, getFileSize, deleteImageFiles } from '../services/image'
import { unlinkSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

const log = createLogger('fn.storage')

export const getStorageStats = createServerFn({ method: 'GET' }).handler(async () => {
  // Get all file paths from DB
  const dbImages = db
    .select({ filePath: generatedImages.filePath, thumbnailPath: generatedImages.thumbnailPath })
    .from(generatedImages)
    .all()

  const dbFilePaths = new Set<string>()
  for (const img of dbImages) {
    dbFilePaths.add(img.filePath)
    if (img.thumbnailPath) dbFilePaths.add(img.thumbnailPath)
  }

  // Get all files from filesystem
  const stored = getAllStoredFiles()
  const allFiles = [...stored.images, ...stored.thumbnails]

  // Find orphans (files on disk but not in DB)
  const orphanFiles: string[] = []
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
    dbRecords: dbImages.length,
    orphanFiles: orphanFiles.length,
    orphanSize,
    imageFiles: stored.images.length,
    thumbnailFiles: stored.thumbnails.length,
  }
})

export const cleanupOrphanFiles = createServerFn({ method: 'POST' }).handler(async () => {
  const dbImages = db
    .select({ filePath: generatedImages.filePath, thumbnailPath: generatedImages.thumbnailPath })
    .from(generatedImages)
    .all()

  const dbFilePaths = new Set<string>()
  for (const img of dbImages) {
    dbFilePaths.add(img.filePath)
    if (img.thumbnailPath) dbFilePaths.add(img.thumbnailPath)
  }

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
    } catch { /* ignore */ }
  }

  log.info('cleanup', 'Orphan files cleaned up', { deleted, failed })
  return { deleted, failed }
})
