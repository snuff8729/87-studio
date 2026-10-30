/**
 * Character parts composition (pure). See
 * docs/superpowers/specs/2026-10-30-character-parts-design.md
 */

/** axisId → valueId (JSON keys are strings) */
export type AxisValues = Record<string, number>
/** axisId → allowed valueIds */
export type Condition = Record<string, Array<number>>

export interface PartsAxis {
  id: number
  name: string
  ownerCharacterId: number | null
  ownerItemId: number | null
  values: Array<{ id: number; name: string }>
}
export interface PartsFragment {
  id: number
  text: string
  conditions: Condition
}
export interface PartsCharacter {
  id: number
  fragments: Array<PartsFragment>
}
export interface PartsItem {
  id: number
  conditions: Condition
  fragments: Array<PartsFragment>
}

export const CHAR_TOKEN = '@{char}'
export const OUTFIT_TOKEN = '@{outfit}'

// ─── JSON helpers (tolerant) ────────────────────────────────────────────────

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw || 'null')
  } catch {
    return null
  }
}

export function parseAxisValues(raw: unknown): AxisValues {
  const v = parseJson(raw)
  const out: AxisValues = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'number' && Number.isFinite(val)) out[k] = val
    }
  }
  return out
}

export function parseCondition(raw: unknown): Condition {
  const v = parseJson(raw)
  const out: Condition = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        out[k] = val.filter((n): n is number => typeof n === 'number')
      }
    }
  }
  return out
}

export function parseIdList(raw: unknown): Array<number> {
  const v = parseJson(raw)
  if (!Array.isArray(v)) return []
  return v.filter((n): n is number => typeof n === 'number')
}

// ─── Composition ────────────────────────────────────────────────────────────

/**
 * Effective value per axis: axis default (first value) overridden by each
 * layer in order. Unknown axis ids / value ids are ignored at every layer.
 */
export function effectiveAxisValues(
  axes: Array<PartsAxis>,
  layers: Array<AxisValues | null | undefined>,
): AxisValues {
  const result: AxisValues = {}
  for (const axis of axes) {
    if (axis.values.length === 0) continue
    result[String(axis.id)] = axis.values[0].id
  }
  for (const layer of layers) {
    if (!layer) continue
    for (const axis of axes) {
      const v = layer[String(axis.id)]
      if (v !== undefined && axis.values.some((x) => x.id === v)) {
        result[String(axis.id)] = v
      }
    }
  }
  return result
}

export function matchesCondition(
  cond: Condition,
  values: AxisValues,
  axes: Array<PartsAxis>,
): boolean {
  for (const [axisKey, allowedRaw] of Object.entries(cond)) {
    const axis = axes.find((a) => String(a.id) === axisKey)
    if (!axis) continue
    const allowed = allowedRaw.filter((id) =>
      axis.values.some((v) => v.id === id),
    )
    if (allowed.length === 0) continue
    const current = values[axisKey]
    if (current === undefined || !allowed.includes(current)) return false
  }
  return true
}

function cleanText(text: string): string {
  return text
    .trim()
    .replace(/^[\s,]+/, '')
    .replace(/[\s,]+$/, '')
}

function joinFragments(
  fragments: Array<PartsFragment>,
  values: AxisValues,
  axes: Array<PartsAxis>,
): Array<string> {
  const out: Array<string> = []
  for (const f of fragments) {
    if (!matchesCondition(f.conditions, values, axes)) continue
    const t = cleanText(f.text)
    if (t) out.push(t)
  }
  return out
}

export function composeParts(args: {
  axes: Array<PartsAxis>
  character: PartsCharacter | null
  items: Array<PartsItem>
  values: AxisValues
}): { char: string; outfit: string } {
  const { axes, character, items, values } = args
  const char = character
    ? joinFragments(character.fragments, values, axes).join(', ')
    : ''
  const outfitParts: Array<string> = []
  for (const item of items) {
    if (!matchesCondition(item.conditions, values, axes)) continue
    outfitParts.push(...joinFragments(item.fragments, values, axes))
  }
  return { char, outfit: outfitParts.join(', ') }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceToken(prompt: string, token: string, part: string): string {
  if (!prompt.includes(token)) return prompt
  if (part) return prompt.split(token).join(part)
  const t = escapeRe(token)
  return (
    prompt
      // "a, TOKEN, b" / "a, TOKEN" → drop the preceding separator
      .replace(new RegExp(`\\s*,\\s*${t}[ \\t]*(?=,|$)`, 'gm'), '')
      // "TOKEN, b" at the start → drop the following separator
      .replace(new RegExp(`(^|\\n)[ \\t]*${t}[ \\t]*,?[ \\t]*`, 'g'), '$1')
      // inline leftovers
      .split(token)
      .join('')
  )
}

/**
 * Place the composed parts into the slot's free prompt. Tokens are replaced in
 * place; a part whose token is absent is prepended (char, outfit, free).
 * Nothing to add and no tokens → the prompt is returned unchanged.
 */
export function applyParts(
  freePrompt: string,
  parts: { char: string; outfit: string },
): string {
  const hasChar = freePrompt.includes(CHAR_TOKEN)
  const hasOutfit = freePrompt.includes(OUTFIT_TOKEN)
  if (!hasChar && !hasOutfit && !parts.char && !parts.outfit) return freePrompt

  let result = replaceToken(freePrompt, CHAR_TOKEN, parts.char)
  result = replaceToken(result, OUTFIT_TOKEN, parts.outfit)

  const prepend: Array<string> = []
  if (!hasChar && parts.char) prepend.push(parts.char)
  if (!hasOutfit && parts.outfit) prepend.push(parts.outfit)
  if (prepend.length === 0) return result

  const rest = result.trim()
  return rest ? `${prepend.join(', ')}, ${rest}` : prepend.join(', ')
}

/** Global axes + local axes of the character and the given outfit items. */
export function relevantAxes(
  axes: Array<PartsAxis>,
  characterId: number | null,
  itemIds: Array<number>,
): Array<PartsAxis> {
  return axes.filter((a) => {
    if (a.ownerCharacterId === null && a.ownerItemId === null) return true
    if (a.ownerCharacterId !== null) return a.ownerCharacterId === characterId
    return a.ownerItemId !== null && itemIds.includes(a.ownerItemId)
  })
}
