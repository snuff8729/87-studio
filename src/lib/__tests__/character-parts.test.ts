import { describe, expect, it } from 'vitest'
import {
  applyParts,
  canSetParent,
  cleanCoverRuleConditions,
  composeParts,
  effectiveAxisValues,
  extractVarNames,
  groupAreas,
  matchesCondition,
  outfitEntriesMatch,
  parseAxisValues,
  parseCoverRules,
  parseIdList,
  parseOutfitEntries,
  parseVariables,
  relevantAxes,
  renameVarInText,
  resolveVarValues,
  stringifyOutfitEntries,
  substituteVars,
  visibleItems,
} from '../character-parts'
import type {
  CoverRule,
  PartsAxis,
  PartsFragment,
  PartsItem,
} from '../character-parts'

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
      partial: [],
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
      partial: [],
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
      partial: [],
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

describe('nested areas + fragment areas', () => {
  const TOP = 1
  const ARMS = 2
  const CHEST = 3
  const areas = [
    { id: TOP, parentId: null },
    { id: ARMS, parentId: TOP },
    { id: CHEST, parentId: TOP },
  ]
  const f = (
    id: number,
    text: string,
    areaIds?: Array<number>,
  ): PartsFragment => ({
    id,
    text,
    conditions: {},
    areaIds,
  })
  const shirt: PartsItem = {
    id: 1,
    conditions: {},
    areaIds: [TOP],
    fragments: [f(11, 'white shirt'), f(12, 'long sleeves', [ARMS])],
  }
  const cover = (areaIds: Array<number>, id = 9): PartsItem => ({
    id,
    conditions: {},
    fragments: [f(id * 10, 'jacket')],
    coverRules: [{ conditions: {}, areaIds }],
  })

  it('covering a parent covers its children', () => {
    const r = visibleItems([shirt, cover([TOP])], {}, axes, areas)
    expect(r.hidden).toEqual([{ itemId: 1, coveredBy: [9] }])
    expect(r.items[0].fully).toBe(true)
  })

  it('covering a child does not cover the parent; fragment-level partial', () => {
    const r = visibleItems([shirt, cover([ARMS])], {}, axes, areas)
    expect(r.hidden).toEqual([])
    expect(r.items[0]).toMatchObject({
      itemId: 1,
      hiddenFragmentIds: [12],
      fully: false,
      coveredBy: [9],
    })
    const c = composeParts({
      axes,
      character: null,
      items: [shirt, cover([ARMS])],
      values: {},
      areas,
    })
    expect(c.outfit).toBe('white shirt, jacket')
    expect(c.hiddenItemIds).toEqual([])
    expect(c.partial).toEqual([
      {
        itemId: 1,
        fragmentIds: [12],
        coveredBy: [9],
        details: [{ fragmentId: 12, coveredBy: [9] }],
      },
    ])
    expect(c.contributingItemIds).toEqual([1, 9])
  })

  it('fragment without own areas inherits the item areas; own areas override', () => {
    const r = visibleItems([shirt, cover([CHEST])], {}, axes, areas)
    expect(r.items[0].hiddenFragmentIds).toEqual([])
    const chestOnly: PartsItem = {
      ...shirt,
      fragments: [f(11, 'a', [CHEST]), f(12, 'b')],
    }
    const r2 = visibleItems([chestOnly, cover([CHEST])], {}, axes, areas)
    expect(r2.items[0].hiddenFragmentIds).toEqual([11])
  })

  it('fragments without effective areas are never hidden; unmatching ones do not count', () => {
    const free: PartsItem = {
      id: 1,
      conditions: {},
      fragments: [f(11, 'ribbon')],
    }
    expect(visibleItems([free, cover([TOP])], {}, axes, areas).hidden).toEqual(
      [],
    )
    const view1: PartsItem = {
      ...shirt,
      fragments: [
        { ...f(11, 'front'), conditions: { '1': [10] } },
        { ...f(12, 'back'), conditions: { '1': [12] } },
      ],
    }
    const v = effectiveAxisValues(axes, [{ '1': 12 }])
    expect(
      visibleItems([view1, cover([TOP])], v, axes, areas).hidden,
    ).toHaveLength(1)
  })

  it('an item with no matching fragments is empty, not hidden', () => {
    const empty: PartsItem = { ...shirt, fragments: [] }
    const r = visibleItems([empty, cover([TOP])], {}, axes, areas)
    expect(r.hidden).toEqual([])
    expect(r.items[0].fully).toBe(false)
  })

  it('groupAreas / canSetParent enforce one level', () => {
    expect(
      groupAreas(areas).map((g) => [g.area.id, g.children.map((c) => c.id)]),
    ).toEqual([[TOP, [ARMS, CHEST]]])
    const flat = [...areas, { id: 4, parentId: null }]
    expect(canSetParent(flat, 4, TOP)).toBe(true)
    expect(canSetParent(flat, TOP, 4)).toBe(false)
    expect(canSetParent(flat, 4, ARMS)).toBe(false)
    expect(canSetParent(flat, 4, 4)).toBe(false)
    expect(canSetParent(flat, ARMS, null)).toBe(true)
  })
})

describe('outfit entries + variables', () => {
  it('parses legacy number[] and entries tolerantly', () => {
    expect(parseOutfitEntries('[1,2]')).toEqual([{ id: 1 }, { id: 2 }])
    expect(
      parseOutfitEntries([
        { id: 3, vars: { color: 'red', x: '' } },
        4,
        'z',
        {},
      ]),
    ).toEqual([{ id: 3, vars: { color: 'red' } }, { id: 4 }])
    expect(parseOutfitEntries('bad')).toEqual([])
    expect(stringifyOutfitEntries([1, { id: 2, vars: { a: 'b' } }])).toBe(
      '[{"id":1},{"id":2,"vars":{"a":"b"}}]',
    )
  })

  it('parseVariables trims, dedupes, defaults to empty string', () => {
    expect(
      parseVariables(
        '[{"name":" color ","default":"white"},{"name":"color"},{"name":"s"}]',
      ),
    ).toEqual([
      { name: 'color', default: 'white' },
      { name: 's', default: '' },
    ])
  })

  it('resolves entry value, else default; unknown var -> empty', () => {
    const defs = [{ name: 'color', default: 'white' }]
    expect(resolveVarValues(defs, { color: 'red' })).toEqual({ color: 'red' })
    expect(resolveVarValues(defs, { color: '' })).toEqual({ color: 'white' })
    expect(resolveVarValues(defs, undefined)).toEqual({ color: 'white' })
    expect(
      substituteVars('@{var:color} shirt, @{var:nope}x', { color: 'red' }),
    ).toBe('red shirt, x')
  })

  it('composeParts substitutes in item fragments and strips in character fragments', () => {
    const item: PartsItem = {
      id: 1,
      conditions: {},
      fragments: [frag(1, '@{var:color} shirt'), frag(2, '@{var:gone}')],
      varValues: { color: 'red' },
    }
    const character = {
      id: 5,
      fragments: [frag(9, '1girl, @{var:color}')],
    }
    const r = composeParts({ axes, character, items: [item], values: {} })
    expect(r.outfit).toBe('red shirt')
    expect(r.char).toBe('1girl')
    expect(r.contributingItemIds).toEqual([1])
  })

  it('extract / rename var tokens', () => {
    expect(extractVarNames('@{var:a}, @{var: b }, @{var:a}')).toEqual([
      'a',
      'b',
    ])
    expect(renameVarInText('@{var:a} and @{var:ab}', 'a', 'c')).toBe(
      '@{var:c} and @{var:ab}',
    )
  })

  it('preset match: same sequence and same resolved values', () => {
    const defs = (id: number) =>
      id === 1 ? [{ name: 'color', default: 'white' }] : undefined
    const m = (
      a: Array<{ id: number; vars?: Record<string, string> }>,
      b: typeof a,
    ) => outfitEntriesMatch(a, b, defs)
    expect(m([{ id: 1 }], [{ id: 1, vars: { color: 'white' } }])).toBe(true)
    expect(m([{ id: 1, vars: { color: 'red' } }], [{ id: 1 }])).toBe(false)
    expect(m([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }])).toBe(false)
    expect(m([{ id: 1 }], [{ id: 1 }, { id: 2 }])).toBe(false)
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

describe('cleanCoverRuleConditions', () => {
  const rules: Array<CoverRule> = [
    { conditions: { '1': [10, 11] }, areaIds: [1] },
    { conditions: { '2': [20] }, areaIds: [2] },
    { conditions: {}, areaIds: [3] },
  ]
  it('drops rules referencing a deleted axis', () => {
    expect(cleanCoverRuleConditions(rules, 1)).toEqual([rules[1], rules[2]])
  })
  it('removes a deleted value but keeps the rule (empty = never)', () => {
    const out = cleanCoverRuleConditions(rules, 2, 20)
    expect(out[1]).toEqual({ conditions: { '2': [] }, areaIds: [2] })
    expect(out).toHaveLength(3)
  })
})
