import { buildInfoPanel, categoryBadge, el } from './tag-info-dom'
import { loadTagInfo, translator } from './tag-info-client'
import type { Completion } from '@codemirror/autocomplete'
import type { EditorState, Text } from '@codemirror/state'
import type { TagSuggestion } from '@/server/functions/tag-assist'
import { suggestTags } from '@/server/functions/tag-assist'
import { formatCount, tagDisplayName } from '@/lib/tag-query'
import { extractPromptTokens, normalizeTag } from '@/lib/prompt-tags'

const CATEGORY_TYPE: Record<number, string> = {
  0: 'tag-general',
  1: 'tag-artist',
  3: 'tag-copyright',
  4: 'tag-character',
  5: 'tag-meta',
}

/** Extra row data for tag completions (Completion has no custom fields). */
const meta = new WeakMap<Completion, TagSuggestion>()

function tagToCompletion(s: TagSuggestion): Completion {
  const displayName = tagDisplayName(s.name)
  const completion: Completion = {
    label: displayName,
    type: CATEGORY_TYPE[s.category] ?? 'tag-general',
    apply: displayName,
    info: async () => {
      // Debounce: rapid arrow-key travel only fetches the row it rests on
      await new Promise((r) => setTimeout(r, 140))
      const info = await loadTagInfo(s.name)
      return info ? buildInfoPanel(info) : null
    },
  }
  meta.set(completion, s)
  return completion
}

export async function searchTags(
  query: string,
  limit = 20,
): Promise<Array<Completion>> {
  if (!query || query.trim().length < 2) return []
  try {
    const tags = await suggestTags({ data: { query, limit } })
    return tags.map(tagToCompletion)
  } catch {
    return []
  }
}

// ── row decorations (autocompletion({ addToOptions })) ───────────────────────

const tokenCache = new WeakMap<Text, Set<string>>()

function promptTokens(state: EditorState): Set<string> {
  let set = tokenCache.get(state.doc)
  if (!set) {
    set = new Set(extractPromptTokens(state.doc.toString()))
    tokenCache.set(state.doc, set)
  }
  return set
}

export const tagRowDecorations = [
  {
    position: 55,
    render(completion: Completion): Node | null {
      const s = meta.get(completion)
      if (!s) return null
      return categoryBadge(s.fine, s.top)
    },
  },
  {
    position: 60,
    render(completion: Completion): Node | null {
      const s = meta.get(completion)
      if (!s?.via) return null
      return el('span', 'cm-tag-alias', `← ${tagDisplayName(s.via)}`)
    },
  },
  {
    position: 70,
    render(completion: Completion, state: EditorState): Node | null {
      const s = meta.get(completion)
      if (!s || !promptTokens(state).has(normalizeTag(s.name))) return null
      return el('span', 'cm-tag-inprompt', translator()('tagAssist.inPrompt'))
    },
  },
  {
    position: 90,
    render(completion: Completion): Node | null {
      const s = meta.get(completion)
      if (!s) return null
      return el('span', 'cm-tag-rowcount', formatCount(s.postCount))
    },
  },
]
