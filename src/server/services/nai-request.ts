import { usesMultipartRequest } from '@/lib/nai-models'

/**
 * Build fetch headers/body for a NAI generate-image request.
 * V5 uses multipart/form-data with a single `request` JSON blob part
 * (Content-Type must be left to fetch so it adds the boundary).
 */
export function buildNaiRequestInit(
  apiKey: string,
  body: { model: string } & Record<string, unknown>,
): { headers: Record<string, string>; body: string | FormData } {
  const json = JSON.stringify(body)
  if (usesMultipartRequest(body.model)) {
    const form = new FormData()
    form.append(
      'request',
      new Blob([json], { type: 'application/json' }),
      'blob',
    )
    return { headers: { Authorization: `Bearer ${apiKey}` }, body: form }
  }
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: json,
  }
}
