import { describe, expect, it } from 'vitest'
import {
  groupFor,
  normalizeTagName,
  parseKeywords,
} from '../../../scripts/build-ko-tags.mjs'

const lookup = new Map([
  ['패션', '의상/패션'],
  ['헤어스타일', '신체/외형'],
  ['신체', '신체/외형'],
  ['노출', '성적 요소'],
  ['자세', '포즈/동작'],
])

describe('build-ko-tags helpers', () => {
  it('parses plain, group-token and prefixed keywords', () => {
    expect(parseKeywords('<무늬>, 줄무늬, 스트라이프')).toEqual([
      { keyword: '무늬', kind: 1 },
      { keyword: '줄무늬', kind: 0 },
      { keyword: '스트라이프', kind: 0 },
    ])
    expect(parseKeywords('<primary>:여성 1명, 여자  1명, 여성 1명')).toEqual([
      { keyword: '여성 1명', kind: 0 },
      { keyword: '여자 1명', kind: 0 },
    ])
    expect(parseKeywords('')).toEqual([])
    expect(parseKeywords(null)).toEqual([])
  })

  it('normalises tag names', () => {
    expect(normalizeTagName('long hair')).toBe('long_hair')
    expect(normalizeTagName(String.raw`fate_\(series\)`)).toBe('fate_(series)')
    expect(normalizeTagName(String.raw`Star \(symbol\)`)).toBe('star_(symbol)')
  })

  it('groups by sub category first, then top, then our supplement', () => {
    expect(groupFor('패션 > 헤어스타일', lookup)).toBe('신체/외형')
    expect(groupFor('패션 > 상의', lookup)).toBe('의상/패션')
    expect(groupFor('신체 > 노출', lookup)).toBe('성적 요소')
    expect(groupFor('신체 > 자세', lookup)).toBe('포즈/동작')
    expect(groupFor('인물 > 인원수', lookup)).toBe('인물/종족')
    expect(groupFor('인물 > 눈', lookup)).toBe('신체/외형')
    expect(groupFor('전혀 > 모름', lookup)).toBeNull()
  })
})
