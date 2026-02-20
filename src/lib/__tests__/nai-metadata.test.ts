import { describe, it, expect } from 'vitest'
import { parseNAIMetadata, getUcPresetLabel } from '../nai-metadata'

// ─── PNG Builder Helper ──────────────────────────────────────────────────────

function buildPngWithChunks(
  chunks: Array<{ type: string; data: Uint8Array }>,
): Uint8Array {
  const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

  // Calculate total size
  let totalSize = 8 // PNG signature
  for (const chunk of chunks) {
    totalSize += 4 + 4 + chunk.data.length + 4 // length + type + data + crc
  }

  const result = new Uint8Array(totalSize)
  let offset = 0

  // PNG signature
  result.set(PNG_SIG, 0)
  offset = 8

  for (const chunk of chunks) {
    const len = chunk.data.length
    // Length (big-endian)
    result[offset] = (len >> 24) & 0xff
    result[offset + 1] = (len >> 16) & 0xff
    result[offset + 2] = (len >> 8) & 0xff
    result[offset + 3] = len & 0xff
    offset += 4
    // Type
    const typeBytes = new TextEncoder().encode(chunk.type)
    result.set(typeBytes, offset)
    offset += 4
    // Data
    result.set(chunk.data, offset)
    offset += len
    // CRC (dummy — the parser doesn't validate CRC)
    offset += 4
  }

  return result
}

function makeTextChunk(keyword: string, value: string): { type: string; data: Uint8Array } {
  const encoded = new TextEncoder().encode(`${keyword}\0${value}`)
  return { type: 'tEXt', data: encoded }
}

function makeIHDR(): { type: string; data: Uint8Array } {
  const data = new Uint8Array(13)
  data[3] = 1 // width = 1
  data[7] = 1 // height = 1
  data[8] = 8 // bit depth
  data[9] = 6 // color type RGBA
  return { type: 'IHDR', data }
}

function makeIEND(): { type: string; data: Uint8Array } {
  return { type: 'IEND', data: new Uint8Array(0) }
}

function buildNAIPng(metadata: Record<string, unknown>): Uint8Array {
  return buildPngWithChunks([
    makeIHDR(),
    makeTextChunk('Comment', JSON.stringify(metadata)),
    makeIEND(),
  ])
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('parseNAIMetadata', () => {
  it('returns null for non-PNG data', async () => {
    const result = await parseNAIMetadata(new Uint8Array([0, 0, 0, 0]))
    expect(result).toBeNull()
  })

  it('returns null for PNG without metadata', async () => {
    const png = buildPngWithChunks([makeIHDR(), makeIEND()])
    const result = await parseNAIMetadata(png)
    expect(result).toBeNull()
  })

  it('extracts basic NAI metadata from tEXt chunk', async () => {
    const png = buildNAIPng({
      prompt: '1girl, standing',
      uc: 'lowres, bad anatomy',
      steps: 28,
      scale: 5,
      seed: 12345,
      sampler: 'k_euler_ancestral',
      noise_schedule: 'karras',
      width: 832,
      height: 1216,
    })

    const result = await parseNAIMetadata(png)
    expect(result).not.toBeNull()
    expect(result!.prompt).toBe('1girl, standing')
    expect(result!.negativePrompt).toBe('lowres, bad anatomy')
    expect(result!.steps).toBe(28)
    expect(result!.cfgScale).toBe(5)
    expect(result!.seed).toBe(12345)
    expect(result!.sampler).toBe('k_euler_ancestral')
    expect(result!.scheduler).toBe('karras')
    expect(result!.width).toBe(832)
    expect(result!.height).toBe(1216)
    expect(result!.source).toBe('text_chunk')
  })

  it('extracts V4 prompt structure', async () => {
    const v4Prompt = {
      caption: {
        base_caption: '1girl',
        char_captions: [
          { char_caption: 'red hair', centers: [{ x: 0.5, y: 0.5 }] },
        ],
      },
    }
    const png = buildNAIPng({
      prompt: '1girl',
      v4_prompt: v4Prompt,
    })

    const result = await parseNAIMetadata(png)
    expect(result!.v4_prompt).toEqual(v4Prompt)
  })

  it('extracts negative prompt from V4 negative first', async () => {
    const png = buildNAIPng({
      prompt: 'test',
      uc: 'from uc field',
      v4_negative_prompt: {
        caption: {
          base_caption: 'from v4 negative',
        },
      },
    })

    const result = await parseNAIMetadata(png)
    // V4 negative takes priority over uc
    expect(result!.negativePrompt).toBe('from v4 negative')
  })

  it('falls back to uc for negative prompt', async () => {
    const png = buildNAIPng({
      prompt: 'test',
      uc: 'undesired content',
    })

    const result = await parseNAIMetadata(png)
    expect(result!.negativePrompt).toBe('undesired content')
  })

  it('extracts SMEA flags', async () => {
    const png = buildNAIPng({
      prompt: 'test',
      sm: true,
      sm_dyn: false,
    })

    const result = await parseNAIMetadata(png)
    expect(result!.smea).toBe(true)
    expect(result!.smeaDyn).toBe(false)
  })

  it('extracts variety flag from skip_cfg_above_sigma', async () => {
    const png = buildNAIPng({
      prompt: 'test',
      skip_cfg_above_sigma: 19,
    })

    const result = await parseNAIMetadata(png)
    expect(result!.variety).toBe(true)
  })

  it('extracts vibe transfer info', async () => {
    const png = buildNAIPng({
      prompt: 'test',
      reference_strength_multiple: [0.6, 0.8],
      reference_information_extracted_multiple: [1.0, 0.5],
    })

    const result = await parseNAIMetadata(png)
    expect(result!.hasVibeTransfer).toBe(true)
    expect(result!.vibeTransferInfo).toEqual([
      { strength: 0.6, informationExtracted: 1.0 },
      { strength: 0.8, informationExtracted: 0.5 },
    ])
  })

  it('extracts character reference info', async () => {
    const png = buildNAIPng({
      prompt: 'test',
      director_reference_strengths: [0.7],
      director_reference_secondary_strengths: [0.3],
    })

    const result = await parseNAIMetadata(png)
    expect(result!.hasCharacterReference).toBe(true)
    expect(result!.characterReferenceInfo).toEqual([
      { strength: 0.7, informationExtracted: 0.3 },
    ])
  })

  it('extracts cfg_rescale', async () => {
    const png = buildNAIPng({
      prompt: 'test',
      cfg_rescale: 0.7,
    })

    const result = await parseNAIMetadata(png)
    expect(result!.cfgRescale).toBe(0.7)
  })

  it('uses Source chunk for model name', async () => {
    const png = buildPngWithChunks([
      makeIHDR(),
      makeTextChunk('Source', 'nai-diffusion-4-5-full'),
      makeTextChunk('Comment', JSON.stringify({ prompt: 'test' })),
      makeIEND(),
    ])

    const result = await parseNAIMetadata(png)
    expect(result!.model).toBe('nai-diffusion-4-5-full')
  })

  it('accepts ArrayBuffer input', async () => {
    const png = buildNAIPng({ prompt: 'test' })
    const result = await parseNAIMetadata(png.buffer as ArrayBuffer)
    expect(result).not.toBeNull()
    expect(result!.prompt).toBe('test')
  })

  it('parses qualityToggle and ucPreset', async () => {
    const png = buildNAIPng({
      prompt: 'test',
      qualityToggle: true,
      ucPreset: 2,
    })

    const result = await parseNAIMetadata(png)
    expect(result!.qualityToggle).toBe(true)
    expect(result!.ucPreset).toBe(2)
  })

  it('preserves raw metadata', async () => {
    const raw = { prompt: 'test', customField: 'custom' }
    const png = buildNAIPng(raw)

    const result = await parseNAIMetadata(png)
    expect(result!.raw).toEqual(raw)
  })
})

describe('parseNAIMetadata - A1111 format', () => {
  it('parses A1111 format text in Comment chunk', async () => {
    const a1111Text = `1girl, standing
Negative prompt: lowres, bad anatomy
Steps: 28, Sampler: Euler a, CFG scale: 7, Seed: 42, Size: 512x768`

    const png = buildPngWithChunks([
      makeIHDR(),
      makeTextChunk('Comment', a1111Text),
      makeIEND(),
    ])

    const result = await parseNAIMetadata(png)
    expect(result).not.toBeNull()
    expect(result!.prompt).toBe('1girl, standing')
    expect(result!.negativePrompt).toBe('lowres, bad anatomy')
    expect(result!.steps).toBe(28)
    expect(result!.sampler).toBe('Euler a')
    expect(result!.cfgScale).toBe(7)
    expect(result!.seed).toBe(42)
    expect(result!.width).toBe(512)
    expect(result!.height).toBe(768)
  })

  it('parses A1111 format from parameters keyword', async () => {
    const a1111Text = `multiline prompt
with newlines
Negative prompt: bad quality
Steps: 20, Seed: 100, Size: 1024x1024`

    const png = buildPngWithChunks([
      makeIHDR(),
      makeTextChunk('parameters', a1111Text),
      makeIEND(),
    ])

    const result = await parseNAIMetadata(png)
    expect(result).not.toBeNull()
    expect(result!.prompt).toBe('multiline prompt\nwith newlines')
    expect(result!.negativePrompt).toBe('bad quality')
    expect(result!.steps).toBe(20)
    expect(result!.seed).toBe(100)
  })
})

describe('getUcPresetLabel', () => {
  it('returns known labels', () => {
    expect(getUcPresetLabel(0)).toBe('Heavy')
    expect(getUcPresetLabel(1)).toBe('Light')
    expect(getUcPresetLabel(2)).toBe('Furry')
    expect(getUcPresetLabel(3)).toBe('Human')
    expect(getUcPresetLabel(4)).toBe('None')
  })

  it('returns Unknown for unrecognized preset', () => {
    expect(getUcPresetLabel(99)).toBe('Unknown (99)')
  })
})
