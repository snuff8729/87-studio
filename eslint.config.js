//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      // tsconfig has no `noUncheckedIndexedAccess`, so indexed reads (arr[i],
      // record[key], JSON.parse results) are typed as always-defined. The
      // defensive `?.` / `??` guards on them are intentional runtime safety.
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
]
