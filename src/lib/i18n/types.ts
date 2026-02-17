export type Locale = 'en' | 'ko'

type PathsToStringProps<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: PathsToStringProps<
        T[K],
        Prefix extends '' ? K : `${Prefix}.${K}`
      >
    }[keyof T & string]

export type TranslationKeys = PathsToStringProps<typeof import('./en').default>

/** Recursively widens all string literal types to `string` while preserving object structure */
export type DeepStringify<T> = T extends string
  ? string
  : { [K in keyof T]: DeepStringify<T[K]> }
