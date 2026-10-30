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
  /** Item fragments only: own body areas; empty/absent = inherit the item's */
  areaIds?: Array<number>
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
  /** Resolved variable values (name -> value) for `@{var:name}` tokens */
  varValues?: Record<string, string>
}
/** Fully hidden item: passes its condition, every matching fragment is hidden. */
export interface HiddenItem {
  itemId: number
  /** Item ids (later in the outfit) whose cover rules hide this item */
  coveredBy: Array<number>
}
export interface PartialItem {
  itemId: number
  /** Hidden fragment ids (some, not all, of the item's matching fragments) */
  fragmentIds: Array<number>
  coveredBy: Array<number>
  details: Array<{ fragmentId: number; coveredBy: Array<number> }>
}
/** Per worn item occlusion result. */
export interface ItemVisibility {
  itemId: number
  hiddenFragmentIds: Array<number>
  fully: boolean
  coveredBy: Array<number>
  details: Array<{ fragmentId: number; coveredBy: Array<number> }>
}

/** Body area with optional (single-level) parent. */
export interface AreaNode {
  id: number
  parentId?: number | null
}

export const CHAR_TOKEN = '@{char}'
export const OUTFIT_TOKEN = '@{outfit}'
const VAR_TOKEN_RE = /@\{var:([^}]*)\}/g

// ─── Areas tree ─────────────────────────────────────────────────────────────

/** Top-level areas with their children (input order kept). Orphans → top-level. */
export function groupAreas<T extends AreaNode>(
  areas: Array<T>,
): Array<{ area: T; children: Array<T> }> {
  const ids = new Set(areas.map((a) => a.id))
  const tops = areas.filter((a) => a.parentId == null || !ids.has(a.parentId))
  return tops.map((area) => ({
    area,
    children: areas.filter((a) => a.parentId === area.id),
  }))
}

/**
 * One level only: a parent must be top-level, an area with children cannot get
 * a parent, an area cannot be its own parent. `null` (top-level) is always OK.
 */
export function canSetParent(
  areas: Array<AreaNode>,
  areaId: number,
  parentId: number | null,
): boolean {
  if (parentId === null) return true
  if (parentId === areaId) return false
  const parent = areas.find((a) => a.id === parentId)
  if (!parent || parent.parentId != null) return false
  return !areas.some((a) => a.parentId === areaId)
}

// ─── Outfit entries + variables ─────────────────────────────────────────────

export interface ItemVariable {
  name: string
  default: string
}
/** One outfit slot: an item plus per-entry variable values. */
export interface OutfitEntry {
  id: number
  vars?: Record<string, string>
}

export function parseVariables(raw: unknown): Array<ItemVariable> {
  const v = parseJson(raw)
  if (!Array.isArray(v)) return []
  const out: Array<ItemVariable> = []
  const seen = new Set<string>()
  for (const r of v) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue
    const rec = r as Record<string, unknown>
    if (typeof rec.name !== 'string') continue
    const name = rec.name.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({
      name,
      default: typeof rec.default === 'string' ? rec.default : '',
    })
  }
  return out
}

function cleanVars(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val !== '') out[k] = val
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Tolerant: accepts the legacy `number[]` as well as entries (or a mix). */
export function parseOutfitEntries(raw: unknown): Array<OutfitEntry> {
  const v = parseJson(raw)
  if (!Array.isArray(v)) return []
  const out: Array<OutfitEntry> = []
  for (const e of v) {
    if (typeof e === 'number' && Number.isFinite(e)) {
      out.push({ id: e })
    } else if (e && typeof e === 'object' && !Array.isArray(e)) {
      const rec = e as Record<string, unknown>
      if (typeof rec.id !== 'number' || !Number.isFinite(rec.id)) continue
      const vars = cleanVars(rec.vars)
      out.push(vars ? { id: rec.id, vars } : { id: rec.id })
    }
  }
  return out
}

/** Normalize input (`number[]` or entries) into clean entries. */
export function toOutfitEntries(
  input: ReadonlyArray<number | OutfitEntry>,
): Array<OutfitEntry> {
  return parseOutfitEntries(input as unknown)
}

export function outfitEntryIds(raw: unknown): Array<number> {
  return parseOutfitEntries(raw).map((e) => e.id)
}

export function stringifyOutfitEntries(
  input: ReadonlyArray<number | OutfitEntry>,
): string {
  return JSON.stringify(toOutfitEntries(input))
}

/** Value per variable: entry value if non-empty, else the item default. */
export function resolveVarValues(
  variables: Array<ItemVariable> | undefined,
  entryVars: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const v of variables ?? []) {
    const e = entryVars?.[v.name]
    out[v.name] = e !== undefined && e !== '' ? e : v.default
  }
  return out
}

/** `@{var:name}` → value (unknown → ''). */
export function substituteVars(
  text: string,
  values: Record<string, string> | undefined,
): string {
  return text.replace(VAR_TOKEN_RE, (_, name: string) => {
    const k = name.trim()
    return values && Object.hasOwn(values, k) ? values[k] : ''
  })
}

export function extractVarNames(text: string): Array<string> {
  const out: Array<string> = []
  for (const m of text.matchAll(VAR_TOKEN_RE)) {
    const n = m[1].trim()
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

/** Rewrite `@{var:old}` → `@{var:new}` (used when a variable is renamed). */
export function renameVarInText(
  text: string,
  oldName: string,
  newName: string,
): string {
  return text.replace(VAR_TOKEN_RE, (full, name: string) =>
    name.trim() === oldName ? `@{var:${newName}}` : full,
  )
}

/**
 * Same item sequence and same resolved variable values (defaults resolved on
 * both sides). `itemVars` maps item id → variable definitions.
 */
export function outfitEntriesMatch(
  a: Array<OutfitEntry>,
  b: Array<OutfitEntry>,
  itemVars: (itemId: number) => Array<ItemVariable> | undefined,
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    const defs = itemVars(a[i].id)
    const va = resolveVarValues(defs, a[i].vars)
    const vb = resolveVarValues(defs, b[i].vars)
    for (const d of defs ?? []) if (va[d.name] !== vb[d.name]) return false
  }
  return true
}

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

/**
 * Fragment text -> output text. Item fragments substitute `@{var:name}` with the
 * resolved value (unknown -> ''); in character fragments the token is stripped.
 */
function fragmentText(f: PartsFragment, vars: Record<string, string> | null) {
  return cleanText(substituteVars(f.text, vars ?? undefined))
}

function joinFragments(
  fragments: Array<PartsFragment>,
  values: AxisValues,
  axes: Array<PartsAxis>,
  vars: Record<string, string> | null,
  skip?: Set<number>,
): Array<string> {
  const out: Array<string> = []
  for (const f of fragments) {
    if (skip?.has(f.id)) continue
    if (!matchesCondition(f.conditions, values, axes)) continue
    const t = fragmentText(f, vars)
    if (t) out.push(t)
  }
  return out
}

/**
 * Outfit occlusion. Items are ordered inner -> outer. Items failing their item
 * condition are not worn: neither visible nor able to cover. Covering an area
 * also covers its children (never the other way round). A fragment's effective
 * areas are its own or else the item's; it is hidden when it has >=1 effective
 * area and all of them are covered by a matching cover rule of some worn item
 * LATER in the list (hidden outer items still cover). An item is fully hidden
 * when it has >=1 condition-matching fragment and all of them are hidden.
 * `areas` (the library's areas) makes unknown (deleted) ids ignored and
 * provides the parent -> children expansion.
 */
export function visibleItems(
  items: Array<PartsItem>,
  values: AxisValues,
  axes: Array<PartsAxis>,
  areasOrKnown?: Array<AreaNode> | Array<number>,
): {
  visible: Array<PartsItem>
  hidden: Array<HiddenItem>
  /** Per worn item (in outfit order) */
  items: Array<ItemVisibility>
} {
  const nodes: Array<AreaNode> | null = areasOrKnown
    ? (areasOrKnown as Array<AreaNode | number>).map((a) =>
        typeof a === 'number' ? { id: a } : a,
      )
    : null
  const known = nodes ? new Set(nodes.map((n) => n.id)) : null
  const childrenOf = new Map<number, Array<number>>()
  for (const n of nodes ?? []) {
    if (n.parentId != null) {
      const l = childrenOf.get(n.parentId) ?? []
      l.push(n.id)
      childrenOf.set(n.parentId, l)
    }
  }
  const filterKnown = (ids: Array<number> | undefined) =>
    (ids ?? []).filter((a) => !known || known.has(a))
  const expand = (a: number) => [a, ...(childrenOf.get(a) ?? [])]

  const worn = items.filter((i) => matchesCondition(i.conditions, values, axes))
  const visible: Array<PartsItem> = []
  const hidden: Array<HiddenItem> = []
  const results: Array<ItemVisibility> = []
  worn.forEach((item, idx) => {
    const itemAreas = filterKnown(item.areaIds)
    // area -> outer items covering it
    const coverers = new Map<number, Array<number>>()
    for (const outer of worn.slice(idx + 1)) {
      for (const rule of outer.coverRules ?? []) {
        if (!matchesCondition(rule.conditions, values, axes)) continue
        for (const a of rule.areaIds)
          for (const x of expand(a)) {
            const l = coverers.get(x) ?? []
            if (!l.includes(outer.id)) l.push(outer.id)
            coverers.set(x, l)
          }
      }
    }
    const order = worn.slice(idx + 1).map((o) => o.id)
    const details: ItemVisibility['details'] = []
    let matching = 0
    for (const f of item.fragments) {
      if (!matchesCondition(f.conditions, values, axes)) continue
      matching++
      const own = filterKnown(f.areaIds)
      const eff = own.length > 0 ? own : itemAreas
      if (eff.length === 0 || !eff.every((a) => coverers.has(a))) continue
      const by = new Set<number>()
      for (const a of eff) for (const id of coverers.get(a) ?? []) by.add(id)
      details.push({
        fragmentId: f.id,
        coveredBy: order.filter((id) => by.has(id)),
      })
    }
    const fully = matching > 0 && details.length === matching
    const by = new Set<number>()
    for (const d of details) for (const id of d.coveredBy) by.add(id)
    const coveredBy = order.filter((id) => by.has(id))
    results.push({
      itemId: item.id,
      hiddenFragmentIds: details.map((d) => d.fragmentId),
      fully,
      coveredBy,
      details,
    })
    if (fully) hidden.push({ itemId: item.id, coveredBy })
    else visible.push(item)
  })
  return { visible, hidden, items: results }
}

export function composeParts(args: {
  axes: Array<PartsAxis>
  character: PartsCharacter | null
  items: Array<PartsItem>
  values: AxisValues
  /** Library areas (parents enable child expansion); numbers = known ids only */
  areas?: Array<AreaNode> | Array<number>
  /** @deprecated alias of `areas` */
  knownAreaIds?: Array<number>
}): {
  char: string
  outfit: string
  /** Fully hidden item ids */
  hiddenItemIds: Array<number>
  hidden: Array<HiddenItem>
  /** Items with some (not all) fragments hidden */
  partial: Array<PartialItem>
  /** Visible items that contributed at least one fragment */
  contributingItemIds: Array<number>
} {
  const { axes, character, items, values } = args
  const char = character
    ? joinFragments(character.fragments, values, axes, null).join(', ')
    : ''
  const {
    visible,
    hidden,
    items: vis,
  } = visibleItems(items, values, axes, args.areas ?? args.knownAreaIds)
  const byItem = new Map(vis.map((v) => [v.itemId, v]))
  const outfitParts: Array<string> = []
  const contributingItemIds: Array<number> = []
  const partial: Array<PartialItem> = []
  for (const item of visible) {
    const v = byItem.get(item.id)
    const skip = new Set(v?.hiddenFragmentIds ?? [])
    const texts = joinFragments(
      item.fragments,
      values,
      axes,
      item.varValues ?? {},
      skip,
    )
    if (texts.length > 0) contributingItemIds.push(item.id)
    outfitParts.push(...texts)
    if (v && v.hiddenFragmentIds.length > 0) {
      partial.push({
        itemId: item.id,
        fragmentIds: v.hiddenFragmentIds,
        coveredBy: v.coveredBy,
        details: v.details,
      })
    }
  }
  return {
    char,
    outfit: outfitParts.join(', '),
    hiddenItemIds: hidden.map((h) => h.itemId),
    hidden,
    partial,
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
