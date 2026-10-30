export interface AddScenePackInfo {
  id: number
  name: string
  sceneNames: ReadonlyArray<string>
}

/** The pack of the selected scene, else the first pack, else null. */
export function defaultAddPackId(
  packs: ReadonlyArray<AddScenePackInfo>,
  selectedPackId: number | null,
): number | null {
  if (selectedPackId != null && packs.some((p) => p.id === selectedPackId)) {
    return selectedPackId
  }
  return packs.at(0)?.id ?? null
}

/** Scene names are unique per pack (compared trimmed, case-insensitive). */
export function isDuplicateSceneName(
  pack: AddScenePackInfo | undefined,
  name: string,
): boolean {
  if (!pack) return false
  const wanted = name.trim().toLowerCase()
  return pack.sceneNames.some((n) => n.trim().toLowerCase() === wanted)
}
