import sharp from 'sharp'
import { mkdirSync, writeFileSync, unlinkSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createLogger } from './logger'

/** Normalize path separators to forward slashes (for consistent DB storage across OS) */
function normalizePath(p: string): string {
  return p.replaceAll('\\', '/')
}

const log = createLogger('image')
const IMAGES_DIR = './data/images'
const THUMBNAILS_DIR = './data/thumbnails'

export function saveImage(
  projectId: number,
  jobId: number,
  seed: number,
  imageData: Uint8Array,
): { filePath: string; thumbnailPath: string } {
  const timestamp = Date.now()
  const filename = `${jobId}_${seed}_${timestamp}.png`

  const filePath = join(IMAGES_DIR, String(projectId), filename)
  const thumbnailPath = join(THUMBNAILS_DIR, String(projectId), filename)

  mkdirSync(dirname(filePath), { recursive: true })
  mkdirSync(dirname(thumbnailPath), { recursive: true })

  writeFileSync(filePath, imageData)

  log.info('save', 'Image saved', { filePath, sizeBytes: imageData.byteLength })

  return { filePath: normalizePath(filePath), thumbnailPath: normalizePath(thumbnailPath) }
}

export async function generateThumbnail(
  sourcePath: string,
  thumbnailPath: string,
): Promise<void> {
  try {
    await sharp(sourcePath)
      .resize({ width: 300, height: 300, fit: 'inside', withoutEnlargement: true })
      .png()
      .toFile(thumbnailPath)
    log.info('thumbnail', 'Thumbnail generated', { thumbnailPath })
  } catch (error) {
    log.error('thumbnail.failed', 'Thumbnail generation failed', { sourcePath, thumbnailPath }, error)
    throw error
  }
}

/** Delete a single file, logging errors but not throwing */
function safeUnlink(filePath: string): boolean {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
      return true
    }
  } catch (error) {
    log.error('delete.failed', 'Failed to delete file', { filePath }, error)
  }
  return false
}

/** Delete image and thumbnail files for a list of images */
export function deleteImageFiles(
  images: Array<{ filePath: string; thumbnailPath: string | null }>,
): { deleted: number; failed: number } {
  let deleted = 0
  let failed = 0

  for (const img of images) {
    if (safeUnlink(img.filePath)) deleted++
    else failed++

    if (img.thumbnailPath) {
      safeUnlink(img.thumbnailPath)
    }
  }

  if (images.length > 0) {
    log.info('deleteFiles', 'Image files deleted', { total: images.length, deleted, failed })
  }

  // Clean up empty project directories
  const projectDirs = new Set<string>()
  for (const img of images) {
    projectDirs.add(dirname(img.filePath))
    if (img.thumbnailPath) projectDirs.add(dirname(img.thumbnailPath))
  }
  for (const dir of projectDirs) {
    try {
      if (existsSync(dir) && readdirSync(dir).length === 0) {
        rmSync(dir, { recursive: true })
      }
    } catch { /* ignore */ }
  }

  return { deleted, failed }
}

/** Get all image/thumbnail file paths from the data directories */
export function getAllStoredFiles(): { images: string[]; thumbnails: string[] } {
  const images: string[] = []
  const thumbnails: string[] = []

  for (const [baseDir, list] of [[IMAGES_DIR, images], [THUMBNAILS_DIR, thumbnails]] as const) {
    if (!existsSync(baseDir)) continue
    for (const projectDir of readdirSync(baseDir)) {
      const projectPath = join(baseDir, projectDir)
      try {
        if (!statSync(projectPath).isDirectory()) continue
        for (const file of readdirSync(projectPath)) {
          list.push(normalizePath(join(baseDir, projectDir, file)))
        }
      } catch { /* ignore */ }
    }
  }

  return { images, thumbnails }
}

/** Get total size of files in bytes */
export function getFileSize(filePath: string): number {
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}
