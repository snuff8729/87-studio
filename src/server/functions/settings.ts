import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { settings } from '../db/schema'
import { createLogger } from '../services/logger'
import { NAI_MOCK } from '../services/nai-mock'

const log = createLogger('fn.settings')

export const getSetting = createServerFn({ method: 'GET' })
  .inputValidator((key: string) => key)
  .handler(async ({ data: key }) => {
    const row = db.select().from(settings).where(eq(settings.key, key)).get()
    // Mock mode needs no real key; keep key-presence checks in the UI passing.
    if (NAI_MOCK && key === 'nai_api_key' && !row?.value) return 'mock'
    return row?.value ?? null
  })

export const getAppInfo = createServerFn({ method: 'GET' }).handler(
  async () => ({ naiMock: NAI_MOCK }),
)

export const setSetting = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string; value: string }) => data)
  .handler(async ({ data }) => {
    db.insert(settings)
      .values({ key: data.key, value: data.value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: data.value, updatedAt: new Date().toISOString() },
      })
      .run()

    const displayValue = data.key.includes('api_key')
      ? '***masked***'
      : data.value
    log.info('setSetting', 'Setting updated', {
      key: data.key,
      value: displayValue,
    })

    return { success: true }
  })

export const validateApiKey = createServerFn({ method: 'POST' })
  .inputValidator((apiKey: string) => apiKey)
  .handler(async ({ data: apiKey }) => {
    if (!apiKey.trim()) {
      return { valid: false, error: 'empty' as const }
    }
    if (NAI_MOCK) return { valid: true, error: null }

    try {
      // NAI moved /user/* to image.novelai.net (2026-07); the api.novelai.net
      // path now answers 401 "User not found" for every token
      const response = await fetch(
        'https://image.novelai.net/user/subscription',
        {
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
          signal: AbortSignal.timeout(10_000),
        },
      )

      if (response.ok) {
        return { valid: true, error: null }
      }

      if (response.status === 401) {
        return { valid: false, error: 'unauthorized' as const }
      }

      return { valid: false, error: 'unknown' as const }
    } catch {
      return { valid: false, error: 'network' as const }
    }
  })

export const getAllSettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db.select().from(settings).all()
  },
)
