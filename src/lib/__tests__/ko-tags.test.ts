import { describe, expect, it } from 'vitest'
import { hasHangul, koMatchKind, koQueryForms, rankKoMatches } from '../ko-tags'

describe('ko tags', () => {
  it('detects Hangul syllables only', () => {
    expect(hasHangul('줄무늬')).toBe(true)
    expect(hasHangul('striped 줄')).toBe(true)
    expect(hasHangul('striped')).toBe(false)
    expect(hasHangul('ㅈㅁ')).toBe(false)
  })

  it('builds spaced and spaceless query forms', () => {
    expect(koQueryForms('긴_머리')).toEqual(['긴 머리', '긴머리'])
    expect(koQueryForms('줄무늬')).toEqual(['줄무늬'])
    expect(koQueryForms('  ')).toEqual([])
  })

  it('classifies keyword matches', () => {
    const f = ['줄무늬']
    expect(koMatchKind('줄무늬', f)).toBe('ko_exact')
    expect(koMatchKind('줄무늬 셔츠', f)).toBe('ko_prefix')
    expect(koMatchKind('가로 줄무늬', f)).toBe('ko_substring')
    expect(koMatchKind('체크', f)).toBeNull()
    // one-character queries never match inside a keyword
    expect(koMatchKind('가로줄', ['줄'])).toBeNull()
    expect(koMatchKind('줄무늬', ['줄'])).toBe('ko_prefix')
  })

  it('ranks exact > prefix > substring, then count', () => {
    const rows = [
      { tag: 'striped_shirt', keyword: '줄무늬 셔츠', kind: 0, count: 9000 },
      { tag: 'vertical_stripes', keyword: '세로 줄무늬', kind: 0, count: 5000 },
      { tag: 'striped', keyword: '줄무늬', kind: 0, count: 100 },
      { tag: 'striped', keyword: '무늬', kind: 1, count: 100 },
      { tag: 'plaid', keyword: '무늬', kind: 1, count: 80000 },
    ]
    const out = rankKoMatches(rows, '줄무늬')
    expect(out.map((r) => [r.tag, r.match])).toEqual([
      ['striped', 'ko_exact'],
      ['striped_shirt', 'ko_prefix'],
      ['vertical_stripes', 'ko_substring'],
    ])
    expect(out[0].keyword).toBe('줄무늬')
  })

  it('prefers plain keywords over group tokens at equal match', () => {
    const rows = [
      { tag: 'a', keyword: '양말', kind: 1, count: 10 },
      { tag: 'b', keyword: '양말', kind: 0, count: 1 },
    ]
    expect(rankKoMatches(rows, '양말').map((r) => r.tag)).toEqual(['b', 'a'])
  })
})
