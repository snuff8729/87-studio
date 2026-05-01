const BUNDLE_RE = /@\{bundle:([^}]+)\}/g

export function extractBundleReferences(template: string): Array<string> {
  const names = new Set<string>()
  for (const match of template.matchAll(BUNDLE_RE)) {
    if (match[1]) names.add(match[1])
  }
  return [...names]
}

export function resolveBundles(
  template: string,
  bundleMap: Record<string, string>,
): string {
  return template.replace(BUNDLE_RE, (_, name) => bundleMap[name] ?? '')
}
