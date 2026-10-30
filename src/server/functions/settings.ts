import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { settings } from '../db/schema'
import { createLogger } from '../services/logger'
import { NAI_MOCK } from '../services/nai-mock'
import { fetchNaiAccount } from '../services/nai-account'

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
      return { valid: false, error: 'empty' as const, account: null }
    }
    const result = await fetchNaiAccount(apiKey)
    if (result.ok) {
      return { valid: true, error: null, account: result.summary }
    }
    return { valid: false, error: result.error, account: null }
  })

/** Account summary (Anlas, tier, usage) for the saved key; null when unavailable. */
export const getNaiAccount = createServerFn({ method: 'GET' }).handler(
  async () => {
    const row = db
      .select()
      .from(settings)
      .where(eq(settings.key, 'nai_api_key'))
      .get()
    const key = row?.value?.trim() || (NAI_MOCK ? 'mock' : '')
    if (!key) return null
    const result = await fetchNaiAccount(key)
    return result.ok ? result.summary : null
  },
)

export const getAllSettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db.select().from(settings).all()
  },
)
