/**
 * NAIA snapshot import: pure parsing + planning (no filesystem).
 *
 * A NAIA snapshot (`<dir>/<name>/snapshot.json`) holds a preset whose
 * `main_settings` carry the style prompt / negative / generation settings.
 * Folders come from `_folders.json` and become bundle tags (`parent/child`).
 */
import type { StyleParams } from '@/lib/style-bundles'
import { uniqueSuffixedName } from '@/lib/project-packs'
import { parseStyleParams } from '@/lib/style-bundles'

export interface NaiaFolder {
  sourceId: string
  name: string
  parentSourceId: string | null
}

export interface NaiaStyle {
  /** Snapshot directory name (unique; the row key) */
  dirName: string
  name: string
  folderSourceId: string | null
  prompt: string
  negative: string
  params: StyleParams
  hasImage: boolean
}

export interface NaiaScanError {
  name: string
  reason: string
}

export interface NaiaScan {
  folders: Array<NaiaFolder>
  styles: Array<NaiaStyle>
  errors: Array<NaiaScanError>
}

export class NaiaParseError extends Error {}

/** Parse `_folders.json` content */
export function parseNaiaFolders(raw: unknown): Array<NaiaFolder> {
  const list: Array<any> =
    raw && typeof raw === 'object' && Array.isArray((raw as any).folders)
      ? (raw as any).folders
      : []
  return list
    .filter((f) => typeof f?.id === 'string' && typeof f?.name === 'string')
    .map((f) => ({
      sourceId: f.id as string,
      name: f.name as string,
      parentSourceId:
        typeof f.parent === 'string' && f.parent ? (f.parent as string) : null,
    }))
}

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/**
 * Parse one `snapshot.json`. Throws NaiaParseError with a user-facing reason.
 * Optional settings that are absent are simply left out of `params`.
 */
export function parseNaiaSnapshot(
  json: unknown,
  dirName: string,
  hasImage: boolean,
): NaiaStyle {
  const root = json && typeof json === 'object' ? (json as any) : null
  const m = root?.preset?.main_settings
  if (!m || typeof m !== 'object') {
    throw new NaiaParseError('main_settings is missing')
  }
  if (typeof m.prompt !== 'string') {
    throw new NaiaParseError('prompt is not text')
  }
  if (m.negative != null && typeof m.negative !== 'string') {
    throw new NaiaParseError('negative is not text')
  }
  const num = (key: string) => {
    const v = m[key]
    if (v == null) return undefined
    if (!isNum(v)) throw new NaiaParseError(`${key} is not a number`)
    return v
  }
  const str = (key: string) => {
    const v = m[key]
    if (v == null) return undefined
    if (typeof v !== 'string') throw new NaiaParseError(`${key} is not text`)
    return v
  }
  const raw: Record<string, unknown> = {
    width: num('width'),
    height: num('height'),
    steps: num('steps'),
    scale: num('cfg_scale'),
    cfgRescale: num('cfg_rescale'),
    sampler: str('sampler'),
    scheduler: str('scheduler'),
  }
  const name =
    typeof root.name === 'string' && root.name.trim()
      ? root.name.trim()
      : dirName
  return {
    dirName,
    name,
    folderSourceId:
      typeof root.folder === 'string' && root.folder ? root.folder : null,
    prompt: m.prompt,
    negative: m.negative ?? '',
    params: parseStyleParams(JSON.stringify(raw)),
    hasImage,
  }
}

/** Tag name of a NAIA folder: `child`, or `parent/child` for subfolders */
export function folderTagName(
  folderSourceId: string | null,
  folders: ReadonlyArray<NaiaFolder>,
): string | null {
  if (!folderSourceId) return null
  const byId = new Map(folders.map((f) => [f.sourceId, f]))
  const parts: Array<string> = []
  const seen = new Set<string>()
  let cur = byId.get(folderSourceId)
  while (cur && !seen.has(cur.sourceId)) {
    seen.add(cur.sourceId)
    parts.unshift(cur.name)
    cur = cur.parentSourceId ? byId.get(cur.parentSourceId) : undefined
  }
  return parts.length > 0 ? parts.join('/') : null
}

export interface ExistingBundle {
  name: string
  kind: string
  content: string
  negative: string
  styleParams: StyleParams
}

export interface ImportDiff {
  field: string
  from: string
  to: string
}

export type ImportStatus = 'new' | 'update' | 'unchanged' | 'renamed' | 'error'

export interface ImportRow {
  /** Snapshot directory name (unique row key) */
  key: string
  /** Name in the NAIA snapshot */
  name: string
  status: ImportStatus
  /** Bundle name that will be created / updated (renamed: the suffixed one) */
  targetName: string
  folderTag: string | null
  hasImage: boolean
  /** status 'update': what changes, `current → new` */
  diff?: Array<ImportDiff>
  /** status 'error' */
  reason?: string
}

const fmt = (v: unknown) => (v == null || v === '' ? '—' : String(v))

/** Changes an update would make to an existing style bundle */
export function diffStyle(
  existing: ExistingBundle,
  next: NaiaStyle,
): Array<ImportDiff> {
  const out: Array<ImportDiff> = []
  const add = (field: string, from: unknown, to: unknown) => {
    if (fmt(from) !== fmt(to)) {
      out.push({ field, from: fmt(from), to: fmt(to) })
    }
  }
  add('prompt', existing.content, next.prompt)
  add('negative', existing.negative, next.negative)
  const a = existing.styleParams
  const b = next.params
  const res = (p: StyleParams) =>
    isNum(p.width) && isNum(p.height) ? `${p.width}×${p.height}` : undefined
  add('resolution', res(a), res(b))
  add('steps', a.steps, b.steps)
  add('CFG', a.scale, b.scale)
  add('rescale', a.cfgRescale, b.cfgRescale)
  add('sampler', a.sampler, b.sampler)
  add('scheduler', a.scheduler, b.scheduler)
  return out
}

/**
 * Plan an import: per scanned style whether it is new, an update of the
 * same-named style bundle, unchanged, or renamed because a text / wildcard
 * bundle (or an earlier row of this scan) already has that name. A renamed
 * row that was imported before finds its earlier "name (2)" style bundle and
 * updates it instead of creating another suffix. Scan errors become error rows.
 * Rows are keyed by snapshot directory name (names can repeat).
 */
export function planNaiaImport(
  scan: NaiaScan,
  existing: ReadonlyArray<ExistingBundle>,
): Array<ImportRow> {
  const byName = new Map(existing.map((b) => [b.name, b]))
  const taken = existing.map((b) => b.name)
  /** Bundle names already claimed by an earlier row of this plan */
  const claimed = new Set<string>()
  const rows: Array<ImportRow> = []

  const existingSuffixedStyle = (name: string) => {
    for (let n = 2; n < existing.length + 3; n++) {
      const cand = `${name} (${n})`
      const b = byName.get(cand)
      if (b && b.kind === 'style' && !claimed.has(cand)) return b
    }
    return null
  }

  for (const s of scan.styles) {
    const folderTag = folderTagName(s.folderSourceId, scan.folders)
    const base = {
      key: s.dirName,
      name: s.name,
      folderTag,
      hasImage: s.hasImage,
    }
    const found = byName.get(s.name)
    const sameNameFree = !claimed.has(s.name)

    // Existing style bundle this row updates (null = create a new one)
    let target: ExistingBundle | null = null
    if (found?.kind === 'style' && sameNameFree) target = found
    else if (found || !sameNameFree) target = existingSuffixedStyle(s.name)

    if (target) {
      claimed.add(target.name)
      const diff = diffStyle(target, s)
      rows.push({
        ...base,
        status: diff.length > 0 ? 'update' : 'unchanged',
        targetName: target.name,
        ...(diff.length > 0 && { diff }),
      })
      continue
    }
    const targetName = uniqueSuffixedName(s.name, taken)
    taken.push(targetName)
    claimed.add(targetName)
    rows.push({
      ...base,
      status: targetName === s.name ? 'new' : 'renamed',
      targetName,
    })
  }
  for (const e of scan.errors) {
    rows.push({
      key: e.name,
      name: e.name,
      status: 'error',
      targetName: e.name,
      folderTag: null,
      hasImage: false,
      reason: e.reason,
    })
  }
  return rows
}
