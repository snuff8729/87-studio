import { NAI_MOCK } from './nai-mock'

export interface NaiAccountSummary {
  tier: number
  opus: boolean
  anlas: { fixed: number; purchased: number; total: number }
  usage: {
    percent: number
    isNegative: boolean
    secondsUntilNextPercent: number | null
  } | null
}

export type NaiAccountResult =
  | { ok: true; summary: NaiAccountSummary }
  | { ok: false; error: 'unauthorized' | 'network' | 'unknown' }

const SUBSCRIPTION_URL = 'https://image.novelai.net/user/subscription'
const TIMEOUT_MS = 8_000

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Parse the /user/subscription JSON body (pure; exported for testing). */
export function parseSubscription(body: unknown): NaiAccountSummary {
  const b = (body ?? {}) as Record<string, any>
  const fixed = num(b.trainingStepsLeft?.fixedTrainingStepsLeft)
  const purchased = num(b.trainingStepsLeft?.purchasedTrainingSteps)
  const u = b.usage
  return {
    tier: num(b.tier),
    opus: b.perks?.unlimitedMaxPriority === true,
    anlas: { fixed, purchased, total: fixed + purchased },
    usage:
      u && typeof u === 'object'
        ? {
            percent: num(u.percent),
            isNegative: u.isNegative === true,
            secondsUntilNextPercent:
              typeof u.timeUntilNextPercent === 'number'
                ? u.timeUntilNextPercent
                : null,
          }
        : null,
  }
}

const MOCK_SUMMARY: NaiAccountSummary = {
  tier: 3,
  opus: true,
  anlas: { fixed: 10000, purchased: 4932, total: 14932 },
  usage: { percent: 100, isNegative: false, secondsUntilNextPercent: 7888 },
}

/** Fetch the account summary (8s timeout, one retry on timeout/network error). */
export async function fetchNaiAccount(
  apiKey: string,
): Promise<NaiAccountResult> {
  if (NAI_MOCK) return { ok: true, summary: MOCK_SUMMARY }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(SUBSCRIPTION_URL, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.ok) {
        return { ok: true, summary: parseSubscription(await res.json()) }
      }
      if (res.status === 401) return { ok: false, error: 'unauthorized' }
      return { ok: false, error: 'unknown' }
    } catch {
      if (attempt === 1) return { ok: false, error: 'network' }
    }
  }
  return { ok: false, error: 'network' }
}
