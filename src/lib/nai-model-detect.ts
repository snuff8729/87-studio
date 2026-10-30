/**
 * Maps the NAI image `Source` text (PNG `Source` chunk / stealth `Source` key)
 * and Comment-JSON hints to one of our model ids (`nai-models.ts`).
 *
 * NAI writes e.g. "NovelAI Diffusion V4.5 4BDE2A90": a version token plus a
 * model hash. The version token is reliable; the hash is the only thing that
 * separates Full from Curated, so unless the hash is in KNOWN_HASHES the
 * variant is *assumed* (Full) and the result says so.
 */

import { NAI_MODELS } from './nai-models'

export interface NaiModelDetection {
  id: string
  name: string
  /** What the detection was based on. */
  basis: 'model-id' | 'source-hash' | 'source-text' | 'comment-hint'
  confidence: 'high' | 'medium' | 'low'
  /** Variant that was guessed rather than read (null = nothing assumed). */
  assumed: 'full' | 'anime' | null
  sourceText?: string
}

/**
 * Source hash -> model id. `assumed: 'full'` marks entries whose Full vs
 * Curated variant is not verified (the UI still says "Full assumed"); drop it
 * once verified. Everything not listed falls back to the version token.
 */
export const KNOWN_SOURCE_HASHES: Readonly<
  Record<string, { id: string; assumed: NaiModelDetection['assumed'] }>
> = {
  // "Stable Diffusion XL C1E1DE52" = NAI Diffusion Anime V3
  C1E1DE52: { id: 'nai-diffusion-3', assumed: null },
  // "NovelAI Diffusion V5 0ADF9AB7": V5 confirmed from user samples, Full unverified
  '0ADF9AB7': { id: 'nai-diffusion-5-full', assumed: 'full' },
}

function result(
  id: string,
  basis: NaiModelDetection['basis'],
  confidence: NaiModelDetection['confidence'],
  assumed: NaiModelDetection['assumed'],
  sourceText?: string,
): NaiModelDetection {
  const name = NAI_MODELS.find((m) => m.id === id)?.name ?? id
  return { id, name, basis, confidence, assumed, sourceText }
}

function isFurryHint(raw?: Record<string, unknown>): boolean {
  if (!raw) return false
  if (raw.ucPreset === 2) return true
  const prompt = typeof raw.prompt === 'string' ? raw.prompt : ''
  return /(^|,\s*)fur dataset\b/i.test(prompt)
}

function fromVersion(
  version: string,
  words: { curated: boolean; full: boolean; furry: boolean },
  raw: Record<string, unknown> | undefined,
  sourceText: string,
): NaiModelDetection | null {
  switch (version) {
    case '5': {
      const curated = words.curated
      return result(
        curated ? 'nai-diffusion-5-curated' : 'nai-diffusion-5-full',
        'source-text',
        'medium',
        curated || words.full ? null : 'full',
        sourceText,
      )
    }
    case '4.5': {
      const curated = words.curated
      return result(
        curated ? 'nai-diffusion-4-5-curated' : 'nai-diffusion-4-5-full',
        'source-text',
        'medium',
        curated || words.full ? null : 'full',
        sourceText,
      )
    }
    case '4': {
      const curated = words.curated
      return result(
        curated ? 'nai-diffusion-4-curated-preview' : 'nai-diffusion-4-full',
        'source-text',
        'medium',
        curated || words.full ? null : 'full',
        sourceText,
      )
    }
    case '3': {
      if (words.furry || isFurryHint(raw)) {
        return result(
          'nai-diffusion-furry-3',
          'source-text',
          words.furry ? 'high' : 'medium',
          null,
          sourceText,
        )
      }
      return result(
        'nai-diffusion-3',
        'source-text',
        'medium',
        words.furry ? null : 'anime',
        sourceText,
      )
    }
    default:
      return null
  }
}

/**
 * @param source  raw `Source` text (may also already be a model id)
 * @param raw     the Comment JSON, used only when Source gives nothing
 */
export function detectNaiModel(
  source: string | undefined | null,
  raw?: Record<string, unknown>,
): NaiModelDetection | null {
  const text = source?.trim()

  if (text) {
    const direct = NAI_MODELS.find((m) => m.id === text)
    if (direct) return result(direct.id, 'model-id', 'high', null, text)

    const hash = /\b([0-9A-F]{8})\s*$/i.exec(text)?.[1]?.toUpperCase()
    if (hash && KNOWN_SOURCE_HASHES[hash]) {
      const known = KNOWN_SOURCE_HASHES[hash]
      return result(
        known.id,
        'source-hash',
        known.assumed ? 'medium' : 'high',
        known.assumed,
        text,
      )
    }

    const words = {
      curated: /curated/i.test(text),
      full: /\bfull\b/i.test(text),
      furry: /furry/i.test(text),
    }
    const versionMatch =
      /NovelAI\s+Diffusion\s+(?:\w+\s+)*?V(\d(?:\.\d)?)/i.exec(text)
    if (versionMatch) {
      const d = fromVersion(versionMatch[1], words, raw, text)
      if (d) return d
    }

    // SDXL-based V3 family (anime and furry share this prefix)
    if (/^Stable Diffusion XL\b/i.test(text)) {
      return fromVersion('3', words, raw, text)
    }
  }

  return detectFromComment(raw)
}

/** Low-confidence hints from the generation parameters themselves. */
function detectFromComment(
  raw: Record<string, unknown> | undefined,
): NaiModelDetection | null {
  if (!raw) return null
  const skip = raw.skip_cfg_above_sigma
  if (raw.v4_prompt) {
    // Our own defaults mirror NAI: VAR+ sigma is 58 on V4.5 and 19 on V4.
    if (skip === 58)
      return result('nai-diffusion-4-5-full', 'comment-hint', 'low', 'full')
    if (skip === 19)
      return result('nai-diffusion-4-full', 'comment-hint', 'low', 'full')
    return null
  }
  // No V4 prompt structure but SMEA keys: V3 family.
  if (typeof raw.sm === 'boolean') {
    const furry = isFurryHint(raw)
    return result(
      furry ? 'nai-diffusion-furry-3' : 'nai-diffusion-3',
      'comment-hint',
      'low',
      furry ? null : 'anime',
    )
  }
  return null
}
