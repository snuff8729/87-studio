import { unzipSync, zipSync } from 'fflate'
import sharp from 'sharp'
import { createLogger } from './logger'
import type { ResolvedPrompts } from './prompt'

const log = createLogger('nai-mock')

/** Mock mode is decided once, at server start. No network call to NAI is made. */
export const NAI_MOCK = process.env.NAI_MOCK === '1'

/** Prompt marker: every call fails. */
export const MOCK_FAIL_MARKER = '__mock_fail__'
/** Prompt marker: the first call per distinct prompt fails, later calls succeed. */
export const MOCK_FAIL_ONCE_MARKER = '__mock_fail_once__'
const failedOnce = new Set<string>()

export function getMockDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.NAI_MOCK_DELAY_MS)
  return env.NAI_MOCK_DELAY_MS != null && Number.isFinite(n) && n >= 0
    ? n
    : 1500
}

if (NAI_MOCK && !process.env.STUDIO_DATA_DIR) {
  // Fake images / vibe encodings must never land in the real ./data
  console.error(
    '\n[87-studio] FATAL: NAI_MOCK=1 requires STUDIO_DATA_DIR (a throwaway data dir). Refusing to start.\n',
  )
  process.exit(1)
}

if (NAI_MOCK) {
  const msg = `NAI_MOCK=1: NovelAI mock mode is ON. No request is sent to novelai.net; images are fake (delay ${getMockDelayMs()}ms).`
  log.warn('mock.enabled', msg)
  console.warn(`\n[87-studio] WARNING: ${msg}\n`)
}

function promptTexts(prompts: ResolvedPrompts): Array<string> {
  return [
    prompts.generalPrompt,
    prompts.negativePrompt,
    ...prompts.characterPrompts.flatMap((c) => [c.prompt, c.negative]),
  ]
}

export function promptTriggersMockFailure(prompts: ResolvedPrompts): boolean {
  return promptTexts(prompts).some((t) => t.includes(MOCK_FAIL_MARKER))
}

/** True once per distinct prompt carrying the fail-once marker. */
export function consumeFailOnce(prompts: ResolvedPrompts): boolean {
  const texts = promptTexts(prompts)
  if (!texts.some((t) => t.includes(MOCK_FAIL_ONCE_MARKER))) return false
  const key = texts.join('|')
  if (failedOnce.has(key)) return false
  failedOnce.add(key)
  return true
}

export function buildMockSvg(
  width: number,
  height: number,
  seed: number,
): string {
  const h1 = seed % 360
  const h2 = (h1 + 70) % 360
  const size = Math.max(16, Math.round(Math.min(width, height) / 12))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h1},70%,45%)"/><stop offset="1" stop-color="hsl(${h2},70%,25%)"/>
</linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${size}" font-weight="bold" fill="#ffffff">MOCK seed ${seed}</text>
</svg>`
}

export async function buildMockPng(
  width: number,
  height: number,
  seed: number,
): Promise<Uint8Array> {
  const buf = await sharp(Buffer.from(buildMockSvg(width, height, seed)))
    .png()
    .toBuffer()
  return new Uint8Array(buf)
}

/** The real API answers with a ZIP holding one PNG. */
export function buildMockZip(png: Uint8Array): Uint8Array {
  return zipSync({ 'image_0.png': png }, { level: 0 })
}

export async function mockGenerateImage(
  prompts: ResolvedPrompts,
  params: { width?: number; height?: number; seed?: number },
  seed: number,
): Promise<{ imageData: Uint8Array; seed: number }> {
  await new Promise((r) => setTimeout(r, getMockDelayMs()))
  if (promptTriggersMockFailure(prompts) || consumeFailOnce(prompts)) {
    log.error('mock.fail', 'Injected mock failure', { seed })
    throw new Error(
      `NAI API error 500: {"statusCode":500,"message":"Mock failure injected by prompt marker"}`,
    )
  }
  const png = await buildMockPng(
    params.width ?? 832,
    params.height ?? 1216,
    seed,
  )
  const files = unzipSync(buildMockZip(png))
  const entry = Object.entries(files).find(([n]) => /\.png$/i.test(n))
  return { imageData: entry![1], seed }
}

/** Fake vibe encoding: a small opaque blob, written by the caller as .bin. */
export async function mockEncodeVibe(): Promise<Uint8Array> {
  await new Promise((r) => setTimeout(r, Math.min(getMockDelayMs(), 500)))
  return new Uint8Array(Buffer.from('MOCK-VIBE-ENCODING'))
}
