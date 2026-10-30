/**
 * Whole-token tag matching inside resolved prompts. A prompt is a comma
 * separated list; a token may carry NAI weights (`1.2::tag`, `tag::`), brace /
 * bracket emphasis (`{tag}`, `[tag]`), escaped parentheses (`miku \(vocaloid\)`)
 * or a `tag:1.2` weight suffix.
 */

const LEADING_WEIGHT_RE = /^-?\d*\.?\d+\s*::/
const TRAILING_WEIGHT_RE = /::\s*$/
const SUFFIX_WEIGHT_RE = /:-?\d*\.?\d+$/

/** Canonical form: lowercase, `_` → space, collapsed whitespace. */
export function normalizeTag(raw: string): string {
  return raw.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function cleanToken(token: string): string {
  let s = token.trim().replace(/\\([()])/g, '$1')
  // Weights can stack with emphasis, e.g. `1.2::{tag}::`
  for (let i = 0; i < 4; i++) {
    const before = s
    s = s.replace(LEADING_WEIGHT_RE, '').replace(TRAILING_WEIGHT_RE, '').trim()
    s = s
      .replace(/^[{[]+/, '')
      .replace(/[}\]]+$/, '')
      .trim()
    if (s === before) break
  }
  s = s.replace(SUFFIX_WEIGHT_RE, '').trim()
  return normalizeTag(s)
}

/** The normalized tag tokens of a prompt (comma / newline separated). */
export function extractPromptTokens(prompt: string): Array<string> {
  return prompt
    .split(/[,\n]/)
    .map(cleanToken)
    .filter((t) => t.length > 0)
}

/** True when `tag` is one whole token of `prompt` (case/underscore-insensitive). */
export function promptHasTag(prompt: string, tag: string): boolean {
  const want = normalizeTag(tag)
  if (!want) return false
  return extractPromptTokens(prompt).includes(want)
}

/** The positive prompts stored in a generated image's metadata JSON. */
export function positivePromptsOf(metadataJson: string | null): Array<string> {
  if (!metadataJson) return []
  try {
    const prompts = (
      JSON.parse(metadataJson) as {
        prompts?: {
          generalPrompt?: unknown
          characterPrompts?: Array<{ prompt?: unknown }>
        }
      }
    ).prompts
    if (!prompts) return []
    const out: Array<string> = []
    if (typeof prompts.generalPrompt === 'string') {
      out.push(prompts.generalPrompt)
    }
    for (const c of prompts.characterPrompts ?? []) {
      if (typeof c.prompt === 'string') out.push(c.prompt)
    }
    return out
  } catch {
    return []
  }
}

/** True when any positive prompt in the metadata JSON contains the tag. */
export function metadataHasPromptTag(
  metadataJson: string | null,
  tag: string,
): boolean {
  return positivePromptsOf(metadataJson).some((p) => promptHasTag(p, tag))
}

/**
 * Plain-text fragments (superset test) for a SQL LIKE pre-filter: the longest
 * parenthesis-free part of the tag in both `foo bar` and `foo_bar` spellings.
 * Any row that matches the tag exactly contains at least one of them.
 */
export function likeFragments(tag: string): Array<string> {
  const parts = normalizeTag(tag).split(/[()]/)
  let longest = ''
  for (const p of parts) {
    if (p.trim().length > longest.length) longest = p.trim()
  }
  if (!longest) return []
  return [...new Set([longest, longest.replace(/ /g, '_')])]
}
