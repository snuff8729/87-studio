import type en from './en'

export type Locale = 'en' | 'ko'

type PathsToStringProps<T, TPrefix extends string = ''> = T extends string
  ? TPrefix
  : {
      [K in keyof T & string]: PathsToStringProps<
        T[K],
        TPrefix extends '' ? K : `${TPrefix}.${K}`
      >
    }[keyof T & string]

export type TranslationKeys = PathsToStringProps<typeof en>

/** Recursively widens all string literal types to `string` while preserving object structure */
export type DeepStringify<T> = T extends string
  ? string
  : { [K in keyof T]: DeepStringify<T[K]> }
