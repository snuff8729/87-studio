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
export interface CoverRule {
  conditions: Condition
  areaIds: Array<number>
}
export interface PartsItem {
  id: number
  conditions: Condition
  fragments: Array<PartsFragment>
  /** Body areas the item occupies (optional: absent = none) */
  areaIds?: Array<number>
  /** "when <condition> → covers <areas>" (optional: absent = none) */
  coverRules?: Array<CoverRule>
}
export interface HiddenItem {
  itemId: number
  /** Item ids (later in the outfit) whose cover rules hide this item */
  coveredBy: Array<number>
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

export function parseCoverRules(raw: unknown): Array<CoverRule> {
  const v = parseJson(raw)
  if (!Array.isArray(v)) return []
  const out: Array<CoverRule> = []
  for (const r of v) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue
    const rec = r as Record<string, unknown>
    out.push({
      conditions: parseCondition(rec.conditions),
      areaIds: parseIdList(rec.areaIds),
    })
  }
  return out
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
    // Axis still exists but none of its allowed values do → never matches
    if (allowed.length === 0) return false
    const current = values[axisKey]
    if (current === undefined || !allowed.includes(current)) return false
  }
  return true
}

function cleanText(text: string): string {
  return text
    .split(CHAR_TOKEN)
    .join('')
    .split(OUTFIT_TOKEN)
    .join('')
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

/**
 * Outfit occlusion. Items are ordered inner → outer. Items failing their item
 * condition are not worn: neither visible nor able to cover. A worn item with
 * at least one area is hidden when every one of its areas is covered by a
 * matching cover rule of some worn item LATER in the list (a hidden outer item
 * still covers). Items without areas are never hidden. `knownAreaIds`, when
 * given, makes unknown (deleted) area ids ignored.
 */
export function visibleItems(
  items: Array<PartsItem>,
  values: AxisValues,
  axes: Array<PartsAxis>,
  knownAreaIds?: Array<number>,
): { visible: Array<PartsItem>; hidden: Array<HiddenItem> } {
  const worn = items.filter((i) => matchesCondition(i.conditions, values, axes))
  const known = knownAreaIds ? new Set(knownAreaIds) : null
  const visible: Array<PartsItem> = []
  const hidden: Array<HiddenItem> = []
  worn.forEach((item, idx) => {
    const areas = (item.areaIds ?? []).filter((a) => !known || known.has(a))
    if (areas.length === 0) {
      visible.push(item)
      return
    }
    const covered = new Set<number>()
    const coveredBy: Array<number> = []
    for (const outer of worn.slice(idx + 1)) {
      let contributes = false
      for (const rule of outer.coverRules ?? []) {
        if (!matchesCondition(rule.conditions, values, axes)) continue
        for (const a of rule.areaIds) {
          if (areas.includes(a)) {
            covered.add(a)
            contributes = true
          }
        }
      }
      if (contributes) coveredBy.push(outer.id)
    }
    if (areas.every((a) => covered.has(a))) {
      hidden.push({ itemId: item.id, coveredBy })
    } else {
      visible.push(item)
    }
  })
  return { visible, hidden }
}

export function composeParts(args: {
  axes: Array<PartsAxis>
  character: PartsCharacter | null
  items: Array<PartsItem>
  values: AxisValues
  knownAreaIds?: Array<number>
}): {
  char: string
  outfit: string
  hiddenItemIds: Array<number>
  hidden: Array<HiddenItem>
  /** Visible items that contributed at least one fragment */
  contributingItemIds: Array<number>
} {
  const { axes, character, items, values, knownAreaIds } = args
  const char = character
    ? joinFragments(character.fragments, values, axes).join(', ')
    : ''
  const { visible, hidden } = visibleItems(items, values, axes, knownAreaIds)
  const outfitParts: Array<string> = []
  const contributingItemIds: Array<number> = []
  for (const item of visible) {
    const texts = joinFragments(item.fragments, values, axes)
    if (texts.length > 0) contributingItemIds.push(item.id)
    outfitParts.push(...texts)
  }
  return {
    char,
    outfit: outfitParts.join(', '),
    hiddenItemIds: hidden.map((h) => h.itemId),
    hidden,
    contributingItemIds,
  }
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

/**
 * Clean cover rules after an axis / axis value deletion. Deleting a whole axis
 * drops every rule that conditioned on it (removing the key would silently turn
 * the rule into "always covers"). Deleting a value keeps the rule with the value
 * removed (an empty list = never matches).
 */
export function cleanCoverRuleConditions(
  rules: Array<CoverRule>,
  axisId: number,
  removeValueId?: number,
): Array<CoverRule> {
  const key = String(axisId)
  const out: Array<CoverRule> = []
  for (const r of rules) {
    if (!(key in r.conditions)) {
      out.push(r)
    } else if (removeValueId === undefined) {
      continue
    } else {
      out.push({
        ...r,
        conditions: {
          ...r.conditions,
          [key]: r.conditions[key].filter((id) => id !== removeValueId),
        },
      })
    }
  }
  return out
}
