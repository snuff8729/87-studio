import { describe, expect, it } from 'vitest'
import {
  applyParts,
  composeParts,
  effectiveAxisValues,
  matchesCondition,
  parseAxisValues,
  parseCoverRules,
  parseIdList,
  relevantAxes,
  visibleItems,
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
      hiddenItemIds: [],
      hidden: [],
      contributingItemIds: [7, 8],
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
      hiddenItemIds: [],
      hidden: [],
      contributingItemIds: [],
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
    ).toEqual({
      char: '',
      outfit: '',
      hiddenItemIds: [],
      hidden: [],
      contributingItemIds: [],
    })
  })
})

describe('visibleItems / occlusion', () => {
  const TOP = 1
  const BOTTOM = 2
  const OUTER = 3
  const mk = (
    id: number,
    text: string,
    extra: Partial<PartsItem> = {},
  ): PartsItem => ({
    id,
    conditions: {},
    fragments: [frag(id * 100, text)],
    ...extra,
  })
  const shirt = mk(1, 'white shirt', { areaIds: [TOP] })
  const dress = mk(3, 'dress', { areaIds: [TOP, BOTTOM] })
  const coatClosed = mk(4, 'long coat', {
    areaIds: [OUTER],
    coverRules: [{ conditions: { '3': [30] }, areaIds: [TOP] }],
  })
  const vals = (l: Record<string, number> = {}) =>
    effectiveAxisValues(axes, [l])

  it('hides an item only when ALL its areas are covered', () => {
    const coverTop = mk(5, 'cape', {
      coverRules: [{ conditions: {}, areaIds: [TOP] }],
    })
    // dress occupies Top+Bottom: Top alone is not enough
    let r = visibleItems([dress, coverTop], vals(), axes)
    expect(r.hidden).toEqual([])
    expect(r.visible.map((i) => i.id)).toEqual([3, 5])
    const coverBoth = mk(6, 'long cape', {
      coverRules: [{ conditions: {}, areaIds: [TOP, BOTTOM] }],
    })
    r = visibleItems([dress, coverBoth], vals(), axes)
    expect(r.hidden).toEqual([{ itemId: 3, coveredBy: [6] }])
    // coverage can be split across several outer items
    r = visibleItems([dress, coverTop, pants2()], vals(), axes)
    expect(r.hidden).toEqual([{ itemId: 3, coveredBy: [5, 7] }])
  })
  function pants2(): PartsItem {
    return mk(7, 'long skirt', {
      areaIds: [BOTTOM],
      coverRules: [{ conditions: {}, areaIds: [BOTTOM] }],
    })
  }

  it('only items LATER in the list cover (order = inner → outer)', () => {
    const cover = mk(5, 'cape', {
      coverRules: [{ conditions: {}, areaIds: [TOP] }],
    })
    expect(visibleItems([cover, shirt], vals(), axes).hidden).toEqual([])
    expect(visibleItems([shirt, cover], vals(), axes).hidden).toEqual([
      { itemId: 1, coveredBy: [5] },
    ])
  })

  it('a rule only covers when its condition matches', () => {
    const closed = vals({ '3': 30 })
    const open = vals({ '3': 31 })
    expect(
      visibleItems([shirt, coatClosed], closed, axes).hidden.map(
        (h) => h.itemId,
      ),
    ).toEqual([1])
    expect(visibleItems([shirt, coatClosed], open, axes).hidden).toEqual([])
  })

  it('an outer item failing its item condition does not cover', () => {
    const cover = mk(5, 'cape', {
      conditions: { '1': [12] }, // Back only
      coverRules: [{ conditions: {}, areaIds: [TOP] }],
    })
    const front = vals({ '1': 10 })
    expect(visibleItems([shirt, cover], front, axes).hidden).toEqual([])
    expect(
      visibleItems([shirt, cover], front, axes).visible.map((i) => i.id),
    ).toEqual([1])
    const back = vals({ '1': 12 })
    expect(visibleItems([shirt, cover], back, axes).hidden).toEqual([
      { itemId: 1, coveredBy: [5] },
    ])
  })

  it('a hidden outer item still covers inner ones', () => {
    const coat = mk(5, 'coat', {
      areaIds: [OUTER],
      coverRules: [{ conditions: {}, areaIds: [TOP] }],
    })
    const poncho = mk(6, 'poncho', {
      areaIds: [OUTER],
      coverRules: [{ conditions: {}, areaIds: [OUTER] }],
    })
    const r = visibleItems([shirt, coat, poncho], vals(), axes)
    expect(r.hidden.map((h) => h.itemId)).toEqual([1, 5])
    expect(r.visible.map((i) => i.id)).toEqual([6])
  })

  it('items without areas are never hidden', () => {
    const ribbon = mk(8, 'ribbon')
    const cover = mk(5, 'cape', {
      coverRules: [{ conditions: {}, areaIds: [TOP, BOTTOM, OUTER] }],
    })
    expect(visibleItems([ribbon, cover], vals(), axes).hidden).toEqual([])
  })

  it('unknown area ids are ignored', () => {
    const ghost = mk(9, 'ghost', { areaIds: [99] })
    const cover = mk(5, 'cape', {
      coverRules: [{ conditions: {}, areaIds: [99, TOP] }],
    })
    // 99 not known → ghost has no areas → visible
    expect(visibleItems([ghost, cover], vals(), axes, [TOP]).hidden).toEqual([])
    // known list drops 99 from a mixed item: only Top matters
    const mixed = mk(10, 'mixed', { areaIds: [99, TOP] })
    expect(
      visibleItems([mixed, cover], vals(), axes, [TOP]).hidden.map(
        (h) => h.itemId,
      ),
    ).toEqual([10])
    // without a known list ids are taken at face value
    expect(visibleItems([ghost, cover], vals(), axes).hidden).toEqual([
      { itemId: 9, coveredBy: [5] },
    ])
  })

  it('rule conditions may use the own local axis of the cover item', () => {
    // zipper (axis 3) is local to item 7
    const jacket7 = mk(7, 'jacket', {
      areaIds: [OUTER],
      coverRules: [{ conditions: { '3': [30] }, areaIds: [TOP] }],
    })
    const closed = effectiveAxisValues(axes, [{ '3': 30 }])
    const open = effectiveAxisValues(axes, [{ '3': 31 }])
    expect(visibleItems([shirt, jacket7], closed, axes).hidden).toHaveLength(1)
    expect(visibleItems([shirt, jacket7], open, axes).hidden).toHaveLength(0)
    // the axis is not relevant (item 7 not worn) → rule never evaluated
    const rel = relevantAxes(axes, null, [])
    expect(visibleItems([shirt], closed, rel).hidden).toHaveLength(0)
  })

  it('composeParts drops hidden fragments and reports hiddenItemIds', () => {
    const cover = mk(5, 'cape', {
      coverRules: [{ conditions: {}, areaIds: [TOP] }],
    })
    const r = composeParts({
      axes,
      character: null,
      items: [shirt, cover],
      values: vals(),
    })
    expect(r.outfit).toBe('cape')
    expect(r.contributingItemIds).toEqual([5])
    expect(r.hiddenItemIds).toEqual([1])
    expect(r.hidden).toEqual([{ itemId: 1, coveredBy: [5] }])
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
    expect(
      parseCoverRules('[{"conditions":{"1":[2]},"areaIds":[3,"x"]},5,null]'),
    ).toEqual([{ conditions: { '1': [2] }, areaIds: [3] }])
    expect(parseCoverRules('nope')).toEqual([])
  })
})
