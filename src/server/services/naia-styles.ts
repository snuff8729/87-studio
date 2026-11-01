import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { NaiaScan, NaiaScanError, NaiaStyle } from '@/lib/naia-import'
import {
  NaiaParseError,
  parseNaiaFolders,
  parseNaiaSnapshot,
} from '@/lib/naia-import'

/** Path problems the user can fix (shown inline in the import dialog) */
export class NaiaPathError extends Error {}

export interface ScannedNaia extends NaiaScan {
  /** Absolute `image.webp` path per snapshot directory name */
  imagePaths: Map<string, string>
}

/** Tolerate pasted quotes and whitespace around the folder path */
export function cleanNaiaDir(input: string): string {
  return input.trim().replace(/^["']|["']$/g, '')
}

/** Read a NAIA snapshot folder (`_folders.json` + one subfolder per style) */
export function scanNaiaSnapshots(rawDir: string): ScannedNaia {
  const dir = cleanNaiaDir(rawDir)
  if (!dir) throw new NaiaPathError('Enter the NAIA snapshot folder path')
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new NaiaPathError(`Folder not found: ${dir}`)
  }
  const foldersFile = join(dir, '_folders.json')
  if (!existsSync(foldersFile)) {
    throw new NaiaPathError(
      `_folders.json not found in this folder (is it the NAIA "snapshots/NAI" folder?): ${dir}`,
    )
  }
  let foldersRaw: unknown
  try {
    foldersRaw = JSON.parse(readFileSync(foldersFile, 'utf8'))
  } catch {
    throw new NaiaPathError('_folders.json could not be read')
  }
  const folders = parseNaiaFolders(foldersRaw)

  const styles: Array<NaiaStyle> = []
  const errors: Array<NaiaScanError> = []
  const imagePaths = new Map<string, string>()
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_')) continue
    try {
      const file = join(dir, e.name, 'snapshot.json')
      if (!existsSync(file)) throw new NaiaParseError('snapshot.json not found')
      let json: unknown
      try {
        json = JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        throw new NaiaParseError('snapshot.json could not be read')
      }
      const image = join(dir, e.name, 'image.webp')
      const hasImage = existsSync(image)
      const style = parseNaiaSnapshot(json, e.name, hasImage)
      styles.push(style)
      if (hasImage) imagePaths.set(style.dirName, image)
    } catch (err) {
      if (!(err instanceof NaiaParseError)) throw err
      errors.push({ name: e.name, reason: err.message })
    }
  }
  styles.sort((a, b) => a.name.localeCompare(b.name))
  return { folders, styles, errors, imagePaths }
}

/** 96px-wide preview as a data URL (the dialog never serves arbitrary paths) */
export async function naiaThumbDataUrl(path: string): Promise<string | null> {
  try {
    const buf = await sharp(path)
      .resize({ width: 96, height: 96, fit: 'cover' })
      .webp({ quality: 70 })
      .toBuffer()
    return `data:image/webp;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
