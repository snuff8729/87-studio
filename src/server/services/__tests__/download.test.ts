import { describe, it, expect } from 'vitest'
import { resolveFilenameTemplate, DEFAULT_FILENAME_TEMPLATE } from '../download'
import type { FilenameVars } from '../download'

describe('resolveFilenameTemplate', () => {
  it('resolves default template', () => {
    const vars: FilenameVars = {
      project_name: 'MyProject',
      scene_name: 'Smile',
      seed: 12345,
    }
    const result = resolveFilenameTemplate(DEFAULT_FILENAME_TEMPLATE, vars)
    expect(result).toBe('MyProject_Smile_12345')
  })

  it('resolves all supported variables', () => {
    const vars: FilenameVars = {
      project_name: 'Proj',
      scene_name: 'Scene',
      seed: 42,
      index: 3,
      date: '2025-01-15',
      rating: 5,
      id: 100,
      wins: 10,
      win_rate: '75.0',
    }
    const template = '{{project_name}}_{{scene_name}}_{{seed}}_{{index}}_{{date}}_{{rating}}_{{id}}_{{wins}}_{{win_rate}}'
    const result = resolveFilenameTemplate(template, vars)
    expect(result).toBe('Proj_Scene_42_3_2025-01-15_5_100_10_75.0')
  })

  it('replaces missing variables with empty string', () => {
    const result = resolveFilenameTemplate('{{project_name}}_{{seed}}', {
      project_name: 'Test',
    })
    expect(result).toBe('Test')
  })

  it('replaces null seed with empty string', () => {
    const result = resolveFilenameTemplate('{{project_name}}_{{seed}}', {
      project_name: 'Test',
      seed: null,
    })
    expect(result).toBe('Test')
  })

  it('removes forbidden filesystem characters', () => {
    const result = resolveFilenameTemplate('{{project_name}}', {
      project_name: 'Test<>:"/\\|?*File',
    })
    expect(result).toBe('Test_File')
  })

  it('collapses multiple underscores', () => {
    const result = resolveFilenameTemplate('{{project_name}}___{{seed}}', {
      project_name: 'A',
      seed: 1,
    })
    expect(result).toBe('A_1')
  })

  it('removes leading/trailing underscores', () => {
    const result = resolveFilenameTemplate('_{{project_name}}_', {
      project_name: 'Test',
    })
    expect(result).toBe('Test')
  })

  it('returns "image" for empty result', () => {
    const result = resolveFilenameTemplate('{{missing}}', {})
    expect(result).toBe('image')
  })

  it('preserves literal text in template', () => {
    const result = resolveFilenameTemplate('prefix-{{seed}}-suffix', { seed: 42 })
    expect(result).toBe('prefix-42-suffix')
  })

  it('handles zero seed', () => {
    const result = resolveFilenameTemplate('{{seed}}', { seed: 0 })
    expect(result).toBe('0')
  })

  it('handles zero rating', () => {
    const result = resolveFilenameTemplate('{{rating}}', { rating: 0 })
    // 0 is falsy but not null/undefined — should be resolved
    expect(result).toBe('0')
  })
})

describe('DEFAULT_FILENAME_TEMPLATE', () => {
  it('is the expected default', () => {
    expect(DEFAULT_FILENAME_TEMPLATE).toBe('{{project_name}}_{{scene_name}}_{{seed}}')
  })
})
