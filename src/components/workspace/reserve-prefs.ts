export interface ReservePrefs {
  /** Per-scene image count overrides */
  counts: Record<number, number>
  /** Default ×N for scenes without an override */
  defaultCount: number
}

export function reserveKey(projectId: number): string {
  return `87studio-scene-reserve:${projectId}`
}

const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 999

export function parseReservePrefs(raw: string | null): ReservePrefs {
  const empty: ReservePrefs = { counts: {}, defaultCount: 0 }
  if (!raw) return empty
  try {
    const parsed = JSON.parse(raw) as {
      counts?: Record<string, unknown>
      defaultCount?: unknown
    }
    const counts: Record<number, number> = {}
    for (const [k, v] of Object.entries(parsed.counts ?? {})) {
      const id = Number(k)
      if (Number.isInteger(id) && isCount(v)) counts[id] = v
    }
    return {
      counts,
      defaultCount: isCount(parsed.defaultCount) ? parsed.defaultCount : 0,
    }
  } catch {
    return empty
  }
}

export function serializeReservePrefs(prefs: ReservePrefs): string {
  return JSON.stringify(prefs)
}
