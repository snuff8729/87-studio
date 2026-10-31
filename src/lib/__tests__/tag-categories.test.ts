import { describe, expect, it } from 'vitest'
import {
  GENERAL_TOP_CATEGORIES,
  GROUP_RULES,
  TAG_CATEGORIES,
  classifyTag,
  fineLabel,
  getCategoryDef,
  isKoFine,
  koFineKey,
  topCategoryOf,
} from '../tag-categories'

const fine = (name: string, groups: Array<string> = []) =>
  classifyTag({ name, category: 0, groups }).fine

describe('tag categories', () => {
  it('every rule targets a defined category', () => {
    for (const r of Object.values(GROUP_RULES)) {
      expect(getCategoryDef(r.category), r.category).toBeDefined()
    }
    for (const c of TAG_CATEGORIES) {
      expect(getCategoryDef(c.parent)).toBeDefined()
    }
  })

  it('keeps Danbooru categories for non-general tags', () => {
    expect(classifyTag({ name: 'hatsune_miku', category: 4 }).fine).toBe(
      'character',
    )
    expect(classifyTag({ name: 'fate_(series)', category: 3 }).top).toBe(
      'copyright',
    )
    expect(classifyTag({ name: 'someone', category: 1 }).top).toBe('artist')
    expect(classifyTag({ name: 'highres', category: 5 }).top).toBe('meta')
  })

  it('maps clothing by name with color prefixes', () => {
    expect(fine('black_skirt')).toBe('cloth_bottom')
    expect(fine('white_shirt')).toBe('cloth_top')
    expect(fine('black_thighhighs')).toBe('cloth_legwear')
    expect(fine('brown_footwear')).toBe('cloth_footwear')
    expect(fine('striped_bikini')).toBe('cloth_swim')
    expect(fine('white_panties')).toBe('cloth_under')
    expect(topCategoryOf(fine('white_hat'))).toBe('fashion')
  })

  it('separates hair color from hair style and eyes', () => {
    expect(fine('blonde_hair')).toBe('hair_color')
    expect(fine('long_hair')).toBe('hair_style')
    expect(fine('blue_eyes')).toBe('eyes')
    expect(fine('hair_between_eyes')).toBe('bangs')
  })

  it('name rules beat noisy groups, specific groups beat broad ones', () => {
    // ponytail is in hair_styles and tail
    expect(fine('ponytail', ['tag_group:tail', 'tag_group:hair_styles'])).toBe(
      'hair_style',
    )
    // outdoors is in locations and flowers
    expect(fine('outdoors', ['tag_group:flowers', 'tag_group:locations'])).toBe(
      'outdoor',
    )
    // group-only tag
    expect(fine('weird_tag', ['tag_group:gestures'])).toBe('gesture')
    expect(
      fine('weird_tag', ['tag_group:food_tags', 'tag_group:gestures']),
    ).toBe('gesture')
  })

  it('falls back to misc', () => {
    expect(classifyTag({ name: 'zzzz_unknown', category: 0 })).toEqual({
      top: 'misc',
      fine: 'misc',
    })
  })

  it('does not mistake _body composition tags for body type', () => {
    expect(fine('full_body')).toBe('composition')
  })

  it('rule sub categories roll up into the NAIA groups', () => {
    expect(topCategoryOf(fine('1girl'))).toBe('people')
    expect(topCategoryOf(fine('blonde_hair'))).toBe('body')
    expect(topCategoryOf(fine('full_body'))).toBe('situation')
    expect(topCategoryOf('expression')).toBe('emotion')
    expect(topCategoryOf(fine('nude'))).toBe('sexual')
    for (const c of GENERAL_TOP_CATEGORIES) {
      expect(getCategoryDef(c)?.parent, c).toBe(c)
    }
    expect(GENERAL_TOP_CATEGORIES).toHaveLength(12)
  })

  it('NAIA small categories become ko: fine keys with locale labels', () => {
    expect(koFineKey('패션 > 헤어스타일')).toBe('ko:헤어스타일')
    expect(koFineKey('소품')).toBe('ko:소품')
    expect(isKoFine('ko:소품')).toBe(true)
    expect(isKoFine('cloth_top')).toBe(false)
    expect(fineLabel('ko:헤어스타일', 'body', 'ko')).toBe('헤어스타일')
    expect(fineLabel('ko:헤어스타일', 'body', 'en')).toBe('Body')
    expect(fineLabel('cloth_top', 'fashion', 'en')).toBe('Top')
  })
})
