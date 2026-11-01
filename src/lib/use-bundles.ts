import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { detectPromptStyle } from './style-bundles'
import { normalizeKind, normalizeMode } from './wildcard'
import type { BundleDef } from './wildcard'
import { listBundleNames } from '@/server/functions/bundles'

export function useBundleNames() {
  const { data } = useQuery({
    queryKey: ['bundleNames'],
    queryFn: () => listBundleNames(),
    staleTime: 30_000,
  })

  return data ?? []
}

/** name → bundle definition (kind / wildcard mode included) */
export function useBundleDefs(): Record<string, BundleDef> {
  const names = useBundleNames()
  return useMemo(() => {
    const map: Record<string, BundleDef> = {}
    for (const b of names) {
      map[b.name] = {
        id: b.id,
        name: b.name,
        content: b.content,
        kind: normalizeKind(b.kind),
        wildcardMode: normalizeMode(b.wildcardMode),
        negative: b.negative,
        styleParams: b.styleParams,
      }
    }
    return map
  }, [names])
}

/** Style bundle(s) the general prompt brings (null when none) */
export function usePromptStyle(generalPrompt: string) {
  const defs = useBundleDefs()
  return useMemo(
    () =>
      generalPrompt.includes('@{bundle:')
        ? detectPromptStyle(generalPrompt, Object.values(defs))
        : null,
    [generalPrompt, defs],
  )
}

export function useBundleMap() {
  const names = useBundleNames()
  const map: Record<string, string> = {}
  for (const b of names) {
    map[b.name] = b.content
  }
  return map
}
