import { describe, expect, it } from 'vitest'
import {
  extractPromptTokens,
  likeFragments,
  metadataHasPromptTag,
  promptHasTag,
} from '../prompt-tags'

describe('promptHasTag', () => {
  it('matches underscore and space forms, case-insensitively', () => {
    expect(promptHasTag('1girl, Blue Hair, smile', 'blue_hair')).toBe(true)
    expect(promptHasTag('1girl, blue_hair', 'blue hair')).toBe(true)
  })

  it('matches whole tokens only', () => {
    expect(promptHasTag('light blue hair', 'blue hair')).toBe(false)
    expect(promptHasTag('blue hair ribbon', 'blue hair')).toBe(false)
    expect(promptHasTag('hair', 'blue hair')).toBe(false)
  })

  it('strips NAI weights', () => {
    expect(promptHasTag('1.2::smile::, 1girl', 'smile')).toBe(true)
    expect(promptHasTag('0.8::smile, open mouth::, 1girl', 'open_mouth')).toBe(
      true,
    )
    expect(promptHasTag('0.8::smile, open mouth ::', 'open mouth')).toBe(true)
    expect(promptHasTag('-1::smile::', 'smile')).toBe(true)
  })

  it('strips braces and brackets', () => {
    expect(promptHasTag('{{smile}}, [frown]', 'smile')).toBe(true)
    expect(promptHasTag('{{smile}}, [frown]', 'frown')).toBe(true)
    expect(promptHasTag('1.1::{smile}::', 'smile')).toBe(true)
  })

  it('handles tags with parentheses and escapes', () => {
    expect(
      promptHasTag(
        'hatsune miku \\(vocaloid\\), 1girl',
        'hatsune_miku_(vocaloid)',
      ),
    ).toBe(true)
    expect(
      promptHasTag('hatsune miku (vocaloid)', 'hatsune miku (vocaloid)'),
    ).toBe(true)
    expect(promptHasTag('hatsune miku', 'hatsune miku (vocaloid)')).toBe(false)
  })

  it('strips a :weight suffix', () => {
    expect(promptHasTag('smile:1.2, 1girl', 'smile')).toBe(true)
  })

  it('rejects empty tags', () => {
    expect(promptHasTag('a, b', '  ')).toBe(false)
  })

  it('splits on newlines too', () => {
    expect(promptHasTag('1girl\nsmile', 'smile')).toBe(true)
  })
})

describe('extractPromptTokens', () => {
  it('drops empty tokens', () => {
    expect(extractPromptTokens('a,, ::, B_c')).toEqual(['a', 'b c'])
  })
})

describe('metadataHasPromptTag', () => {
  const meta = JSON.stringify({
    prompts: {
      generalPrompt: '1girl, smile',
      negativePrompt: 'lowres, red hair',
      characterPrompts: [{ prompt: 'blue hair', negative: 'frown' }],
    },
  })

  it('checks general and character prompts', () => {
    expect(metadataHasPromptTag(meta, 'smile')).toBe(true)
    expect(metadataHasPromptTag(meta, 'blue_hair')).toBe(true)
  })

  it('ignores negative prompts', () => {
    expect(metadataHasPromptTag(meta, 'lowres')).toBe(false)
    expect(metadataHasPromptTag(meta, 'frown')).toBe(false)
  })

  it('tolerates bad / empty metadata', () => {
    expect(metadataHasPromptTag(null, 'smile')).toBe(false)
    expect(metadataHasPromptTag('{oops', 'smile')).toBe(false)
    expect(metadataHasPromptTag('{}', 'smile')).toBe(false)
  })
})

describe('likeFragments', () => {
  it('gives both spellings', () => {
    expect(likeFragments('Blue_Hair')).toEqual(['blue hair', 'blue_hair'])
  })

  it('uses the longest paren-free part', () => {
    expect(likeFragments('hatsune_miku_(vocaloid)')).toEqual([
      'hatsune miku',
      'hatsune_miku',
    ])
  })

  it('is empty for blank input', () => {
    expect(likeFragments(' ')).toEqual([])
  })
})
