import { describe, expect, it } from 'vitest'
import { planPlaceholderSaves } from '../placeholder-save-plan'

describe('planPlaceholderSaves', () => {
  it('returns nothing for no local edits', () => {
    expect(planPlaceholderSaves({}, { a: '1' }, {})).toEqual({
      general: null,
      characters: [],
    })
  })

  it('merges general edits over the scene placeholders', () => {
    const plan = planPlaceholderSaves(
      { 'g:a': 'new' },
      { a: 'old', b: 'keep' },
      {},
    )
    expect(plan.general).not.toBeNull()
    expect(JSON.parse(plan.general!)).toEqual({ a: 'new', b: 'keep' })
    expect(plan.characters).toEqual([])
  })

  it('merges character edits over existing overrides per character', () => {
    const plan = planPlaceholderSaves(
      { 'c:7:pose': 'sit', 'c:7:mood': 'calm', 'c:9:pose': 'run' },
      {},
      { 7: { pose: 'stand', extra: 'x' } },
    )
    expect(plan.general).toBeNull()
    const byId = Object.fromEntries(
      plan.characters.map((c) => [c.charId, JSON.parse(c.json)]),
    )
    expect(byId).toEqual({
      7: { pose: 'sit', extra: 'x', mood: 'calm' },
      9: { pose: 'run' },
    })
  })

  it('handles general and character edits together', () => {
    const plan = planPlaceholderSaves({ 'g:a': '1', 'c:3:b': '2' }, {}, {})
    expect(JSON.parse(plan.general!)).toEqual({ a: '1' })
    expect(plan.characters).toEqual([{ charId: 3, json: '{"b":"2"}' }])
  })
})
