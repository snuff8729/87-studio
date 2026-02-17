import type { Locale, TranslationKeys, DeepStringify } from './types'
import en from './en'
import ko from './ko'

const translations: Record<Locale, DeepStringify<typeof en>> = { en, ko }

function resolve(obj: unknown, path: string): string {
  let current = obj
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return path
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' ? current : path
}

export function createT(locale: Locale) {
  const dict = translations[locale]
  return function t(key: TranslationKeys, params?: Record<string, string | number>): string {
    let result = resolve(dict, key)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replaceAll(`{{${k}}}`, String(v))
      }
    }
    return result
  }
}
