import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete'

// In-memory tag database (loaded on first use)
let tagDatabase: Array<{ name: string; category: number; postCount: number }> = []
let loaded = false

export async function loadTagDatabase() {
  if (loaded) return
  try {
    const response = await fetch('/danbooru-tags.json')
    if (response.ok) {
      tagDatabase = await response.json()
    }
  } catch {
    // Tags file not available yet, that's fine
  }
  loaded = true
}


function searchTags(query: string, limit = 15): Completion[] {
  if (!query || tagDatabase.length === 0) return []

  const lower = query.toLowerCase()
  const matches = tagDatabase
    .filter((t) => t.name.includes(lower))
    .sort((a, b) => {
      // Exact prefix match first
      const aPrefix = a.name.startsWith(lower) ? 0 : 1
      const bPrefix = b.name.startsWith(lower) ? 0 : 1
      if (aPrefix !== bPrefix) return aPrefix - bPrefix
      return b.postCount - a.postCount
    })
    .slice(0, limit)

  return matches.map((t) => ({
    label: t.name.replace(/_/g, ' '),
    detail: `${formatCount(t.postCount)}`,
    type: 'tag',
    apply: t.name.replace(/_/g, ' '),
  }))
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function danbooruCompletion(context: CompletionContext): CompletionResult | null {
  // Trigger after comma or at start of tag
  const beforeCursor = context.state.sliceDoc(0, context.pos)
  const lastComma = beforeCursor.lastIndexOf(',')
  const afterComma = beforeCursor.slice(lastComma + 1).trimStart()

  if (afterComma.length < 2) return null

  const from = context.pos - afterComma.length
  const options = searchTags(afterComma)

  if (options.length === 0) return null

  return {
    from,
    options,
    validFor: /^[^\s,]*$/,
  }
}
