import { copyFileSync } from 'node:fs'
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import {
  bundleTagAssignments,
  bundleTags,
  promptBundles,
  settings,
} from '../db/schema'
import { dataPath } from '../data-dir'
import { mkdirSync } from '../data-fs'
import { createLogger } from '../services/logger'
import {
  NaiaPathError,
  cleanNaiaDir,
  naiaThumbDataUrl,
  scanNaiaSnapshots,
} from '../services/naia-styles'
import type { ExistingBundle, ImportRow } from '@/lib/naia-import'
import { planNaiaImport } from '@/lib/naia-import'
import { parseStyleParams } from '@/lib/style-bundles'

const log = createLogger('fn.naia-import')

const DIR_KEY = 'naia_snapshot_dir'
const PREVIEW_DIR = 'data/bundle-previews'

function loadExisting(): Array<ExistingBundle> {
  return db
    .select({
      name: promptBundles.name,
      kind: promptBundles.kind,
      content: promptBundles.content,
      negative: promptBundles.negative,
      styleParams: promptBundles.styleParams,
    })
    .from(promptBundles)
    .all()
    .map((b) => ({ ...b, styleParams: parseStyleParams(b.styleParams) }))
}

function saveDir(dir: string) {
  db.insert(settings)
    .values({ key: DIR_KEY, value: dir })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: dir, updatedAt: new Date().toISOString() },
    })
    .run()
}

export interface NaiaPreviewRow extends ImportRow {
  /** 96px data URL of the snapshot preview image */
  thumb: string | null
}

export type NaiaPreviewResult =
  | { ok: true; dir: string; rows: Array<NaiaPreviewRow> }
  | { ok: false; error: string }

/** Last used snapshot folder (null when never imported) */
export const getNaiaDir = createServerFn({ method: 'GET' }).handler(
  async () => {
    const row = db
      .select()
      .from(settings)
      .where(eq(settings.key, DIR_KEY))
      .get()
    return row?.value ?? null
  },
)

/** Scan a NAIA snapshot folder and plan the import (nothing is written) */
export const previewNaiaImport = createServerFn({ method: 'POST' })
  .inputValidator((data: { dir: string }) => data)
  .handler(async ({ data }): Promise<NaiaPreviewResult> => {
    try {
      const scanned = scanNaiaSnapshots(data.dir)
      const rows = planNaiaImport(scanned, loadExisting())
      const withThumbs: Array<NaiaPreviewRow> = []
      for (const row of rows) {
        const path = scanned.imagePaths.get(row.name)
        withThumbs.push({
          ...row,
          thumb:
            row.status !== 'error' && path
              ? await naiaThumbDataUrl(path)
              : null,
        })
      }
      return { ok: true, dir: cleanNaiaDir(data.dir), rows: withThumbs }
    } catch (error) {
      if (error instanceof NaiaPathError) {
        return { ok: false, error: error.message }
      }
      log.error('preview', 'NAIA scan failed', { dir: data.dir }, error)
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

/**
 * Import the chosen snapshots (by NAIA name). New / renamed create style
 * bundles, update overwrites the same-named style bundle. Folder names become
 * tags (existing tags are kept), the preview image is copied.
 */
export const runNaiaImport = createServerFn({ method: 'POST' })
  .inputValidator((data: { dir: string; names: Array<string> }) => data)
  .handler(async ({ data }) => {
    const scanned = scanNaiaSnapshots(data.dir)
    const dir = cleanNaiaDir(data.dir)
    const chosen = new Set(data.names)
    const plan = planNaiaImport(scanned, loadExisting())
    const styleByName = new Map(scanned.styles.map((s) => [s.name, s]))

    const written: Array<{ id: number; imagePath: string | null }> = []
    let created = 0
    let updated = 0

    db.transaction((tx) => {
      for (const row of plan) {
        if (!chosen.has(row.name) || row.status === 'error') continue
        const style = styleByName.get(row.name)
        if (!style) continue
        const values = {
          content: style.prompt,
          negative: style.negative,
          styleParams: JSON.stringify(style.params),
          kind: 'style',
          updatedAt: new Date().toISOString(),
        }
        let id: number
        if (row.status === 'update' || row.status === 'unchanged') {
          const existing = tx
            .select({ id: promptBundles.id })
            .from(promptBundles)
            .where(eq(promptBundles.name, row.targetName))
            .get()
          if (!existing) continue
          id = existing.id
          tx.update(promptBundles)
            .set(values)
            .where(eq(promptBundles.id, id))
            .run()
          if (row.status === 'update') updated++
        } else {
          id = tx
            .insert(promptBundles)
            .values({ name: row.targetName, ...values })
            .returning({ id: promptBundles.id })
            .get().id
          created++
        }
        if (row.folderTag) {
          // Same normalisation as setBundleTags (lowercase); existing tags stay
          const tagName = row.folderTag.trim().toLowerCase()
          tx.insert(bundleTags)
            .values({ name: tagName })
            .onConflictDoNothing()
            .run()
          const tag = tx
            .select({ id: bundleTags.id })
            .from(bundleTags)
            .where(eq(bundleTags.name, tagName))
            .get()
          if (tag) {
            tx.insert(bundleTagAssignments)
              .values({ bundleId: id, tagId: tag.id })
              .onConflictDoNothing()
              .run()
          }
        }
        written.push({ id, imagePath: scanned.imagePaths.get(row.name) ?? null })
      }
    })

    // Preview files after the DB write (a copy failure must not undo styles)
    const failures: Array<string> = []
    if (written.some((w) => w.imagePath)) mkdirSync(PREVIEW_DIR, { recursive: true })
    for (const w of written) {
      if (!w.imagePath) continue
      const logical = `${PREVIEW_DIR}/${w.id}.webp`
      try {
        copyFileSync(w.imagePath, dataPath(logical))
        db.update(promptBundles)
          .set({ previewPath: logical })
          .where(eq(promptBundles.id, w.id))
          .run()
      } catch (error) {
        failures.push(w.imagePath)
        log.warn('preview', 'Failed to copy preview image', {
          bundleId: w.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    saveDir(dir)
    log.info('run', 'NAIA import done', {
      dir,
      created,
      updated,
      previewFailures: failures.length,
    })
    return { created, updated }
  })
