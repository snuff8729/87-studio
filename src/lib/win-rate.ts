/** Min win-rate presets (percent) offered by the gallery filter. */
export const WIN_RATE_PRESETS = [50, 60, 70, 80] as const

/**
 * Tournament win rate in percent, or null when the image has no matches yet
 * (such images never pass a win-rate filter).
 */
export function winRate(wins: number, losses: number): number | null {
  const total = wins + losses
  if (total <= 0) return null
  return (wins / total) * 100
}

export function meetsMinWinRate(
  wins: number,
  losses: number,
  minPercent: number,
): boolean {
  const rate = winRate(wins, losses)
  return rate !== null && rate >= minPercent
}
