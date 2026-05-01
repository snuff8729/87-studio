import type { Completion } from '@codemirror/autocomplete'
import {
  searchDanbooruTags,
  type DanbooruTag,
} from '@/server/functions/danbooru'

const CATEGORY_TYPE: Record<number, string> = {
  0: 'tag-general',
  1: 'tag-artist',
  3: 'tag-copyright',
  4: 'tag-character',
  5: 'tag-meta',
}

const CATEGORY_LABEL: Record<number, string> = {
  0: 'general',
  1: 'artist',
  3: 'copyright',
  4: 'character',
  5: 'meta',
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function tagToCompletion(t: DanbooruTag): Completion {
  const displayName = t.name.replace(/_/g, ' ')
  return {
    label: displayName,
    detail: `${CATEGORY_LABEL[t.category] ?? 'tag'} · ${formatCount(t.postCount)}`,
    type: CATEGORY_TYPE[t.category] ?? 'tag-general',
    apply: displayName,
  }
}

export async function searchTags(
  query: string,
  limit = 15,
): Promise<Array<Completion>> {
  if (!query || query.length < 2) return []

  try {
    const tags = await searchDanbooruTags({
      data: { query: query.toLowerCase(), limit },
    })
    return tags.map(tagToCompletion)
  } catch {
    return []
  }
}
