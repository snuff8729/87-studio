import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createT } from './t'
import type { Locale, TranslationKeys } from './types'

const STORAGE_KEY = '87studio-locale'
const DEFAULT_LOCALE: Locale = 'en'

const SUPPORTED_LOCALES: Array<Locale> = ['en', 'ko']

function detectBrowserLocale(): Locale | null {
  if (typeof navigator === 'undefined') return null
  const languages = navigator.languages ?? [navigator.language]
  for (const lang of languages) {
    const code = lang.toLowerCase().split('-')[0]
    if (SUPPORTED_LOCALES.includes(code as Locale)) return code as Locale
  }
  return null
}

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'ko') return stored
  return detectBrowserLocale() ?? DEFAULT_LOCALE
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale)

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    localStorage.setItem(STORAGE_KEY, newLocale)
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = useMemo(() => createT(locale), [locale])

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

const fallbackT = createT('en')
const fallbackValue: I18nContextValue = {
  locale: 'en',
  setLocale: () => {},
  t: fallbackT,
}

export function useTranslation() {
  const ctx = useContext(I18nContext)
  return ctx ?? fallbackValue
}
