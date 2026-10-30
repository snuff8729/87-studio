import { describe, it, expect } from 'vitest'
import { parseSubscription } from '../nai-account'

describe('parseSubscription', () => {
  it('parses a full response', () => {
    const r = parseSubscription({
      tier: 3,
      perks: { unlimitedMaxPriority: true },
      trainingStepsLeft: {
        fixedTrainingStepsLeft: 10000,
        purchasedTrainingSteps: 4932,
      },
      usage: { percent: 100, isNegative: false, timeUntilNextPercent: 7888 },
    })
    expect(r.opus).toBe(true)
    expect(r.anlas).toEqual({ fixed: 10000, purchased: 4932, total: 14932 })
    expect(r.usage).toEqual({
      percent: 100,
      isNegative: false,
      secondsUntilNextPercent: 7888,
    })
  })
  it('tolerates missing fields', () => {
    const r = parseSubscription({})
    expect(r).toEqual({
      tier: 0,
      opus: false,
      anlas: { fixed: 0, purchased: 0, total: 0 },
      usage: null,
    })
  })
})
