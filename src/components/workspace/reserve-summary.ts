export interface ReserveSummary {
  /** Scenes whose effective count is > 0 */
  scenes: number
  /** Total images to generate across those scenes */
  images: number
}

/**
 * Summarises a reservation: a scene's count is `counts[id] ?? defaultCount`,
 * and only scenes with a positive count contribute.
 */
export function reserveSummary(
  sceneIds: Array<number>,
  counts: Record<number, number>,
  defaultCount: number,
): ReserveSummary {
  let scenes = 0
  let images = 0
  for (const id of sceneIds) {
    const count = counts[id] ?? defaultCount
    if (count > 0) {
      scenes += 1
      images += count
    }
  }
  return { scenes, images }
}
