import { describe, expect, it } from 'vitest'
import {
  applyParts,
  composeParts,
  effectiveAxisValues,
  matchesCondition,
  parseAxisValues,
  parseIdList,
  relevantAxes,
} from '../character-parts'
import type { PartsAxis, PartsFragment, PartsItem } from '../character-parts'

const view: PartsAxis = {
  id: 1,
  name: 'View',
  ownerCharacterId: null,
  ownerItemId: null,
  values: [
    { id: 10, name: 'Front' },
    { id: 11, name: 'Side' },
    { id: 12, name: 'Back' },
  ],
}
const framing: PartsAxis = {
  id: 2,
  name: 'Framing',
  ownerCharacterId: null,
  ownerItemId: null,
  values: [
    { id: 20, name: 'Full body' },
    { id: 21, name: 'Upper body' },
    { id: 22, name: 'Face' },
  ],
}
const zipper: PartsAxis = {
  id: 3,
  name: 'Zipper',
  ownerCharacterId: null,
  ownerItemId: 7,
  values: [
    { id: 30, name: 'Closed' },
    { id: 31, name: 'Open' },
  ],
}
const hair: PartsAxis = {
  id: 4,
  name: 'Hair',
  ownerCharacterId: 5,
  ownerItemId: null,
  values: [
    { id: 40, name: 'Ponytail' },
    { id: 41, name: 'Down' },
  ],
}
const axes = [view, framing, zipper, hair]

const frag = (
  id: number,
  text: string,
  conditions: PartsFragment['conditions'] = {},
): PartsFragment => ({ id, text, conditions })

describe('effectiveAxisValues', () => {
  it('defaults to the first value of every axis', () => {
    expect(effectiveAxisValues(axes, [])).toEqual({
      '1': 10,
      '2': 20,
      '3': 30,
      '4': 40,
    })
  })

  it('later layers win', () => {
    const v = effectiveAxisValues(axes, [{ '4': 41 }, { '1': 11 }, { '1': 12 }])
    expect(v['1']).toBe(12)
    expect(v['4']).toBe(41)
    expect(v['2']).toBe(20)
  })

  it('ignores null layers, unknown axes and unknown/deleted values', () => {
    const v = effectiveAxisValues(axes, [
      null,
      undefined,
      { '99': 1, '1': 999, '2': 22 },
    ])
    expect(v['1']).toBe(10)
    expect(v['2']).toBe(22)
    expect(v['99']).toBeUndefined()
  })
})

describe('matchesCondition', () => {
  const values = effectiveAxisValues(axes, [{ '1': 11 }])
  it('empty condition always matches', () => {
    expect(matchesCondition({}, values, axes)).toBe(true)
  })
  it('requires the effective value to be allowed on every axis', () => {
    expect(matchesCondition({ '1': [10, 11] }, values, axes)).toBe(true)
    expect(matchesCondition({ '1': [10] }, values, axes)).toBe(false)
    expect(matchesCondition({ '1': [11], '2': [21] }, values, axes)).toBe(false)
  })
  it('ignores axes that no longer exist', () => {
    expect(matchesCondition({ '99': [1] }, values, axes)).toBe(true)
  })
  it('drops deleted allowed ids; an emptied list never matches', () => {
    expect(matchesCondition({ '1': [999] }, values, axes)).toBe(false)
    expect(matchesCondition({ '1': [999, 10] }, values, axes)).toBe(false)
    expect(matchesCondition({ '1': [999, 11] }, values, axes)).toBe(true)
  })
  it('explicit empty list on an existing axis never matches', () => {
    expect(matchesCondition({ '1': [] }, values, axes)).toBe(false)
  })
})

describe('composeParts', () => {
  const character = {
    id: 5,
    fragments: [
      frag(1, '1girl, silver hair'),
      frag(2, 'ponytail', { '4': [40] }),
      frag(3, 'loose hair', { '4': [41] }),
      frag(4, '  ,  ', {}),
      frag(5, ' red eyes, ', { '2': [20, 21, 22] }),
    ],
  }
  const jacket: PartsItem = {
    id: 7,
    conditions: { '2': [20, 21] },
    fragments: [
      frag(10, 'black jacket'),
      frag(11, 'zipped up', { '3': [30] }),
      frag(12, 'open jacket', { '3': [31] }),
      frag(13, 'back print', { '1': [12] }),
    ],
  }
  const skirt: PartsItem = {
    id: 8,
    conditions: { '2': [20] },
    fragments: [frag(20, 'pleated skirt')],
  }

  it('composes with defaults and strips commas/empties', () => {
    const values = effectiveAxisValues(axes, [])
    expect(
      composeParts({ axes, character, items: [jacket, skirt], values }),
    ).toEqual({
      char: '1girl, silver hair, ponytail, red eyes',
      outfit: 'black jacket, zipped up, pleated skirt',
    })
  })

  it('respects item condition (whole item dropped) and fragment conditions', () => {
    const values = effectiveAxisValues(axes, [
      { '2': 22, '1': 12, '3': 31, '4': 41 },
    ])
    expect(
      composeParts({ axes, character, items: [jacket, skirt], values }),
    ).toEqual({
      char: '1girl, silver hair, loose hair, red eyes',
      outfit: '',
    })
    const upper = effectiveAxisValues(axes, [{ '2': 21, '1': 12, '3': 31 }])
    expect(
      composeParts({ axes, character, items: [jacket, skirt], values: upper })
        .outfit,
    ).toBe('black jacket, open jacket, back print')
  })

  it('keeps outfit order', () => {
    const values = effectiveAxisValues(axes, [])
    expect(
      composeParts({ axes, character: null, items: [skirt, jacket], values })
        .outfit,
    ).toBe('pleated skirt, black jacket, zipped up')
  })

  it('strips @{char} / @{outfit} tokens inside fragment texts', () => {
    const c = {
      id: 1,
      fragments: [
        { id: 1, text: '@{char}, a, @{outfit}', conditions: {} },
        { id: 2, text: '@{outfit}', conditions: {} },
      ],
    }
    expect(
      composeParts({ axes, character: c, items: [], values: {} }).char,
    ).toBe('a')
  })

  it('no character, no items → empty', () => {
    expect(
      composeParts({ axes, character: null, items: [], values: {} }),
    ).toEqual({ char: '', outfit: '' })
  })
})

describe('applyParts', () => {
  const parts = { char: 'A, B', outfit: 'C, D' }

  it('unlinked slot (no parts, no tokens) leaves the prompt byte-identical', () => {
    for (const p of ['', 'x, y', '  spaced , ', 'a,,b\n c']) {
      expect(applyParts(p, { char: '', outfit: '' })).toBe(p)
    }
  })

  it('prepends char then outfit when tokens are absent', () => {
    expect(applyParts('free, text', parts)).toBe('A, B, C, D, free, text')
  })

  it('no dangling comma when the free prompt is empty', () => {
    expect(applyParts('', parts)).toBe('A, B, C, D')
    expect(applyParts('   ', { char: 'A', outfit: '' })).toBe('A')
    expect(applyParts('', { char: '', outfit: 'C' })).toBe('C')
  })

  it('replaces tokens in place', () => {
    expect(applyParts('x, @{outfit}, y, @{char}', parts)).toBe(
      'x, C, D, y, A, B',
    )
  })

  it('prepends only the part whose token is absent', () => {
    expect(applyParts('x, @{outfit}', parts)).toBe('A, B, x, C, D')
    expect(applyParts('@{char}, x', parts)).toBe('C, D, A, B, x')
  })

  it('empty part with token leaves no dangling commas', () => {
    const none = { char: '', outfit: '' }
    expect(applyParts('x, @{char}, y', none)).toBe('x, y')
    expect(applyParts('@{char}, x', none)).toBe('x')
    expect(applyParts('x, @{outfit}', none)).toBe('x')
    expect(applyParts('@{char}', none)).toBe('')
    expect(applyParts('x, @{char}, @{outfit}, y', none)).toBe('x, y')
    expect(applyParts('x, @{char}, y', { char: '', outfit: 'C' })).toBe(
      'C, x, y',
    )
  })

  it('replaces repeated tokens', () => {
    expect(applyParts('@{char} and @{char}', { char: 'A', outfit: '' })).toBe(
      'A and A',
    )
  })
})

describe('relevantAxes', () => {
  it('returns global axes plus locals of the character and listed items', () => {
    expect(relevantAxes(axes, null, []).map((a) => a.id)).toEqual([1, 2])
    expect(relevantAxes(axes, 5, [7]).map((a) => a.id)).toEqual([1, 2, 3, 4])
    expect(relevantAxes(axes, 6, [8]).map((a) => a.id)).toEqual([1, 2])
  })
})

describe('parse helpers', () => {
  it('parse tolerant JSON', () => {
    expect(parseAxisValues('{"1":2,"x":"s"}')).toEqual({ '1': 2 })
    expect(parseAxisValues('bad')).toEqual({})
    expect(parseIdList('[1,"a",3]')).toEqual([1, 3])
    expect(parseIdList(null)).toEqual([])
  })
})
