const BUNDLE_RE = /@\{([^}]+)\}/g

export function extractBundleReferences(template: string): string[] {
  const names = new Set<string>()
  for (const match of template.matchAll(BUNDLE_RE)) {
    names.add(match[1])
  }
  return [...names]
}

export function resolveBundles(
  template: string,
  bundleMap: Record<string, string>,
): string {
  return template.replace(BUNDLE_RE, (_, name) => bundleMap[name] ?? '')
}
