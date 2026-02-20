import { describe, it, expect } from 'vitest'
import { parseSdStudioFile } from '../sd-studio-import'
import type { SdStudioFile } from '../sd-studio-import'

describe('parseSdStudioFile', () => {
  it('throws on invalid input (missing name)', () => {
    expect(() => parseSdStudioFile({ scenes: {} }))
      .toThrow('Invalid SD Studio file')
  })

  it('throws on invalid input (missing scenes)', () => {
    expect(() => parseSdStudioFile({ name: 'test' }))
      .toThrow('Invalid SD Studio file')
  })

  it('throws on invalid input (scenes is not object)', () => {
    expect(() => parseSdStudioFile({ name: 'test', scenes: 'bad' }))
      .toThrow('Invalid SD Studio file')
  })

  it('parses empty scenes', () => {
    const result = parseSdStudioFile({ name: 'Empty Pack', scenes: {} })
    expect(result.name).toBe('Empty Pack')
    expect(result.scenes).toEqual([])
    expect(result.libraryPieces).toEqual([])
  })

  it('parses a simple scene with no slots', () => {
    const input: SdStudioFile = {
      name: 'Test Pack',
      scenes: {
        scene1: { name: 'Smile', slots: [] },
      },
    }
    const result = parseSdStudioFile(input)
    expect(result.name).toBe('Test Pack')
    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0].name).toBe('Smile')
    expect(result.scenes[0].placeholders).toEqual({})
    expect(result.scenes[0].sortOrder).toBe(0)
  })

  it('parses scene with single slot single alternative', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: {
          name: 'Standing',
          slots: [
            [{ prompt: 'standing, full body' }],
          ],
        },
      },
    }
    const result = parseSdStudioFile(input)
    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0].name).toBe('Standing')
    expect(result.scenes[0].placeholders._template).toBe('standing, full body')
  })

  it('computes cartesian product for multiple slot groups', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: {
          name: 'Pose',
          slots: [
            [{ prompt: 'A' }, { prompt: 'B' }],
            [{ prompt: '1' }, { prompt: '2' }],
          ],
        },
      },
    }
    const result = parseSdStudioFile(input)
    // 2×2 = 4 combinations
    expect(result.scenes).toHaveLength(4)
    expect(result.scenes[0].name).toBe('Pose.1')
    expect(result.scenes[0].placeholders._template).toBe('A, 1')
    expect(result.scenes[1].name).toBe('Pose.2')
    expect(result.scenes[1].placeholders._template).toBe('A, 2')
    expect(result.scenes[2].name).toBe('Pose.3')
    expect(result.scenes[2].placeholders._template).toBe('B, 1')
    expect(result.scenes[3].name).toBe('Pose.4')
    expect(result.scenes[3].placeholders._template).toBe('B, 2')
  })

  it('filters out disabled alternatives', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: {
          name: 'Test',
          slots: [
            [
              { prompt: 'enabled' },
              { prompt: 'disabled', enabled: false },
            ],
          ],
        },
      },
    }
    const result = parseSdStudioFile(input)
    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0].placeholders._template).toBe('enabled')
  })

  it('resolves library references', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: {
          name: 'WithLib',
          slots: [
            [{ prompt: '<poses.standing>' }],
          ],
        },
      },
      library: {
        poses: {
          name: 'Poses',
          pieces: [{ name: 'standing', prompt: 'standing, full body' }],
        },
      },
    }
    const result = parseSdStudioFile(input)
    expect(result.scenes[0].placeholders._template).toBe('standing, full body')
    expect(result.libraryPieces).toContain('standing')
  })

  it('replaces unmatched library references with empty string', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: {
          name: 'Missing',
          slots: [
            [{ prompt: 'text, <missing.ref>, more' }],
          ],
        },
      },
    }
    const result = parseSdStudioFile(input)
    // After library replacement leaves empty, cleanPrompt should handle it
    expect(result.scenes[0].placeholders._template).toBe('text, more')
  })

  it('cleans double commas and extra whitespace', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: {
          name: 'Clean',
          slots: [
            [{ prompt: '  a, , , b  ' }],
          ],
        },
      },
    }
    const result = parseSdStudioFile(input)
    expect(result.scenes[0].placeholders._template).toBe('a, b')
  })

  it('deduplicates scene names', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: { name: 'Dup', slots: [[{ prompt: 'a' }]] },
        s2: { name: 'Dup', slots: [[{ prompt: 'b' }]] },
      },
    }
    const result = parseSdStudioFile(input)
    expect(result.scenes).toHaveLength(2)
    expect(result.scenes[0].name).toBe('Dup')
    expect(result.scenes[1].name).toBe('Dup (2)')
  })

  it('uses scene key as fallback name', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        my_key: { name: '', slots: [[{ prompt: 'test' }]] },
      },
    }
    const result = parseSdStudioFile(input)
    // Empty name falls back to key
    expect(result.scenes[0].name).toBe('my_key')
  })

  it('assigns incrementing sort orders across scenes', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: { name: 'A', slots: [[{ prompt: 'a' }]] },
        s2: { name: 'B', slots: [[{ prompt: 'b' }]] },
        s3: { name: 'C', slots: [[{ prompt: 'c' }]] },
      },
    }
    const result = parseSdStudioFile(input)
    expect(result.scenes.map(s => s.sortOrder)).toEqual([0, 1, 2])
  })

  it('handles all slot groups disabled', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: {
          name: 'AllDisabled',
          slots: [
            [{ prompt: 'x', enabled: false }],
          ],
        },
      },
    }
    const result = parseSdStudioFile(input)
    expect(result.scenes).toHaveLength(1)
    expect(result.scenes[0].placeholders).toEqual({})
  })

  it('skips empty prompts in combination', () => {
    const input: SdStudioFile = {
      name: 'Pack',
      scenes: {
        s1: {
          name: 'Empty',
          slots: [
            [{ prompt: '' }, { prompt: 'valid' }],
          ],
        },
      },
    }
    const result = parseSdStudioFile(input)
    expect(result.scenes).toHaveLength(2)
    // First combo has empty prompt → _template is empty string after clean
    expect(result.scenes[1].placeholders._template).toBe('valid')
  })
})
