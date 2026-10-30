import { describe, expect, it } from 'vitest'
import { parseNAIMetadata } from '../nai-metadata'
import { detectNaiModel } from '../nai-model-detect'
import {
  availableSettings,
  buildImport,
  defaultImportSelection,
  mergeImportedParameters,
  naiMetadataToParams,
  naiMetadataToPrompts,
} from '../nai-import'

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function chunk(type: string, data: Uint8Array) {
  return { type, data }
}

function text(keyword: string, value: string) {
  return chunk('tEXt', new TextEncoder().encode(`${keyword}\0${value}`))
}

function buildPng(chunks: Array<{ type: string; data: Uint8Array }>) {
  let size = 8
  for (const c of chunks) size += 12 + c.data.length
  const out = new Uint8Array(size)
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  let o = 8
  for (const c of chunks) {
    const len = c.data.length
    out[o] = (len >> 24) & 0xff
    out[o + 1] = (len >> 16) & 0xff
    out[o + 2] = (len >> 8) & 0xff
    out[o + 3] = len & 0xff
    out.set(new TextEncoder().encode(c.type), o + 4)
    out.set(c.data, o + 8)
    o += 12 + len
  }
  return out
}

function naiPng(source: string | null, comment: Record<string, unknown>) {
  const ihdr = new Uint8Array(13)
  ihdr[3] = 1
  ihdr[7] = 1
  ihdr[8] = 8
  ihdr[9] = 6
  return buildPng([
    chunk('IHDR', ihdr),
    ...(source ? [text('Source', source)] : []),
    text('Comment', JSON.stringify(comment)),
    chunk('IEND', new Uint8Array(0)),
  ])
}

const v3Comment = {
  prompt: '1girl, solo, smile',
  uc: 'lowres, bad anatomy',
  steps: 28,
  scale: 5.5,
  cfg_rescale: 0,
  seed: 4242,
  sampler: 'k_euler_ancestral',
  noise_schedule: 'native',
  sm: true,
  sm_dyn: false,
  skip_cfg_above_sigma: null,
  dynamic_thresholding: true,
  width: 832,
  height: 1216,
  ucPreset: 0,
  qualityToggle: true,
}

function v4Comment(extra: Record<string, unknown> = {}) {
  return {
    prompt: '1girl, 1boy, hug',
    uc: 'lowres',
    steps: 28,
    scale: 6,
    cfg_rescale: 0.2,
    seed: 99,
    sampler: 'k_euler_ancestral',
    noise_schedule: 'karras',
    width: 1216,
    height: 832,
    ucPreset: 1,
    v4_prompt: {
      caption: {
        base_caption: '1girl, 1boy, hug',
        char_captions: [
          { char_caption: 'girl, red hair', centers: [{ x: 0.3, y: 0.5 }] },
          { char_caption: 'boy, blue hair', centers: [{ x: 0.7, y: 0.5 }] },
        ],
      },
    },
    v4_negative_prompt: {
      caption: {
        base_caption: 'lowres, worst quality',
        char_captions: [
          { char_caption: 'bad hands', centers: [{ x: 0.3, y: 0.5 }] },
          { char_caption: '', centers: [{ x: 0.7, y: 0.5 }] },
        ],
      },
    },
    ...extra,
  }
}

// ─── Model detection ─────────────────────────────────────────────────────────

describe('detectNaiModel', () => {
  it('accepts a raw model id', () => {
    expect(detectNaiModel('nai-diffusion-4-5-full')).toMatchObject({
      id: 'nai-diffusion-4-5-full',
      basis: 'model-id',
      assumed: null,
    })
  })

  it('parses the version token and assumes Full', () => {
    expect(detectNaiModel('NovelAI Diffusion V4.5 4BDE2A90')).toMatchObject({
      id: 'nai-diffusion-4-5-full',
      assumed: 'full',
      confidence: 'medium',
    })
    expect(detectNaiModel('NovelAI Diffusion V5 12345678')).toMatchObject({
      id: 'nai-diffusion-5-full',
      assumed: 'full',
    })
    expect(detectNaiModel('NovelAI Diffusion V4 12345678')).toMatchObject({
      id: 'nai-diffusion-4-full',
      assumed: 'full',
    })
  })

  it('reads Curated / Full when spelled out', () => {
    expect(
      detectNaiModel('NovelAI Diffusion V4.5 Curated 4BDE2A90'),
    ).toMatchObject({ id: 'nai-diffusion-4-5-curated', assumed: null })
    expect(detectNaiModel('NovelAI Diffusion V5 Full ABCDEF01')).toMatchObject({
      id: 'nai-diffusion-5-full',
      assumed: null,
    })
    expect(
      detectNaiModel('NovelAI Diffusion V4 Curated Preview 1'),
    ).toMatchObject({ id: 'nai-diffusion-4-curated-preview' })
  })

  it('maps the SDXL V3 source hash exactly', () => {
    expect(detectNaiModel('Stable Diffusion XL C1E1DE52')).toMatchObject({
      id: 'nai-diffusion-3',
      basis: 'source-hash',
      confidence: 'high',
      assumed: null,
    })
  })

  it('maps the real V5 sample hash with Full still assumed', () => {
    expect(detectNaiModel('NovelAI Diffusion V5 0ADF9AB7')).toMatchObject({
      id: 'nai-diffusion-5-full',
      basis: 'source-hash',
      assumed: 'full',
    })
  })

  it('treats unknown SDXL hashes as V3, furry only on evidence', () => {
    expect(detectNaiModel('Stable Diffusion XL 00000000')).toMatchObject({
      id: 'nai-diffusion-3',
      assumed: 'anime',
    })
    expect(
      detectNaiModel('Stable Diffusion XL 00000000', {
        prompt: 'fur dataset, wolf',
      }),
    ).toMatchObject({ id: 'nai-diffusion-furry-3' })
  })

  it('falls back to low-confidence comment hints without Source', () => {
    expect(
      detectNaiModel(undefined, { v4_prompt: {}, skip_cfg_above_sigma: 58 }),
    ).toMatchObject({ id: 'nai-diffusion-4-5-full', basis: 'comment-hint' })
    expect(detectNaiModel(undefined, { sm: false })).toMatchObject({
      id: 'nai-diffusion-3',
      basis: 'comment-hint',
    })
  })

  it('returns null when nothing is known', () => {
    expect(detectNaiModel(undefined, { prompt: 'x' })).toBeNull()
    expect(detectNaiModel('Something Else', undefined)).toBeNull()
    expect(detectNaiModel(undefined, { v4_prompt: {} })).toBeNull()
  })
})

// ─── Params mapping ──────────────────────────────────────────────────────────

describe('naiMetadataToParams', () => {
  it('maps a V3 image', async () => {
    const md = await parseNAIMetadata(
      naiPng('Stable Diffusion XL C1E1DE52', v3Comment),
    )
    const { parameters, model } = naiMetadataToParams(md!)
    expect(model?.id).toBe('nai-diffusion-3')
    expect(parameters).toEqual({
      model: 'nai-diffusion-3',
      width: 832,
      height: 1216,
      steps: 28,
      scale: 5.5,
      cfgRescale: 0,
      sampler: 'k_euler_ancestral',
      scheduler: 'native',
      ucPreset: 0,
      seed: 4242,
      smea: true,
      smeaDyn: false,
      varietyPlus: false,
      decrisp: true,
    })
  })

  it('maps a V4.5 image with characters', async () => {
    const md = await parseNAIMetadata(
      naiPng(
        'NovelAI Diffusion V4.5 4BDE2A90',
        v4Comment({ skip_cfg_above_sigma: 58, dynamic_thresholding: false }),
      ),
    )
    const { parameters, model } = naiMetadataToParams(md!)
    expect(model).toMatchObject({
      id: 'nai-diffusion-4-5-full',
      assumed: 'full',
    })
    expect(parameters).toMatchObject({
      model: 'nai-diffusion-4-5-full',
      width: 1216,
      height: 832,
      scale: 6,
      cfgRescale: 0.2,
      scheduler: 'karras',
      ucPreset: 1,
      varietyPlus: true,
      decrisp: false,
    })
    // SMEA keys are V3-only
    expect(parameters).not.toHaveProperty('smea')

    const prompts = naiMetadataToPrompts(md!)
    expect(prompts.generalPrompt).toBe('1girl, 1boy, hug')
    expect(prompts.negativePrompt).toBe('lowres, worst quality')
    expect(prompts.characters).toEqual([
      {
        name: 'Character 1',
        prompt: 'girl, red hair',
        negative: 'bad hands',
        position: { mode: 'ai' },
      },
      {
        name: 'Character 2',
        prompt: 'boy, blue hair',
        negative: '',
        position: { mode: 'ai' },
      },
    ])
  })

  it('imports caption centers as Fixed positions only when use_coords is true', async () => {
    const md = await parseNAIMetadata(
      naiPng('NovelAI Diffusion V4.5 4BDE2A90', {
        ...v4Comment(),
        v4_prompt: { ...v4Comment().v4_prompt, use_coords: true },
      }),
    )
    expect(naiMetadataToPrompts(md!).characters.map((c) => c.position)).toEqual(
      [
        { mode: 'fixed', x: 0.3, y: 0.5 },
        { mode: 'fixed', x: 0.7, y: 0.5 },
      ],
    )
  })

  it('maps a V5 image and drops VAR+ / DECRISP', async () => {
    const md = await parseNAIMetadata(
      naiPng('NovelAI Diffusion V5 0A1B2C3D', v4Comment()),
    )
    const { parameters, model } = naiMetadataToParams(md!)
    expect(model?.id).toBe('nai-diffusion-5-full')
    expect(parameters.model).toBe('nai-diffusion-5-full')
    expect(parameters).not.toHaveProperty('varietyPlus')
    expect(parameters).not.toHaveProperty('decrisp')
    expect(parameters).not.toHaveProperty('smea')
  })

  it('reports no model instead of guessing', async () => {
    const md = await parseNAIMetadata(naiPng(null, { prompt: 'x', steps: 20 }))
    const { parameters, model } = naiMetadataToParams(md!)
    expect(model).toBeNull()
    expect(parameters).toEqual({ steps: 20 })
  })

  it('skips samplers the app cannot edit', async () => {
    const md = await parseNAIMetadata(
      naiPng('NovelAI Diffusion V4.5 4BDE2A90', {
        ...v4Comment(),
        sampler: 'k_dpmpp_3m_sde',
      }),
    )
    const { parameters, skipped } = naiMetadataToParams(md!)
    expect(parameters).not.toHaveProperty('sampler')
    expect(skipped).toContain('sampler:k_dpmpp_3m_sde')
  })
})

// ─── Selection ───────────────────────────────────────────────────────────────

describe('UC preset double-apply guard', () => {
  const heavy =
    'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, bad anatomy, my custom tag'

  it('imports None when uc already holds preset tags, whatever ucPreset says', async () => {
    for (const preset of [undefined, 0, 1]) {
      const md = await parseNAIMetadata(
        naiPng(
          'NovelAI Diffusion V5 0ADF9AB7',
          v4Comment({
            uc: heavy,
            v4_negative_prompt: { caption: { base_caption: heavy } },
            ucPreset: preset,
          }),
        ),
      )
      const r = naiMetadataToParams(md!)
      expect(r.parameters.ucPreset).toBe(4)
      expect(r.ucPresetBaked).toBe(true)
      // the negative itself is untouched, so the request reproduces exactly
      expect(naiMetadataToPrompts(md!).negativePrompt).toBe(heavy)
    }
  })

  it('keeps the stored preset when uc has no preset tags', async () => {
    const md = await parseNAIMetadata(
      naiPng('NovelAI Diffusion V5 0ADF9AB7', v4Comment()),
    )
    const r = naiMetadataToParams(md!)
    expect(r.parameters.ucPreset).toBe(1)
    expect(r.ucPresetBaked).toBe(false)
  })

  it('uses None when there is a custom negative and no preset key', async () => {
    const md = await parseNAIMetadata(
      naiPng(
        'NovelAI Diffusion V5 0ADF9AB7',
        v4Comment({ ucPreset: undefined }),
      ),
    )
    expect(naiMetadataToParams(md!).parameters.ucPreset).toBe(4)
  })
})

describe('import selection', () => {
  it('defaults to everything except seed', async () => {
    const md = await parseNAIMetadata(
      naiPng('NovelAI Diffusion V4.5 4BDE2A90', v4Comment()),
    )
    const imported = naiMetadataToParams(md!)
    const sel = defaultImportSelection(imported)
    expect(sel.settings.seed).toBe(false)
    expect(sel.settings.model).toBe(true)
    expect(availableSettings(imported)).toContain('seed')

    const out = buildImport(md!, sel)
    expect(out.parameters).toHaveProperty('model')
    expect(out.parameters).not.toHaveProperty('seed')
    expect(out.characters).toHaveLength(2)

    sel.settings.seed = true
    expect(buildImport(md!, sel).parameters!.seed).toBe(99)
  })

  it('honours per-setting and prompt toggles', async () => {
    const md = await parseNAIMetadata(
      naiPng('NovelAI Diffusion V4.5 4BDE2A90', v4Comment()),
    )
    const sel = defaultImportSelection(naiMetadataToParams(md!))
    sel.settings.model = false
    sel.settings.size = false
    sel.characters = false
    sel.negativePrompt = false
    const out = buildImport(md!, sel)
    expect(out.parameters).not.toHaveProperty('model')
    expect(out.parameters).not.toHaveProperty('width')
    expect(out.parameters).toHaveProperty('steps')
    expect(out.characters).toBeUndefined()
    expect(out.negativePrompt).toBeUndefined()
    expect(out.generalPrompt).toBe('1girl, 1boy, hug')
  })

  it('merge drops randomResolution when a size is imported', () => {
    expect(
      mergeImportedParameters(
        { randomResolution: true, steps: 10 },
        { width: 832, height: 1216 },
      ),
    ).toEqual({ steps: 10, width: 832, height: 1216 })
    expect(
      mergeImportedParameters({ randomResolution: true }, { steps: 20 }),
    ).toEqual({ randomResolution: true, steps: 20 })
  })
})
