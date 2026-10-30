/**
 * Turn PlaceholderEditor's local edit overlay into the saves to perform.
 * Local keys: `g:<placeholder>` (general) or `c:<charId>:<placeholder>`.
 * Each save is the full merged JSON (server values + local edits).
 */
export interface PlaceholderSavePlan {
  /** Merged general placeholders JSON, or null when no general edits. */
  general: string | null
  characters: Array<{ charId: number; json: string }>
}

export function planPlaceholderSaves(
  localValues: Record<string, string>,
  scenePlaceholders: Record<string, string>,
  characterOverrides: Record<number, Record<string, string> | undefined>,
): PlaceholderSavePlan {
  const generalChanges: Record<string, string> = {}
  const charChanges = new Map<number, Record<string, string>>()

  for (const [k, v] of Object.entries(localValues)) {
    const parts = k.split(':')
    if (parts[0] === 'g') {
      generalChanges[parts[1]] = v
    } else {
      const charId = Number(parts[1])
      const changes = charChanges.get(charId) ?? {}
      changes[parts[2]] = v
      charChanges.set(charId, changes)
    }
  }

  return {
    general:
      Object.keys(generalChanges).length > 0
        ? JSON.stringify({ ...scenePlaceholders, ...generalChanges })
        : null,
    characters: [...charChanges].map(([charId, changes]) => ({
      charId,
      json: JSON.stringify({
        ...(characterOverrides[charId] ?? {}),
        ...changes,
      }),
    })),
  }
}
