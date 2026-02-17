/**
 * NAI Image Metadata Parser
 *
 * Extracts generation metadata from NovelAI images via:
 * 1. PNG tEXt chunks (Comment field with JSON)
 * 2. Stealth PNGInfo in alpha channel (persists through SNS uploads)
 *
 * Ported from: https://github.com/sunanakgo/NAIS2/blob/main/src/lib/metadata-parser.ts
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NAICharacterCaption {
  char_caption: string
  centers: Array<{ x: number; y: number }>
}

export interface NAIV4Prompt {
  caption?: {
    base_caption?: string
    char_captions?: NAICharacterCaption[]
  }
}

export interface NAIVibeTransferInfo {
  strength: number
  informationExtracted: number
}

export interface NAIMetadata {
  prompt?: string
  negativePrompt?: string

  model?: string
  steps?: number
  cfgScale?: number
  cfgRescale?: number
  seed?: number
  sampler?: string
  scheduler?: string

  smea?: boolean
  smeaDyn?: boolean
  variety?: boolean
  qualityToggle?: boolean
  ucPreset?: number

  width?: number
  height?: number

  v4_prompt?: NAIV4Prompt
  v4_negative_prompt?: NAIV4Prompt

  hasVibeTransfer?: boolean
  hasCharacterReference?: boolean
  vibeTransferInfo?: NAIVibeTransferInfo[]
  characterReferenceInfo?: NAIVibeTransferInfo[]

  source?: 'text_chunk' | 'stealth_alpha'
  raw?: Record<string, unknown>
}

// ─── Gzip decompression ─────────────────────────────────────────────────────

async function decompressGzip(data: Uint8Array): Promise<string> {
  try {
    if (typeof DecompressionStream !== 'undefined') {
      const stream = new DecompressionStream('gzip')
      const writer = stream.writable.getWriter()
      writer.write(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength))
      writer.close()

      const reader = stream.readable.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      return new TextDecoder('utf-8').decode(result)
    }
  } catch (e) {
    console.log('Native decompression failed:', e)
  }

  throw new Error('Gzip decompression not available')
}

// ─── Binary helpers ─────────────────────────────────────────────────────────

function binaryToString(binStr: string): string {
  const bytes: number[] = []
  for (let i = 0; i < binStr.length; i += 8) {
    const byte = binStr.slice(i, i + 8)
    if (byte.length === 8) bytes.push(parseInt(byte, 2))
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
}

function binaryToBytes(binStr: string): Uint8Array {
  const bytes: number[] = []
  for (let i = 0; i < binStr.length; i += 8) {
    const byte = binStr.slice(i, i + 8)
    if (byte.length === 8) bytes.push(parseInt(byte, 2))
  }
  return new Uint8Array(bytes)
}

// ─── Image type detection ───────────────────────────────────────────────────

function detectImageType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  return 'image/png'
}

// ─── Canvas ImageData extraction ────────────────────────────────────────────

async function getImageData(imageBytes: Uint8Array): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const mimeType = detectImageType(imageBytes)
    const blob = new Blob(
      [new Uint8Array(imageBytes.buffer as ArrayBuffer, imageBytes.byteOffset, imageBytes.byteLength)],
      { type: mimeType },
    )
    const url = URL.createObjectURL(blob)
    const img = new Image()

    img.onload = () => {
      let canvas: HTMLCanvasElement | null = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        URL.revokeObjectURL(url)
        img.src = ''
        canvas.width = 0
        canvas.height = 0
        resolve(null)
        return
      }

      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)

      // Release resources to prevent OOM
      URL.revokeObjectURL(url)
      img.src = ''
      canvas.width = 0
      canvas.height = 0
      canvas = null

      resolve(imageData)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      img.src = ''
      resolve(null)
    }

    img.src = url
  })
}

// ─── Stealth alpha channel extraction ───────────────────────────────────────

async function extractStealthMetadata(imageData: ImageData): Promise<NAIMetadata | null> {
  try {
    const { data, width, height } = imageData

    const getPixelAlpha = (x: number, y: number) => {
      const i = (y * width + x) * 4
      return data[i + 3]
    }

    const sigUncompressed = 'stealth_pnginfo'
    const sigCompressed = 'stealth_pngcomp'
    const sigLen = sigUncompressed.length * 8

    let bufferA = ''
    let indexA = 0
    let sigConfirmed = false
    let confirmingSignature = true
    let readingParamLen = false
    let readingParam = false
    let readEnd = false
    let paramLen = 0
    let binaryData = ''
    let compressed = false

    // Column-major traversal (x first, then y)
    for (let x = 0; x < width && !readEnd; x++) {
      for (let y = 0; y < height && !readEnd; y++) {
        const alpha = getPixelAlpha(x, y)
        bufferA += (alpha & 1).toString()
        indexA++

        if (confirmingSignature) {
          if (indexA === sigLen) {
            const sig = binaryToString(bufferA)
            if (sig === sigUncompressed) {
              confirmingSignature = false
              sigConfirmed = true
              readingParamLen = true
              compressed = false
              bufferA = ''
              indexA = 0
            } else if (sig === sigCompressed) {
              confirmingSignature = false
              sigConfirmed = true
              readingParamLen = true
              compressed = true
              bufferA = ''
              indexA = 0
            } else {
              readEnd = true
              break
            }
          }
        } else if (readingParamLen) {
          if (indexA === 32) {
            paramLen = parseInt(bufferA, 2)
            readingParamLen = false
            readingParam = true
            bufferA = ''
            indexA = 0
          }
        } else if (readingParam) {
          if (indexA === paramLen) {
            binaryData = bufferA
            readEnd = true
            break
          }
        }
      }
    }

    if (!sigConfirmed || binaryData.length === 0) return null

    const byteData = binaryToBytes(binaryData)
    let jsonString: string
    if (compressed) {
      jsonString = await decompressGzip(byteData)
    } else {
      jsonString = new TextDecoder('utf-8').decode(byteData)
    }

    let jsonData = JSON.parse(jsonString)
    if (jsonData.Comment && typeof jsonData.Comment === 'string') {
      try {
        jsonData.Comment = JSON.parse(jsonData.Comment)
      } catch { /* ignore */ }
    }

    const sourceData = jsonData.Comment || jsonData
    const metadata = convertNAIFormat(sourceData)
    metadata.source = 'stealth_alpha'
    return metadata
  } catch (error) {
    console.log('Stealth metadata extraction failed:', error)
    return null
  }
}

// ─── PNG tEXt chunk extraction ──────────────────────────────────────────────

async function extractTextChunkMetadata(bytes: Uint8Array): Promise<NAIMetadata | null> {
  let offset = 8
  let metadata: NAIMetadata | null = null
  let modelSource: string | null = null

  while (offset < bytes.length) {
    const length =
      (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) | bytes[offset + 3]
    offset += 4

    const type = String.fromCharCode(
      bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],
    )
    offset += 4

    if (type === 'tEXt' || type === 'iTXt') {
      const chunkData = bytes.slice(offset, offset + length)
      const textData = new TextDecoder('utf-8').decode(chunkData)
      const nullIndex = textData.indexOf('\0')

      if (nullIndex !== -1) {
        const keyword = textData.slice(0, nullIndex)
        let value = textData.slice(nullIndex + 1)

        if (type === 'iTXt') {
          const parts = value.split('\0')
          value = parts[parts.length - 1] || value
        }

        if (keyword === 'Comment' || keyword === 'parameters') {
          try {
            const parsed = JSON.parse(value)
            metadata = convertNAIFormat(parsed)
            metadata.source = 'text_chunk'
          } catch {
            metadata = parseA1111Format(value)
            if (metadata) metadata.source = 'text_chunk'
          }
        } else if (keyword === 'Source') {
          modelSource = value
        }
      }
    }

    offset += length + 4
    if (type === 'IEND') break
  }

  if (metadata && modelSource) {
    metadata.model = modelSource
  }

  return metadata
}

// ─── NAI format conversion ──────────────────────────────────────────────────

function convertNAIFormat(data: Record<string, unknown>): NAIMetadata {
  const metadata: NAIMetadata = { raw: data }

  if (data.prompt) metadata.prompt = String(data.prompt)

  // Negative prompt: V4 > uc > negative_prompt > undesired_content
  const v4Neg = data.v4_negative_prompt as NAIV4Prompt | undefined
  if (v4Neg?.caption?.base_caption) {
    metadata.negativePrompt = String(v4Neg.caption.base_caption)
  } else if (data.uc) {
    metadata.negativePrompt = String(data.uc)
  } else if (data.negative_prompt) {
    metadata.negativePrompt = String(data.negative_prompt)
  } else if (data.undesired_content) {
    metadata.negativePrompt = String(data.undesired_content)
  }

  if (data.steps) metadata.steps = Number(data.steps)
  if (data.scale) metadata.cfgScale = Number(data.scale)
  if (data.cfg_rescale) metadata.cfgRescale = Number(data.cfg_rescale)
  if (data.seed) metadata.seed = Number(data.seed)
  if (data.sampler) metadata.sampler = String(data.sampler)
  if (data.noise_schedule) metadata.scheduler = String(data.noise_schedule)

  if (typeof data.sm === 'boolean') metadata.smea = data.sm
  if (typeof data.sm_dyn === 'boolean') metadata.smeaDyn = data.sm_dyn
  if (data.skip_cfg_above_sigma !== undefined && data.skip_cfg_above_sigma !== null) {
    metadata.variety = true
  }

  if (typeof data.qualityToggle === 'boolean') metadata.qualityToggle = data.qualityToggle
  if (typeof data.ucPreset === 'number') metadata.ucPreset = data.ucPreset

  if (data.width) metadata.width = Number(data.width)
  if (data.height) metadata.height = Number(data.height)

  if (data.v4_prompt) metadata.v4_prompt = data.v4_prompt as NAIV4Prompt
  if (data.v4_negative_prompt) metadata.v4_negative_prompt = data.v4_negative_prompt as NAIV4Prompt

  // Vibe Transfer
  if (
    data.reference_strength_multiple &&
    Array.isArray(data.reference_strength_multiple) &&
    (data.reference_strength_multiple as number[]).length > 0
  ) {
    metadata.hasVibeTransfer = true
    const strengths = data.reference_strength_multiple as number[]
    const infoExtracted = (data.reference_information_extracted_multiple as number[]) || []
    metadata.vibeTransferInfo = strengths.map((strength, i) => ({
      strength,
      informationExtracted: infoExtracted[i] ?? 1.0,
    }))
  }

  // Character Reference
  if (
    data.director_reference_strengths &&
    Array.isArray(data.director_reference_strengths) &&
    (data.director_reference_strengths as unknown[]).length > 0
  ) {
    metadata.hasCharacterReference = true
    const strengths = data.director_reference_strengths as number[]
    const secondary = (data.director_reference_secondary_strengths as number[]) || []
    metadata.characterReferenceInfo = strengths.map((strength, i) => ({
      strength,
      informationExtracted: secondary[i] ?? 1.0,
    }))
  }

  return metadata
}

// ─── A1111 format fallback ──────────────────────────────────────────────────

function parseA1111Format(text: string): NAIMetadata | null {
  const lines = text.split('\n')
  if (lines.length < 2) return null

  const metadata: NAIMetadata = {}
  let negativeStart = -1
  let paramsStart = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Negative prompt:')) negativeStart = i
    else if (lines[i].match(/^Steps:/)) {
      paramsStart = i
      break
    }
  }

  if (negativeStart === -1 && paramsStart === -1) return null

  const promptEnd = negativeStart !== -1 ? negativeStart : paramsStart
  if (promptEnd > 0) metadata.prompt = lines.slice(0, promptEnd).join('\n')

  if (negativeStart !== -1 && paramsStart !== -1) {
    const negLines = lines.slice(negativeStart, paramsStart)
    negLines[0] = negLines[0].replace('Negative prompt: ', '')
    metadata.negativePrompt = negLines.join('\n')
  }

  if (paramsStart !== -1) {
    const paramsLine = lines[paramsStart]
    const params = paramsLine.split(', ')
    for (const param of params) {
      const [key, value] = param.split(': ')
      if (!key || !value) continue
      switch (key.trim()) {
        case 'Steps': metadata.steps = parseInt(value); break
        case 'Sampler': metadata.sampler = value; break
        case 'CFG scale': metadata.cfgScale = parseFloat(value); break
        case 'Seed': metadata.seed = parseInt(value); break
        case 'Size': {
          const [w, h] = value.split('x')
          metadata.width = parseInt(w)
          metadata.height = parseInt(h)
          break
        }
      }
    }
  }

  return metadata
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function parseNAIMetadata(
  imageData: ArrayBuffer | Uint8Array,
): Promise<NAIMetadata | null> {
  try {
    const bytes = imageData instanceof ArrayBuffer ? new Uint8Array(imageData) : imageData
    const imageType = detectImageType(bytes)

    let metadata: NAIMetadata | null = null

    // PNG: try tEXt chunks first (fast)
    if (imageType === 'image/png') {
      const pngSig = [137, 80, 78, 71, 13, 10, 26, 10]
      let isPng = true
      for (let i = 0; i < 8; i++) {
        if (bytes[i] !== pngSig[i]) { isPng = false; break }
      }
      if (isPng) metadata = await extractTextChunkMetadata(bytes)
    }

    // Fallback: stealth alpha channel
    if (!metadata) {
      const imgData = await getImageData(bytes)
      if (imgData) metadata = await extractStealthMetadata(imgData)
    }

    return metadata
  } catch (error) {
    console.error('Failed to parse metadata:', error)
    return null
  }
}

export async function parseMetadataFromFile(file: File): Promise<NAIMetadata | null> {
  const buffer = await file.arrayBuffer()
  return parseNAIMetadata(buffer)
}

// ─── UC Preset labels ───────────────────────────────────────────────────────

const UC_PRESET_LABELS: Record<number, string> = {
  0: 'Heavy',
  1: 'Light',
  2: 'Furry',
  3: 'Human',
  4: 'None',
}

export function getUcPresetLabel(preset: number): string {
  return UC_PRESET_LABELS[preset] ?? `Unknown (${preset})`
}
