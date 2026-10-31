/**
 * Korean tag data (NAIA2.0, GPL-3.0; see THIRD_PARTY_NOTICES.md): constants and
 * pure helpers for Korean keyword search. No I/O.
 */

const HANGUL_RE = /[가-힣]/

/** Whether the text contains a Hangul syllable (jamo alone do not count). */
export function hasHangul(text: string): boolean {
  return HANGUL_RE.test(text)
}

/** Same normalisation the build script applies to keywords. */
export function normalizeKoKeyword(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Lookup forms of a (tag-query-normalised) Korean query: `긴_머리` -> spaced
 * `긴 머리` and the spaceless `긴머리`. Weights/brackets are already stripped.
 */
export function koQueryForms(query: string): Array<string> {
  const spaced = normalizeKoKeyword(query.replace(/_/g, ' '))
  if (!spaced) return []
  const flat = spaced.replace(/ /g, '')
  return flat === spaced ? [spaced] : [spaced, flat]
}

export type KoMatchKind = 'ko_exact' | 'ko_prefix' | 'ko_substring'

/** How `keyword` matches the query forms; null when it does not. */
export function koMatchKind(
  keyword: string,
  forms: ReadonlyArray<string>,
): KoMatchKind | null {
  let best: KoMatchKind | null = null
  for (const f of forms) {
    if (keyword === f) return 'ko_exact'
    if (keyword.startsWith(f)) best = 'ko_prefix'
    else if (!best && f.length >= 2 && keyword.includes(f)) {
      best = 'ko_substring'
    }
  }
  return best
}

export interface KoKeywordRow {
  tag: string
  keyword: string
  /** 0 = plain keyword, 1 = bracketed group token (`<무늬>`) */
  kind: number
  /** Post count (any source) used to order equal matches */
  count: number
}

export interface KoMatch extends KoKeywordRow {
  match: KoMatchKind
}

const MATCH_ORDER: Record<KoMatchKind, number> = {
  ko_exact: 0,
  ko_prefix: 1,
  ko_substring: 2,
}

/**
 * Best keyword match per tag: exact > prefix > substring, plain keywords before
 * group tokens, then higher count, then shorter keyword (closer match).
 */
export function rankKoMatches(
  rows: ReadonlyArray<KoKeywordRow>,
  query: string,
  limit = 20,
): Array<KoMatch> {
  const forms = koQueryForms(query)
  const better = (a: KoMatch, b: KoMatch) =>
    MATCH_ORDER[a.match] - MATCH_ORDER[b.match] ||
    a.kind - b.kind ||
    b.count - a.count ||
    a.keyword.length - b.keyword.length
  const best = new Map<string, KoMatch>()
  for (const r of rows) {
    const match = koMatchKind(r.keyword, forms)
    if (!match) continue
    const cand = { ...r, match }
    const prev = best.get(r.tag)
    if (!prev || better(cand, prev) < 0) best.set(r.tag, cand)
  }
  return [...best.values()]
    .sort((a, b) => better(a, b) || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}
