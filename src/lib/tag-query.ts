/** Pure helpers for tag autocomplete / Tag Search (query handling, ranking). */

export type SuggestionKind =
  | 'exact'
  | 'alias_exact'
  | 'prefix'
  | 'alias_prefix'
  | 'substring'
  // Korean keyword matches (NAIA data); `via` is the matched keyword
  | 'ko_exact'
  | 'ko_prefix'
  | 'ko_substring'

const KIND_ORDER: Record<SuggestionKind, number> = {
  exact: 0,
  alias_exact: 1,
  ko_exact: 1,
  prefix: 2,
  ko_prefix: 2,
  alias_prefix: 3,
  substring: 4,
  ko_substring: 4,
}

export interface TagCandidate {
  /** Canonical tag name (underscores) */
  name: string
  postCount: number
  category: number
  kind: SuggestionKind
  /** The alias the user typed, when matched via an alias */
  via?: string
}

const LEADING_WEIGHT_RE = /^-?\d*\.?\d+\s*::/
const TRAILING_WEIGHT_RE = /::\s*$/
/** A1111-style emphasis wrapper `(tag)` / `(tag:1.2)` (not an escaped `\(`). */
const PAREN_WRAP_RE = /^\(+([^()]*?)(?::\s*-?\d*\.?\d+)?\)+$/

/**
 * Query text for the tag DB: weight syntax (`1.2::`, trailing `::`, `{}`,
 * `[]`) and `\(` escapes removed, lowercase, spaces -> underscores.
 */
export function normalizeTagQuery(raw: string): string {
  let s = raw.trim()
  for (let i = 0; i < 3; i++) {
    const before = s
    s = s.replace(LEADING_WEIGHT_RE, '').replace(TRAILING_WEIGHT_RE, '')
    s = s
      .replace(/^[{[]+/, '')
      .replace(/[}\]]+$/, '')
      .trim()
    const wrapped = PAREN_WRAP_RE.exec(s)
    if (wrapped) s = wrapped[1].trim()
    if (s === before) break
  }
  return s
    .replace(/\\([()])/g, '$1')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * The tag the caret is typing: text after the last comma/newline, minus a
 * leading weight (`1.2::`) or bracket run. `from` is the document offset where
 * the replaceable text starts. Null when not completing a plain tag.
 */
export function extractTagQuery(
  beforeCursor: string,
): { from: number; query: string; text: string } | null {
  const cut = Math.max(
    beforeCursor.lastIndexOf(','),
    beforeCursor.lastIndexOf('\n'),
  )
  let seg = beforeCursor.slice(cut + 1)
  seg = seg.trimStart()
  for (let i = 0; i < 3; i++) {
    const w = seg.match(LEADING_WEIGHT_RE)
    if (w) seg = seg.slice(w[0].length).trimStart()
    const b = seg.match(/^[{[]+/)
    if (b) seg = seg.slice(b[0].length)
  }
  if (!seg || seg.includes('@{') || /[}\]]/.test(seg)) return null
  const query = normalizeTagQuery(seg)
  if (query.length < 2) return null
  return { from: beforeCursor.length - seg.length, query, text: seg }
}

/** Dedupe by tag (best kind wins) and order by kind, then post count. */
export function rankSuggestions(
  candidates: ReadonlyArray<TagCandidate>,
  limit = 20,
): Array<TagCandidate> {
  const best = new Map<string, TagCandidate>()
  for (const c of candidates) {
    const prev = best.get(c.name)
    if (!prev || KIND_ORDER[c.kind] < KIND_ORDER[prev.kind]) best.set(c.name, c)
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        b.postCount - a.postCount ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit)
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return String(n)
}

/** Underscores -> spaces, the way tags are written in prompts. */
export function tagDisplayName(name: string): string {
  return name.replace(/_/g, ' ')
}

/** Substring search threshold: >=3 ASCII or >=2 non-ASCII characters. */
export function allowsSubstring(query: string): boolean {
  const ascii = Array.from(query).every((ch) => ch.charCodeAt(0) < 128)
  return query.length >= (ascii ? 3 : 2)
}

/**
 * Plan inserting `tag` as its own comma-separated token at `pos` (null or
 * out of range = end of document). Separators already present are respected,
 * so no double commas appear.
 */
export function planTagInsert(
  doc: string,
  pos: number | null,
  tag: string,
): { from: number; to: number; insert: string; cursor: number } {
  const at = pos == null || pos < 0 || pos > doc.length ? doc.length : pos
  const before = doc.slice(0, at)
  const after = doc.slice(at)
  const trimmedBefore = before.replace(/[\s,]+$/, '')
  const prefix = trimmedBefore.length === 0 ? '' : ', '
  const afterTrim = after.replace(/^\s+/, '')
  const hasMore = afterTrim.length > 0 && !afterTrim.startsWith(',')
  const from = trimmedBefore.length
  const to = at + (after.length - afterTrim.length)
  const insert = prefix + tag + (hasMore ? ', ' : '')
  return { from, to, insert, cursor: from + prefix.length + tag.length }
}
