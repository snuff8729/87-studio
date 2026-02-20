import { useQuery } from '@tanstack/react-query'
import { listBundleNames } from '@/server/functions/bundles'

export function useBundleNames() {
  const { data } = useQuery({
    queryKey: ['bundleNames'],
    queryFn: () => listBundleNames(),
    staleTime: 30_000,
  })

  return data ?? []
}

export function useBundleMap() {
  const names = useBundleNames()
  const map: Record<string, string> = {}
  for (const b of names) {
    map[b.name] = b.content
  }
  return map
}
