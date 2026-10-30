import { describe, it, expect } from 'vitest'
import { join, resolve } from 'node:path'
import { resolveDataPath } from '../data-dir'

describe('resolveDataPath', () => {
  it('is identity without a data dir', () => {
    expect(resolveDataPath('data/images/1/a.png')).toBe('data/images/1/a.png')
  })

  it('maps logical data paths onto the data dir', () => {
    const dir = resolve('tmp-data')
    expect(resolveDataPath('data/images/1/a.png', dir)).toBe(
      join(dir, 'images/1/a.png'),
    )
    expect(resolveDataPath('./data/logs', dir)).toBe(join(dir, 'logs'))
    expect(resolveDataPath('data', dir)).toBe(dir)
    expect(resolveDataPath('data\\thumbnails\\1\\a.png', dir)).toBe(
      join(dir, 'thumbnails/1/a.png'),
    )
  })

  it('leaves non-data paths alone', () => {
    expect(resolveDataPath('/abs/x.png', resolve('d'))).toBe('/abs/x.png')
    expect(resolveDataPath('database/x', resolve('d'))).toBe('database/x')
  })
})
