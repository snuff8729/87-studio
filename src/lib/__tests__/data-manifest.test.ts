import { describe, expect, it } from 'vitest'
import {
  BUILTIN_MANIFEST,
  anyUpdate,
  compareVersions,
  deriveState,
  entrySize,
  mergeManifest,
  missingRequirements,
  parseManifest,
} from '../data-manifest'

const sha = 'a'.repeat(64)

describe('parseManifest', () => {
  it('accepts the built-in manifest shape', () => {
    expect(parseManifest(JSON.parse(JSON.stringify(BUILTIN_MANIFEST)))).toEqual(
      BUILTIN_MANIFEST,
    )
  })
  it('rejects wrong schema, bad hashes and path tricks', () => {
    expect(parseManifest({ schema: 2, files: {} })).toBeNull()
    expect(parseManifest(null)).toBeNull()
    const parse = (f: object) =>
      parseManifest({
        schema: 1,
        files: { ko: { version: '1', files: [f] } },
      })
    expect(parse({ name: 'x.db', size: 1, sha256: 'zz' })).toBeNull()
    expect(parse({ name: '../x.db', size: 1, sha256: sha })).toBeNull()
    expect(parse({ name: 'a/b.db', size: 1, sha256: sha })).toBeNull()
    expect(parse({ name: 'x.db', size: 0, sha256: sha })).toBeNull()
    expect(parse({ name: 'x.db', size: 1, sha256: sha })).not.toBeNull()
  })
  it('ignores unknown datasets and invalid requires', () => {
    const m = parseManifest({
      schema: 1,
      files: {
        nope: { version: '1', files: [{ name: 'a', size: 1, sha256: sha }] },
        ko: {
          version: '2',
          requires: ['danbooru', 'zzz'],
          files: [{ name: 'a.db', size: 1, sha256: sha }],
        },
      },
    })
    expect(Object.keys(m!.files)).toEqual(['ko'])
    expect(m!.files.ko!.requires).toEqual(['danbooru'])
  })
})

describe('mergeManifest', () => {
  it('keeps built-in entries the remote omits', () => {
    const remote = parseManifest({
      schema: 1,
      files: {
        ko: { version: '2', files: [{ name: 'n.db', size: 5, sha256: sha }] },
      },
    })
    const m = mergeManifest(remote)
    expect(m.files.ko!.version).toBe('2')
    expect(m.files.danbooru).toEqual(BUILTIN_MANIFEST.files.danbooru)
    expect(mergeManifest(null)).toEqual(BUILTIN_MANIFEST)
  })
})

describe('compareVersions', () => {
  it('compares numerically', () => {
    expect(compareVersions('1', '2')).toBeLessThan(0)
    expect(compareVersions('10', '9')).toBeGreaterThan(0)
    expect(compareVersions('1.2', '1.10')).toBeLessThan(0)
    expect(compareVersions('1', '1.0')).toBe(0)
    expect(compareVersions('2026a', '2026b')).toBeLessThan(0)
  })
})

describe('deriveState', () => {
  const base = { installed: null, latest: '1', downloading: false, error: null }
  it('covers every state', () => {
    expect(deriveState(base)).toBe('notInstalled')
    expect(deriveState({ ...base, installed: '1' })).toBe('installed')
    expect(deriveState({ ...base, installed: '1', latest: '2' })).toBe(
      'updateAvailable',
    )
    expect(deriveState({ ...base, installed: '3', latest: '2' })).toBe(
      'installed',
    )
    expect(deriveState({ ...base, downloading: true, error: 'x' })).toBe(
      'downloading',
    )
    expect(deriveState({ ...base, installed: '1', error: 'x' })).toBe('error')
  })
})

describe('helpers', () => {
  it('missingRequirements / anyUpdate / entrySize', () => {
    expect(missingRequirements(['danbooru'], new Set())).toEqual(['danbooru'])
    expect(missingRequirements(['danbooru'], new Set(['danbooru']))).toEqual([])
    expect(missingRequirements(undefined, new Set())).toEqual([])
    expect(
      anyUpdate([{ state: 'installed' }, { state: 'updateAvailable' }]),
    ).toBe(true)
    expect(entrySize(BUILTIN_MANIFEST.files.semantic)).toBe(13738875)
    expect(entrySize(undefined)).toBe(0)
  })
})
