const PLACEHOLDER_RE = /\\\\(\w+)\\\\/g

export function extractPlaceholders(template: string): Array<string> {
  const keys = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    keys.add(match[1])
  }
  return [...keys]
}

export function resolvePlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER_RE, (_, key) => values[key] ?? '')
}
