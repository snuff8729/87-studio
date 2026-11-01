import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NaiaParseError,
  diffStyle,
  folderTagName,
  parseNaiaFolders,
  parseNaiaSnapshot,
  planNaiaImport,
} from '../naia-import'
import type { ExistingBundle, NaiaScan, NaiaStyle } from '../naia-import'

const FIXTURES = join(process.cwd(), 'scripts/smoke/fixtures/naia/NAI')
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8'))

const folders = parseNaiaFolders(readJson('_folders.json'))

describe('parseNaiaFolders', () => {
  it('reads ids, names and parents (empty parent = top level)', () => {
    expect(folders).toHaveLength(5)
    expect(folders.find((f) => f.name === '2D')?.parentSourceId).toBeNull()
    expect(folders.find((f) => f.name === '간장')?.parentSourceId).toBe(
      'f433ed7ae633d',
    )
  })
  it('tolerates junk', () => {
    expect(parseNaiaFolders(null)).toEqual([])
    expect(parseNaiaFolders({ folders: [{ id: 1 }, 'x'] })).toEqual([])
  })
})

describe('folderTagName', () => {
  it('is null without a folder', () => {
    expect(folderTagName(null, folders)).toBeNull()
    expect(folderTagName('nope', folders)).toBeNull()
  })
  it('top-level folder is its name, subfolders are parent/child', () => {
    expect(folderTagName('ffee7a35870b7', folders)).toBe('2D')
    expect(folderTagName('f4bfa36a3bea1', folders)).toBe('2D/Favorite')
    expect(folderTagName('f6150347006b9', folders)).toBe('반실사/간장')
  })
  it('survives a parent cycle', () => {
    const cyc = [
      { sourceId: 'a', name: 'A', parentSourceId: 'b' },
      { sourceId: 'b', name: 'B', parentSourceId: 'a' },
    ]
    expect(folderTagName('a', cyc)).toBe('B/A')
  })
})

describe('parseNaiaSnapshot', () => {
  it('maps main_settings from a real snapshot', () => {
    const s = parseNaiaSnapshot(readJson('2D1/snapshot.json'), '2D1', false)
    expect(s.name).toBe('2D1')
    expect(s.folderSourceId).toBe('ffee7a35870b7')
    expect(s.prompt).toContain('artist:')
    expect(s.negative).toContain('watermark')
    expect(s.params).toEqual({
      width: 832,
      height: 1216,
      steps: 28,
      scale: 5.5,
      cfgRescale: 0.16,
      sampler: 'k_euler_ancestral',
      scheduler: 'karras',
    })
    expect(s.hasImage).toBe(false)
  })
  it('falls back to the directory name', () => {
    const s = parseNaiaSnapshot(
      { preset: { main_settings: { prompt: 'x' } } },
      'dir',
      true,
    )
    expect(s).toMatchObject({
      name: 'dir',
      prompt: 'x',
      negative: '',
      params: {},
      hasImage: true,
      folderSourceId: null,
    })
  })
  it('rejects missing or invalid settings', () => {
    expect(() => parseNaiaSnapshot({}, 'd', false)).toThrow(NaiaParseError)
    expect(() =>
      parseNaiaSnapshot({ preset: { main_settings: {} } }, 'd', false),
    ).toThrow(/prompt/)
    expect(() =>
      parseNaiaSnapshot(
        { preset: { main_settings: { prompt: 'x', steps: 'abc' } } },
        'd',
        false,
      ),
    ).toThrow(/steps/)
  })
})

const style = (name: string, over: Partial<NaiaStyle> = {}): NaiaStyle => ({
  name,
  folderSourceId: null,
  prompt: 'p',
  negative: 'n',
  params: { steps: 28, scale: 5 },
  hasImage: false,
  ...over,
})
const bundle = (
  name: string,
  over: Partial<ExistingBundle> = {},
): ExistingBundle => ({
  name,
  kind: 'style',
  content: 'p',
  negative: 'n',
  styleParams: { steps: 28, scale: 5 },
  ...over,
})
const scanOf = (
  styles: Array<NaiaStyle>,
  errors: NaiaScan['errors'] = [],
): NaiaScan => ({ folders, styles, errors })

describe('diffStyle', () => {
  it('is empty when identical', () => {
    expect(diffStyle(bundle('a'), style('a'))).toEqual([])
  })
  it('lists current → new values', () => {
    const d = diffStyle(
      bundle('a', { styleParams: { steps: 25, scale: 5 } }),
      style('a', { negative: 'changed' }),
    )
    expect(d).toEqual([
      { field: 'negative', from: 'n', to: 'changed' },
      { field: 'steps', from: '25', to: '28' },
    ])
  })
  it('shows missing values as a dash', () => {
    const d = diffStyle(
      bundle('a', { styleParams: {} }),
      style('a', { params: { width: 832, height: 1216 } }),
    )
    expect(d).toContainEqual({ field: 'resolution', from: '—', to: '832×1216' })
  })
})

describe('planNaiaImport', () => {
  it('new', () => {
    const rows = planNaiaImport(
      scanOf([style('a', { folderSourceId: 'f4bfa36a3bea1' })]),
      [],
    )
    expect(rows).toEqual([
      {
        name: 'a',
        status: 'new',
        targetName: 'a',
        folderTag: '2D/Favorite',
        hasImage: false,
      },
    ])
  })
  it('update with diff vs unchanged', () => {
    const rows = planNaiaImport(scanOf([style('a'), style('b')]), [
      bundle('a', { styleParams: { steps: 25, scale: 5 } }),
      bundle('b'),
    ])
    expect(rows[0].status).toBe('update')
    expect(rows[0].diff).toEqual([{ field: 'steps', from: '25', to: '28' }])
    expect(rows[1].status).toBe('unchanged')
    expect(rows[1].diff).toBeUndefined()
  })
  it('renamed when a text / wildcard bundle has the name', () => {
    const rows = planNaiaImport(scanOf([style('a')]), [
      bundle('a', { kind: 'text' }),
      bundle('a (2)', { kind: 'wildcard' }),
    ])
    expect(rows[0]).toMatchObject({
      status: 'renamed',
      name: 'a',
      targetName: 'a (3)',
    })
  })
  it('avoids collisions between scanned styles with equal names', () => {
    const rows = planNaiaImport(scanOf([style('a'), style('a')]), [])
    expect(rows.map((r) => r.targetName)).toEqual(['a', 'a (2)'])
    expect(rows[1].status).toBe('renamed')
  })
  it('scan errors become error rows', () => {
    const rows = planNaiaImport(
      scanOf([], [{ name: 'broken', reason: 'bad json' }]),
      [],
    )
    expect(rows).toEqual([
      {
        name: 'broken',
        status: 'error',
        targetName: 'broken',
        folderTag: null,
        hasImage: false,
        reason: 'bad json',
      },
    ])
  })
})
