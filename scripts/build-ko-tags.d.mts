export const NAIA_REPO: string
export const NAIA_SHA: string
export const GROUP_KEYS: Record<string, string>
export function normalizeTagName(raw: unknown): string
export function normalizeKeyword(s: string): string
export function parseKeywords(
  raw: unknown,
): Array<{ keyword: string; kind: number }>
export function groupFor(
  category: string,
  lookup: Map<string, string>,
): string | null
