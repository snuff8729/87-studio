import { DEFAULT_NAI_MODEL, getModelProfile } from './nai-models'

export type PositionMode = 'ai' | 'random' | 'fixed'

export interface PositionSpec {
  mode: PositionMode
  x?: number
  y?: number
}

/** Scene override: a position spec or "inherit" (use the character default) */
export interface ScenePositionSpec {
  mode: PositionMode | 'inherit'
  x?: number
  y?: number
}

export interface Center {
  x: number
  y: number
}

export interface ResolvedPositions {
  useCoords: boolean
  centers: Array<Center>
}

export const AI_POSITION: PositionSpec = { mode: 'ai' }
export const GRID_STEPS = [0.1, 0.3, 0.5, 0.7, 0.9] as const

const MIN_DISTANCE = 0.2
const RANDOM_MIN = 0.1
const RANDOM_MAX = 0.9
const RANDOM_TRIES = 5
/** center → left → right → up → down → corners */
const RING: Array<Center> = [
  { x: 0.5, y: 0.5 },
  { x: 0.3, y: 0.5 },
  { x: 0.7, y: 0.5 },
  { x: 0.5, y: 0.3 },
  { x: 0.5, y: 0.7 },
  { x: 0.3, y: 0.3 },
  { x: 0.7, y: 0.3 },
  { x: 0.3, y: 0.7 },
  { x: 0.7, y: 0.7 },
]

export function roundCoord(n: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.5))
  return Math.round(clamped * 1000) / 1000
}

function farEnough(a: Center, b: Center): boolean {
  // epsilon: 0.7 - 0.5 is 0.19999999999999996 in floating point
  return Math.hypot(a.x - b.x, a.y - b.y) >= MIN_DISTANCE - 1e-9
}

/** Parse stored JSON / unknown into a spec; `null` for missing or invalid */
export function parsePositionSpec(
  raw: unknown,
  allowInherit: true,
): ScenePositionSpec | null
export function parsePositionSpec(
  raw: unknown,
  allowInherit?: false,
): PositionSpec | null
export function parsePositionSpec(
  raw: unknown,
  allowInherit = false,
): ScenePositionSpec | null {
  let value = raw
  if (typeof raw === 'string') {
    if (!raw) return null
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') return null
  const v = value as { mode?: unknown; x?: unknown; y?: unknown }
  if (v.mode === 'ai' || v.mode === 'random') return { mode: v.mode }
  if (v.mode === 'inherit') return allowInherit ? { mode: 'inherit' } : null
  if (v.mode === 'fixed') {
    const x = typeof v.x === 'number' ? roundCoord(v.x) : 0.5
    const y = typeof v.y === 'number' ? roundCoord(v.y) : 0.5
    return { mode: 'fixed', x, y }
  }
  return null
}

/** Normalised spec for storing */
export function normalizePositionSpec<T extends ScenePositionSpec>(spec: T): T {
  if (spec.mode === 'fixed') {
    return {
      ...spec,
      x: roundCoord(spec.x ?? 0.5),
      y: roundCoord(spec.y ?? 0.5),
    }
  }
  return { mode: spec.mode } as T
}

/** Scene override on top of the character default */
export function applyOverride(
  base: PositionSpec | null | undefined,
  override: ScenePositionSpec | null | undefined,
): PositionSpec {
  if (override && override.mode !== 'inherit') {
    return normalizePositionSpec(override as PositionSpec)
  }
  return base ?? AI_POSITION
}

/** Cell label such as "B3" for a normalised point (column letter, row number) */
export function cellLabel(x: number, y: number): string {
  const col = Math.min(4, Math.max(0, Math.floor(x * 5)))
  const row = Math.min(4, Math.max(0, Math.floor(y * 5)))
  return `${'ABCDE'[col]}${row + 1}`
}

export function snapToGrid(n: number): number {
  const clamped = Math.min(1, Math.max(0, n))
  const idx = Math.min(4, Math.floor(clamped * 5))
  return GRID_STEPS[idx]
}

export function allAi(specs: ReadonlyArray<PositionSpec>): boolean {
  return specs.every((s) => s.mode === 'ai')
}

function randomPoint(rng: () => number): Center {
  return {
    x: roundCoord(RANDOM_MIN + rng() * (RANDOM_MAX - RANDOM_MIN)),
    y: roundCoord(RANDOM_MIN + rng() * (RANDOM_MAX - RANDOM_MIN)),
  }
}

export function resolveCharacterPositions(
  specs: ReadonlyArray<PositionSpec>,
  rng: () => number = Math.random,
): ResolvedPositions {
  if (allAi(specs)) {
    return { useCoords: false, centers: specs.map(() => ({ x: 0.5, y: 0.5 })) }
  }
  const centers: Array<Center | null> = specs.map(() => null)
  const placed: Array<Center> = []

  // Fixed first so random/ai placement can avoid them
  specs.forEach((s, i) => {
    if (s.mode !== 'fixed') return
    const c = { x: roundCoord(s.x ?? 0.5), y: roundCoord(s.y ?? 0.5) }
    centers[i] = c
    placed.push(c)
  })
  specs.forEach((s, i) => {
    if (s.mode !== 'random') return
    let c = randomPoint(rng)
    for (let t = 1; t < RANDOM_TRIES; t++) {
      if (placed.every((p) => farEnough(p, c))) break
      c = randomPoint(rng)
    }
    centers[i] = c
    placed.push(c)
  })
  specs.forEach((s, i) => {
    if (s.mode !== 'ai') return
    const free =
      RING.find((p) => placed.every((q) => farEnough(p, q))) ??
      RING[RING.length - 1]
    centers[i] = { ...free }
    placed.push(free)
  })
  return { useCoords: true, centers: centers as Array<Center> }
}

/** JSON for the DB column; NULL for "no value" (inherit, or ai when `nullAi`) */
export function encodePosition(
  spec: ScenePositionSpec | null | undefined,
  nullAi = false,
): string | null {
  if (!spec || spec.mode === 'inherit') return null
  if (nullAi && spec.mode === 'ai') return null
  return JSON.stringify(normalizePositionSpec(spec))
}

/** Canvas config for the pickers; false when the model has no character positions (V3) */
export function positionCanvas(params: {
  model?: string
  width?: number
  height?: number
}): { aspect: number } | false {
  if (getModelProfile(params.model ?? DEFAULT_NAI_MODEL) === 'v3') return false
  const w = params.width && params.width > 0 ? params.width : 832
  const h = params.height && params.height > 0 ? params.height : 1216
  return { aspect: w / h }
}
