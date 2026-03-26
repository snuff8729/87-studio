import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { settings } from '../db/schema'
import { createLogger } from '../services/logger'

const log = createLogger('fn.settings')

export const getSetting = createServerFn({ method: 'GET' })
  .inputValidator((key: string) => key)
  .handler(async ({ data: key }) => {
    const row = db.select().from(settings).where(eq(settings.key, key)).get()
    return row?.value ?? null
  })

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

    try {
      const response = await fetch(
        'https://api.novelai.net/user/subscription',
        {
          headers: { Authorization: `Bearer ${apiKey}` },
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
