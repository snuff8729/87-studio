import { unzipSync } from 'fflate'
import type { ResolvedPrompts } from './prompt'
import { createLogger } from './logger'

const log = createLogger('nai')
const NAI_API_URL = 'https://image.novelai.net/ai/generate-image'

interface GenerationParams {
  width?: number
  height?: number
  steps?: number
  scale?: number
  cfgRescale?: number
  sampler?: string
  scheduler?: string
  seed?: number
  ucPreset?: number
  imageFormat?: string
}

export async function generateImage(
  apiKey: string,
  prompts: ResolvedPrompts,
  params: GenerationParams,
): Promise<{ imageData: Uint8Array; seed: number }> {
  const seed = params.seed ?? Math.floor(Math.random() * 2 ** 32)

  // Build v4_prompt char_captions from character prompts
  const charCaptions = prompts.characterPrompts.map((cp) => ({
    char_caption: cp.prompt,
    centers: [{ x: 0.5, y: 0.5 }],
  }))

  const negCharCaptions = prompts.characterPrompts.map((cp) => ({
    char_caption: cp.negative,
    centers: [{ x: 0.5, y: 0.5 }],
  }))

  const body = {
    input: prompts.generalPrompt,
    model: 'nai-diffusion-4-5-curated',
    action: 'generate',
    parameters: {
      add_original_image: true,
      autoSmea: false,
      cfg_rescale: params.cfgRescale,
      characterPrompts: prompts.characterPrompts.map((cp) => ({
        center: { x: 0.5, y: 0.5 },
        enabled: true,
        prompt: cp.prompt,
        uc: cp.negative,
      })),
      controlnet_strength: 1,
      deliberate_euler_ancestral_bug: false,
      dynamic_thresholding: false,
      width: params.width ?? 832,
      height: params.height ?? 1216,
      image_format: params.imageFormat ?? "png",
      inpaintImg2ImgStrength: 1,
      legacy: false,
      legacy_uc: false,
      legacy_v3_extend: false,
      n_samples: 1,
      negative_prompt: prompts.negativePrompt,
      noise_schedule: params.scheduler ?? "karras",
      normalize_reference_strength_multiple: true,
      params_version: 3,
      prefer_brownian: true,
      qualityToggle: true,
      sampler: params.sampler ?? "k_euler_ancestral",
      scale: params.scale ?? 5,
      seed: seed,
      skip_cfg_above_sigma: null,
      steps: params.steps ?? 23,
      ucPreset: params.ucPreset ?? 0,
      use_coords: false,
      v4_prompt: {
        caption: {
          base_caption: prompts.generalPrompt,
          char_captions: charCaptions,
        },
        use_coords: false,
        use_order: true
      },
      v4_negative_prompt: {
        caption: {
          base_caption: prompts.negativePrompt,
          char_captions: negCharCaptions,
        },
        legacy_uc: false
      },
    },
  }

  log.info('api.request', 'Sending NAI API request', body)

  const fetchStart = Date.now()
  const response = await fetch(NAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })
  const fetchDuration = Date.now() - fetchStart

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    log.error('api.error', 'NAI API error response', {
      status: response.status,
      responseText: text.slice(0, 500),
      durationMs: fetchDuration,
    })
    throw new Error(`NAI API error ${response.status}: ${text}`)
  }

  const zipData = new Uint8Array(await response.arrayBuffer())

  if (fetchDuration > 30000) {
    log.warn('api.slowResponse', 'NAI API response was slow', { durationMs: fetchDuration })
  }

  log.info('api.response', 'NAI API responded', {
    status: response.status,
    durationMs: fetchDuration,
    zipSizeBytes: zipData.byteLength,
  })

  const files = unzipSync(zipData)

  // Extract the first image file from the ZIP
  const imageEntry = Object.entries(files).find(([name]) =>
    /\.(png|webp|jpg|jpeg)$/i.test(name),
  )
  if (!imageEntry) {
    log.error('api.noImage', 'No image found in NAI API response ZIP')
    throw new Error('No image found in NAI API response')
  }

  return { imageData: imageEntry[1], seed }
}
