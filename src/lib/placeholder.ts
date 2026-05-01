const SLOT_RE = /@\{slot:([^}]+)\}/g

export function extractPlaceholders(template: string): Array<string> {
  const keys = new Set<string>()
  for (const match of template.matchAll(SLOT_RE)) {
    keys.add(match[1])
  }
  return [...keys]
}

export function resolvePlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(SLOT_RE, (_, key) => values[key] ?? '')
}
