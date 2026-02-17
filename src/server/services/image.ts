import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createLogger } from './logger'

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

  return { filePath, thumbnailPath }
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
