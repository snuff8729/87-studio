// Style bundle smoke against a NAI_MOCK server, with REAL writes.
//
// Exercises (see docs/superpowers/specs/2026-11-01-style-bundles-design.md):
//   1. "Save as bundle" (components/common/save-as-bundle-dialog.tsx):
//      a. gallery image detail -> Style bundle (thumbnail + image_bundles +
//         prompt / negative / settings), "Open bundle" toast action
//      b. /metadata with a generated NAI PNG -> Style bundle (512px webp
//         preview_path), duplicate name = inline error, Text kind hides the
//         Negative / Settings sections, unchecked settings are not stored
//      c. screenshots of the dialog at 1440 and 390
//   2. Style bundle editing: negative + steps autosave, survive a reload, the
//      type switch keeps negative / settings
//   3. Workspace: `@{bundle:2D1}` in the general prompt -> Params tab "Style"
//      switches (`Style · 37`), steps switch off -> generate -> stored
//      parameters (steps = project value, scale = style value) and the style
//      negative appended to the final negative
//   4. Sequential wildcard of two styles + Seed Fix -> same seed, different
//      steps / negative / image_bundles per image
//   5. Quick Generate with one style
//   6. Settings: "Vary delay randomly" saved
//   7. Screenshots at 1440 and 390
//
// REFUSES to run unless the server shows the MOCK badge (NAI_MOCK=1) and the
// queue is idle, so it can never spend real NovelAI credits.
//
// Usage (throwaway data, dev server, from the repo root):
//   node scripts/demo/seed.mjs --out demo-style
//   NAI_MOCK=1 NAI_MOCK_DELAY_MS=300 STUDIO_DATA_DIR=<repo>/demo-style/data \
//     node node_modules/vite/bin/vite.js dev --port 3150 --strictPort
//   PW_CORE=<playwright-core> node scripts/smoke/style-bundles.mjs \
//     http://127.0.0.1:3150 demo-style/data/studio.db
//
// Args / env: argv[2] / SMOKE_BASE, argv[3] / SMOKE_DB, PW_CORE, CHROME,
//   SMOKE_OUT (screenshots), SMOKE_PROJECT (workspace project id).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const sharp = require('sharp')

const PW_CORE =
  process.env.PW_CORE ??
  'C:/Users/User/AppData/Local/Temp/claude/C--Users-User-project-snuff-87-studio/ebff346b-7e74-48c9-a979-5cbd5b9c3f0b/scratchpad/pw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(
  fs.existsSync(PW_CORE) ? pathToFileURL(PW_CORE).href : PW_CORE
)
const BASE = (
  process.argv[2] ??
  process.env.SMOKE_BASE ??
  'http://localhost:3001'
).replace(/\/$/, '')
const DB_PATH = path.resolve(
  process.argv[3] ?? process.env.SMOKE_DB ?? 'demo/data/studio.db',
)
const OUT = process.env.SMOKE_OUT ?? path.join(os.tmpdir(), '87studio-smoke')
fs.mkdirSync(OUT, { recursive: true })

let failures = 0
let consoleErrors = 0
const check = (cond, msg) => {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
  return !!cond
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, timeout, msg, every = 250) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      const v = await fn()
      if (v) return v
    } catch {
      /* retry */
    }
    await sleep(every)
  }
  check(false, `timeout: ${msg}`)
  return null
}
const refuse = (msg) => {
  console.error(`REFUSING to run: ${msg}`)
  process.exit(2)
}

if (!fs.existsSync(DB_PATH)) refuse(`DB not found: ${DB_PATH}`)
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
const q = (sql, ...a) => db.prepare(sql).all(...a)
const q1 = (sql, ...a) => db.prepare(sql).get(...a)
const idle = () =>
  q1(
    `select count(*) c from generation_jobs where status in ('pending','running')`,
  ).c === 0

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('87studio-locale', 'en')
  } catch {}
})
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() !== 'error') return
  if (/Failed to load resource/.test(m.text())) return
  consoleErrors++
  console.log(`  [console.error] ${m.text().slice(0, 300)}`)
})
page.on('pageerror', (e) => {
  consoleErrors++
  console.log(`  [pageerror] ${e.message.slice(0, 300)}`)
})
const shot = async (name) => {
  const file = path.join(OUT, `style-bundles-${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}
let welcomeHandled = false
async function open(route) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  const welcome = page
    .getByRole('dialog')
    .filter({ hasText: 'Welcome to 87 Studio' })
  if (
    !welcomeHandled &&
    (await welcome
      .waitFor({ timeout: 2500 })
      .then(() => true)
      .catch(() => false))
  ) {
    await welcome.getByRole('button', { name: 'Skip', exact: true }).click()
    await sleep(500)
    welcomeHandled = true
  }
}

// ── preflight ──
await open('/')
const badge = await page
  .locator('[data-testid="mock-badge"]')
  .first()
  .waitFor({ timeout: 15000 })
  .then(() => true)
  .catch(() => false)
if (!badge)
  refuse(
    `${BASE} does not show the MOCK badge (server not started with NAI_MOCK=1)`,
  )
if (!idle()) refuse('the queue of that DB is not idle (pending/running jobs)')
check(true, 'preflight: MOCK badge visible, queue idle')

const base = {
  batch: q1('select coalesce(max(id),0) m from generation_batches').m,
}
const projectId = Number(
  process.env.SMOKE_PROJECT ??
    q1(
      `select p.id from projects p where (select count(*) from project_scenes ps
         join project_scene_packs sp on sp.id = ps.project_scene_pack_id
         where sp.project_id = p.id) between 1 and 12 order by p.id limit 1`,
    )?.id,
)
if (!projectId) refuse('no project with scenes (set SMOKE_PROJECT)')

// ── helpers ──
const bundleRow = (name) =>
  q1('select * from prompt_bundles where name = ?', name)
const styleParams = (name) => JSON.parse(bundleRow(name)?.style_params ?? '{}')
const imgsOf = (batchId) =>
  q(
    `select i.id, i.seed, i.metadata from generated_images i
       join generation_jobs j on j.id = i.job_id
      where j.batch_id = ? order by i.id`,
    batchId,
  ).map((r) => ({ id: r.id, seed: r.seed, meta: JSON.parse(r.metadata) }))
const linkedBundles = (imageId) =>
  q(
    `select b.name n from image_bundles ib join prompt_bundles b on b.id = ib.bundle_id
      where ib.image_id = ? order by b.name`,
    imageId,
  ).map((r) => r.n)

/** Replace the content of the CodeMirror editor `loc` with `lines` */
async function typeLines(loc, lines) {
  await loc.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  for (let i = 0; i < lines.length; i++) {
    await page.keyboard.type(lines[i], { delay: 5 })
    await page.keyboard.press('Escape') // close autocomplete before Enter
    if (i < lines.length - 1) await page.keyboard.press('Enter')
  }
  await sleep(1300) // 800ms debounced save
}

/** A real PNG with a NovelAI-style "Comment" tEXt chunk (what /metadata parses) */
async function buildNaiPng(file, comment) {
  const png = await sharp({
    create: {
      width: 640,
      height: 960,
      channels: 3,
      background: { r: 200, g: 120, b: 160 },
    },
  })
    .png()
    .toBuffer()
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const text = chunk(
    'tEXt',
    Buffer.from('Comment\0' + JSON.stringify(comment), 'utf8'),
  )
  const ihdrEnd = 8 + 4 + 4 + 13 + 4
  fs.writeFileSync(
    file,
    Buffer.concat([png.subarray(0, ihdrEnd), text, png.subarray(ihdrEnd)]),
  )
}

const dialogLoc = page.locator('[data-save-as-bundle]')
const kindSeg = (k) => dialogLoc.locator(`[data-segment="${k}"]`)
const bundleDir = path.join(path.dirname(DB_PATH), 'bundle-previews')
const bundleImageLinks = (name) =>
  q(
    `select ib.image_id i from image_bundles ib
       join prompt_bundles b on b.id = ib.bundle_id where b.name = ? order by 1`,
    name,
  ).map((r) => r.i)

// ── 1a. gallery image -> style bundle ──
// Fixture: give one seeded image known prompts + settings (a single metadata
// update through a short-lived writable handle; everything else is UI).
const galleryImage = q1('select id from generated_images order by id limit 1')
if (!galleryImage) refuse('no generated image in this DB (seed it first)')
{
  const wdb = new Database(DB_PATH, { fileMustExist: true })
  wdb
    .prepare('update generated_images set metadata = ? where id = ?')
    .run(
      JSON.stringify({
        prompts: {
          generalPrompt: 'pastel colors, flat shading, smokelook',
          negativePrompt: 'blurry, 3d',
          characterPrompts: [{ name: 'A', prompt: 'ignored char prompt' }],
        },
        parameters: {
          width: 832,
          height: 1216,
          steps: 28,
          scale: 6,
          cfgRescale: 0.05,
          sampler: 'k_euler',
          scheduler: 'native',
          seed: 99,
        },
      }),
      galleryImage.id,
    )
  wdb.close()
}
// overlay entry (the image detail overlay opened over another page)
await open(`/bundles?imageDetail=${galleryImage.id}`)
const overlayBtn = page.locator('[data-detail-save-bundle]')
await overlayBtn.waitFor({ timeout: 15000 })
await overlayBtn.click()
await dialogLoc.waitFor({ timeout: 10000 })
check(true, 'overlay: "Save as bundle" opens the dialog')
await page.keyboard.press('Escape')
await dialogLoc.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})

// route entry (/gallery/$imageId header action)
await open(`/gallery/${galleryImage.id}`)
await page.locator('[data-detail-save-bundle]').first().click()
await dialogLoc.waitFor({ timeout: 10000 })
check(
  (await kindSeg('style').getAttribute('aria-checked')) === 'true',
  'dialog defaults to the Style kind',
)
check(
  (await dialogLoc.locator('[data-save-setting]').count()) === 5 &&
    (await dialogLoc
      .locator('[data-save-setting][data-state="checked"]')
      .count()) === 5,
  'five setting groups, all checked by default',
)
await dialogLoc.locator('[data-save-negative] .cm-content').waitFor({ timeout: 10000 })
check(
  /pastel colors/.test(await dialogLoc.locator('.cm-content').first().innerText()) &&
    !/ignored char/.test(await dialogLoc.innerText()) &&
    /blurry, 3d/.test(
      await dialogLoc.locator('[data-save-negative] .cm-content').innerText(),
    ),
  'prefilled with the image general prompt + negative (no character prompt)',
)
await dialogLoc.locator('[data-save-name]').fill('2D25')
await dialogLoc.locator('[data-save-submit]').click()
await until(() => bundleRow('2D25'), 8000, '2D25 created from the gallery image')
const b25 = bundleRow('2D25')
check(
  b25?.kind === 'style' &&
    b25.content === 'pastel colors, flat shading, smokelook' &&
    b25.negative === 'blurry, 3d' &&
    JSON.stringify(styleParams('2D25')) ===
      JSON.stringify({
        width: 832,
        height: 1216,
        steps: 28,
        scale: 6,
        cfgRescale: 0.05,
        sampler: 'k_euler',
        scheduler: 'native',
      }),
  `2D25 holds prompt, negative and settings (${b25?.style_params})`,
)
check(
  b25?.thumbnail_image_id === galleryImage.id &&
    JSON.stringify(bundleImageLinks('2D25')) ===
      JSON.stringify([galleryImage.id]) &&
    !b25?.preview_path,
  'gallery image became the thumbnail and is linked (image_bundles)',
)
const openAction = page.getByRole('button', { name: 'Open bundle' })
await openAction.waitFor({ timeout: 8000 })
await openAction.click()
await page.waitForURL(/\/bundles\?.*bundle=2D25/, { timeout: 10000 })
check(
  await page
    .locator('[data-style-settings]')
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false),
  '"Open bundle" toast action opens the new bundle selected',
)

// ── 1b. /metadata upload -> style bundle ──
const pngFile = path.join(OUT, 'smoke-nai.png')
await buildNaiPng(pngFile, {
  prompt: 'artist:smokeartist, soft shading',
  uc: 'lowres, watermark',
  steps: 28,
  scale: 5.5,
  cfg_rescale: 0.16,
  width: 832,
  height: 1216,
  sampler: 'k_euler_ancestral',
  noise_schedule: 'karras',
  seed: 1234,
})
await open('/metadata')
await page.locator('input[type="file"]').first().setInputFiles(pngFile)
const saveOpen = page.locator('[data-save-as-bundle-open]')
await saveOpen.waitFor({ timeout: 15000 })
await saveOpen.click()
await dialogLoc.waitFor({ timeout: 10000 })
await dialogLoc.locator('[data-save-negative] .cm-content').waitFor({ timeout: 10000 })
check(
  /artist:smokeartist/.test(
    await dialogLoc.locator('.cm-content').first().innerText(),
  ) &&
    /watermark/.test(
      await dialogLoc.locator('[data-save-negative] .cm-content').innerText(),
    ) &&
    (await dialogLoc.locator('[data-save-setting]').count()) === 5,
  'metadata page: dialog prefilled from the parsed PNG metadata',
)
// duplicate name -> inline error, Save disabled
await dialogLoc.locator('[data-save-name]').fill('2D25')
check(
  await dialogLoc
    .locator('[data-save-name-error]')
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false),
  'duplicate name shows an inline error',
)
check(
  await dialogLoc.locator('[data-save-submit]').isDisabled(),
  'Save is disabled while the name is taken',
)
await dialogLoc.locator('[data-save-name]').fill('2D1')
await shot('save-dialog-1440')
await page.setViewportSize({ width: 390, height: 844 })
await sleep(500)
await shot('save-dialog-390')
await page.setViewportSize({ width: 1440, height: 900 })
await sleep(300)
await dialogLoc.locator('[data-save-submit]').click()
await until(() => bundleRow('2D1'), 8000, '2D1 created from the metadata page')
const b1 = bundleRow('2D1')
check(
  b1?.kind === 'style' &&
    b1.content === 'artist:smokeartist, soft shading' &&
    b1.negative === 'lowres, watermark' &&
    styleParams('2D1').steps === 28 &&
    styleParams('2D1').scale === 5.5 &&
    styleParams('2D1').cfgRescale === 0.16 &&
    styleParams('2D1').width === 832 &&
    styleParams('2D1').sampler === 'k_euler_ancestral' &&
    styleParams('2D1').scheduler === 'karras',
  `2D1 holds the metadata values (${b1?.style_params})`,
)
const previewFile = path.join(bundleDir, `${b1?.id}.webp`)
const previewMeta = fs.existsSync(previewFile)
  ? await sharp(previewFile).metadata()
  : null
check(
  b1?.preview_path === `data/bundle-previews/${b1?.id}.webp` &&
    previewMeta?.format === 'webp' &&
    Math.max(previewMeta.width, previewMeta.height) === 512 &&
    !b1?.thumbnail_image_id,
  `upload stored as a 512px webp preview (${previewMeta?.width}x${previewMeta?.height})`,
)

// Text kind: no negative / settings; a partial style: unchecked groups dropped
await open('/metadata')
await page.locator('input[type="file"]').first().setInputFiles(pngFile)
await page.locator('[data-save-as-bundle-open]').click()
await dialogLoc.waitFor({ timeout: 10000 })
await kindSeg('text').click()
check(
  (await dialogLoc.locator('[data-save-negative]').count()) === 0 &&
    (await dialogLoc.locator('[data-save-settings]').count()) === 0,
  'Text kind hides the Negative and Settings sections',
)
await dialogLoc.locator('[data-save-name]').fill('metatext')
await dialogLoc.locator('[data-save-submit]').click()
await until(() => bundleRow('metatext'), 8000, 'metatext created')
check(
  bundleRow('metatext')?.kind === 'text' &&
    bundleRow('metatext')?.negative === '' &&
    bundleRow('metatext')?.style_params == null &&
    bundleRow('metatext')?.content === 'artist:smokeartist, soft shading',
  'Text bundle stores only the prompt',
)
await open('/metadata')
await page.locator('input[type="file"]').first().setInputFiles(pngFile)
await page.locator('[data-save-as-bundle-open]').click()
await dialogLoc.waitFor({ timeout: 10000 })
await dialogLoc.locator('[data-save-setting="size"]').click()
await dialogLoc.locator('[data-save-setting="steps"]').click()
await dialogLoc.locator('[data-save-name]').fill('partial')
await dialogLoc.locator('[data-save-submit]').click()
await until(() => bundleRow('partial'), 8000, 'partial created')
check(
  JSON.stringify(styleParams('partial')) ===
    JSON.stringify({
      scale: 5.5,
      cfgRescale: 0.16,
      sampler: 'k_euler_ancestral',
      scheduler: 'karras',
    }),
  `unchecked setting groups are not stored (${bundleRow('partial')?.style_params})`,
)

await open('/bundles')
check(
  (await page.locator('[data-style-badge]').count()) >= 3,
  'list shows the Style badge on the saved bundles',
)
check(
  await page
    .locator('[data-list-row]', { hasText: '2D1' })
    .first()
    .locator('img[src*="/api/bundle-previews/"]')
    .evaluate((img) => img.complete && img.naturalWidth > 0)
    .catch(() => false),
  'list thumbnail shows the stored preview and loads',
)

// ── 2. edit a style bundle ──
await open('/bundles?bundle=2D1')
await page.locator('[data-style-settings]').waitFor({ timeout: 15000 })
check(
  (await page.locator('[data-style-negative]').count()) === 1,
  'Style type shows the Negative and Settings sections',
)
const neg = page.locator('[data-style-negative] .cm-content')
await neg.waitFor({ timeout: 10000 })
await typeLines(neg, ['smokeneg'])
const stepsThumb = page.locator('[data-style-settings] [role="slider"]').first()
await stepsThumb.focus()
for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight')
await sleep(1300)
check(
  bundleRow('2D1')?.negative === 'smokeneg' && styleParams('2D1').steps === 37,
  `negative + steps autosaved (${bundleRow('2D1')?.negative}, steps ${styleParams('2D1').steps})`,
)
await page.reload({ waitUntil: 'networkidle' })
await page.locator('[data-style-settings]').waitFor({ timeout: 15000 })
check(
  (await page
    .locator('[data-style-settings] [role="slider"]')
    .first()
    .getAttribute('aria-valuenow')) === '37' &&
    /smokeneg/.test(
      await page.locator('[data-style-negative] .cm-content').innerText(),
    ),
  'edits survive a reload',
)
await shot('bundle-style-1440')

// type switch keeps the style data
await page.locator('[data-bundle-kind] [data-segment="text"]').click()
await sleep(1300)
check(
  bundleRow('2D1')?.kind === 'text' &&
    bundleRow('2D1')?.negative === 'smokeneg' &&
    styleParams('2D1').steps === 37,
  'switching to Text keeps negative and settings (hidden)',
)
check(
  (await page.locator('[data-style-settings]').count()) === 0,
  'Text type hides the style sections',
)
await page.locator('[data-bundle-kind] [data-segment="style"]').click()
await sleep(1300)
check(
  bundleRow('2D1')?.kind === 'style' &&
    (await page.locator('[data-style-settings]').count()) === 1,
  'switching back to Style restores the sections',
)

// mobile screenshot of the bundle detail
await page.setViewportSize({ width: 390, height: 844 })
await open('/bundles?bundle=2D1')
await page.locator('[data-style-settings]').waitFor({ timeout: 15000 })
await shot('bundle-style-390')
await page.setViewportSize({ width: 1440, height: 900 })

// ── 3. workspace: general prompt with a style ──
const projectRow = q1(
  'select parameters p from projects where id = ?',
  projectId,
)
const projectParams = JSON.parse(projectRow.p || '{}')
const projectSteps = projectParams.steps ?? 28
const projectRescale = projectParams.cfgRescale ?? 0
check(
  projectSteps !== 37 && projectRescale !== 0.16,
  `project steps ${projectSteps} / rescale ${projectRescale} differ from the style`,
)
await open(`/workspace/${projectId}`)
const promptEditor = page.locator(
  '[data-onboarding="prompt-editor"] .cm-content',
)
await promptEditor.first().waitFor({ timeout: 15000 })
await typeLines(promptEditor.first(), ['1girl, @{bundle:2D1}'])
await page.getByRole('tab', { name: 'Params' }).click()
const stepsSwitch = page.locator('[data-style-follow="steps"]')
await stepsSwitch.waitFor({ timeout: 10000 })
check(
  (await page.locator('[data-param-value="steps"]').innerText()) ===
    'Style · 37',
  'Params tab: steps shows "Style · 37"',
)
check(
  (await stepsSwitch.getAttribute('aria-checked')) === 'true',
  'Style switches default to on',
)
check(
  (await page.locator('[data-style-over-free="steps"]').count()) === 1 &&
    (await page.locator('[data-style-over-free="resolution"]').count()) === 0,
  'steps 37 (> 28) shows the over-free-range warning; 832x1216 does not',
)
await shot('params-1440')
await stepsSwitch.click()
await sleep(1500)
check(
  (await page.locator('[data-param-value="steps"]').innerText()) ===
    String(projectSteps),
  'steps switch off -> project value shown',
)
check(
  JSON.parse(q1('select parameters p from projects where id = ?', projectId).p)
    .styleFollow?.steps === false,
  'projects.parameters.styleFollow.steps = false saved',
)
// mobile Params tab
await page.setViewportSize({ width: 390, height: 844 })
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('tab', { name: 'Params' }).click()
await page.locator('[data-style-follow="scale"]').waitFor({ timeout: 10000 })
await shot('params-390')
await page.setViewportSize({ width: 1440, height: 900 })
await page.reload({ waitUntil: 'networkidle' })

const inputs = page.locator('[title="Images to generate"] input')
await inputs.first().waitFor({ timeout: 15000 })
const n = await inputs.count()
for (let i = 0; i < n; i++) {
  const want = i === 0 ? 1 : 0
  const input = inputs.nth(i)
  if ((await input.inputValue()) === String(want)) continue
  await input.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(String(want))
  await page.keyboard.press('Enter')
  await sleep(120)
}
await page
  .getByRole('button', { name: /^Generate \d+$/ })
  .first()
  .click()
const wsBatch = await until(
  () => q1('select * from generation_batches where id > ?', base.batch),
  10000,
  'workspace batch created',
)
await until(
  () => wsBatch && idle() && imgsOf(wsBatch.id).length >= 1,
  60000,
  'workspace batch finished',
  400,
)
const wsImg = wsBatch ? imgsOf(wsBatch.id)[0] : null
const wsNeg = wsImg?.meta.prompts.negativePrompt ?? ''
check(
  wsImg?.meta.parameters.steps === projectSteps &&
    wsImg?.meta.parameters.cfgRescale === 0.16,
  `workspace image: steps = project (${wsImg?.meta.parameters.steps}), rescale = style (${wsImg?.meta.parameters.cfgRescale})`,
)
check(
  wsNeg.endsWith('smokeneg'),
  `workspace image: negative ends with the style negative (…${wsNeg.slice(-30)})`,
)
check(
  wsImg?.meta.parameters.styleFollow === undefined &&
    wsImg?.meta.style?.bundle === '2D1' &&
    JSON.stringify(wsImg?.meta.style?.applied) ===
      JSON.stringify(['resolution', 'scale', 'cfgRescale', 'sampler']),
  `metadata.style recorded (${JSON.stringify(wsImg?.meta.style)}), styleFollow not stored`,
)
check(
  wsImg && linkedBundles(wsImg.id).includes('2D1'),
  'image is linked to the style bundle (image_bundles)',
)
check(
  /@\{bundle:2D1\}/.test(
    q1('select general_prompt g from projects where id = ?', projectId).g,
  ) && !wsImg?.meta.prompts.generalPrompt.includes('@{bundle'),
  'general prompt text holds the style prompt',
)

// ── 4. wildcard of styles + Seed Fix ──
await open('/bundles')
await page.locator('[data-new-bundle]').click()
await page.getByPlaceholder('Bundle name').fill('stylewc')
await page.keyboard.press('Enter')
await until(() => bundleRow('stylewc'), 8000, 'stylewc created')
await page.locator('.cm-content').first().waitFor({ timeout: 10000 })
await page.locator('[data-bundle-kind] [data-segment="wildcard"]').click()
await page.getByRole('radio', { name: 'Sequential' }).click()
await typeLines(page.locator('.cm-content').first(), [
  '@{bundle:2D1}',
  '@{bundle:2D25}',
])
check(
  bundleRow('stylewc')?.kind === 'wildcard' &&
    bundleRow('stylewc')?.wildcard_mode === 'sequential' &&
    bundleRow('stylewc')?.content === '@{bundle:2D1}\n@{bundle:2D25}',
  'wildcard bundle with two style option lines saved',
)

async function quick(prompt, count, parameters, label) {
  await open('/generate')
  await page.evaluate(
    ([p, c, params]) =>
      localStorage.setItem(
        '87studio-quick-generate',
        JSON.stringify({
          generalPrompt: p,
          negativePrompt: 'baseneg',
          characters: [],
          parameters: params,
          count: c,
        }),
      ),
    [prompt, count, parameters],
  )
  await page.reload({ waitUntil: 'networkidle' })
  const btn = page.getByRole('button', { name: /^Generate \d+$/ }).first()
  await btn.waitFor({ timeout: 15000 })
  const before = q1('select coalesce(max(id),0) m from generation_batches').m
  await btn.click()
  const b = await until(
    () => q1('select * from generation_batches where id > ?', before),
    10000,
    `${label}: batch created`,
  )
  await until(
    () => b && idle() && imgsOf(b.id).length >= count,
    60000,
    `${label}: finished`,
    400,
  )
  return b ? imgsOf(b.id) : []
}

const cmp = await quick(
  '1girl, @{bundle:stylewc}',
  2,
  { seed: 4242 },
  'compare',
)
check(cmp.length === 2, 'Seed Fix + sequential style wildcard -> 2 images')
check(
  cmp.length === 2 && cmp[0].seed === 4242 && cmp[1].seed === 4242,
  `both images use the same seed (${cmp.map((c) => c.seed)})`,
)
check(
  cmp[0]?.meta.parameters.steps === 37 &&
    cmp[1]?.meta.parameters.steps === 28 &&
    cmp[0]?.meta.parameters.scale === 5.5 &&
    cmp[1]?.meta.parameters.scale === 6,
  `settings differ per style (steps ${cmp.map((c) => c.meta.parameters.steps)}, scale ${cmp.map((c) => c.meta.parameters.scale)})`,
)
check(
  cmp[0]?.meta.prompts.negativePrompt.endsWith('smokeneg') &&
    cmp[0]?.meta.prompts.negativePrompt.startsWith('baseneg') &&
    cmp[1]?.meta.prompts.negativePrompt.startsWith('baseneg, ') &&
    cmp[1]?.meta.prompts.negativePrompt !== cmp[0]?.meta.prompts.negativePrompt,
  'negatives: base negative + each style negative',
)
check(
  cmp[0]?.meta.prompts.generalPrompt !== cmp[1]?.meta.prompts.generalPrompt &&
    cmp[0]?.meta.style?.bundle === '2D1' &&
    cmp[1]?.meta.style?.bundle === '2D25',
  'prompts and metadata.style differ per image',
)
check(
  JSON.stringify(linkedBundles(cmp[0]?.id)) ===
    JSON.stringify(['2D1', 'stylewc']) &&
    JSON.stringify(linkedBundles(cmp[1]?.id)) ===
      JSON.stringify(['2D25', 'stylewc']),
  `image_bundles link each style (${linkedBundles(cmp[0]?.id)} | ${linkedBundles(cmp[1]?.id)})`,
)

// ── 5. Quick Generate with one style ──
const one = await quick('q @{bundle:2D25}', 1, {}, 'quick style')
check(
  one[0]?.meta.parameters.steps === 28 &&
    one[0]?.meta.parameters.scale === 6 &&
    one[0]?.meta.parameters.cfgRescale === 0.05 &&
    one[0]?.meta.prompts.negativePrompt.startsWith('baseneg, '),
  'quick: style settings + negative applied',
)
// follow switches off in the stored parameters -> project (quick) values stay
const off = await quick(
  'q @{bundle:2D25}',
  1,
  {
    steps: 20,
    scale: 4,
    styleFollow: { steps: false, scale: false },
  },
  'quick follow off',
)
check(
  off[0]?.meta.parameters.steps === 20 &&
    off[0]?.meta.parameters.scale === 4 &&
    off[0]?.meta.parameters.cfgRescale === 0.05,
  'quick: switched-off items keep their own values, the rest follow',
)
// Random resolution wins over the style resolution
const rr = await quick(
  'q @{bundle:2D25}',
  1,
  { randomResolution: true },
  'quick random resolution',
)
check(
  rr[0] &&
    [
      [832, 1216],
      [1216, 832],
      [1024, 1024],
    ].some(
      ([w, h]) =>
        rr[0].meta.parameters.width === w && rr[0].meta.parameters.height === h,
    ) &&
    !rr[0].meta.style?.applied.includes('resolution'),
  'random resolution beats the style resolution',
)
// an old-style prompt without any style behaves as before
const plain = await quick('q plain', 1, {}, 'no style')
check(
  plain[0] &&
    plain[0].meta.style === undefined &&
    plain[0].meta.prompts.negativePrompt === 'baseneg',
  'no style: negative and parameters untouched',
)

// ── 5b. delay applies between jobs of a batch (1 image per scene) ──
await open('/settings')
const delayInput = page.locator('#delay-input')
await delayInput.waitFor({ timeout: 10000 })
await delayInput.fill('2000')
await delayInput.blur()
await until(
  () =>
    q1(`select value v from settings where key = 'generation_delay'`)?.v ===
    '2000',
  8000,
  'delay 2000 saved',
)
await open(`/workspace/${projectId}`)
const multiInputs = page.locator('[title="Images to generate"] input')
await multiInputs.first().waitFor({ timeout: 15000 })
const mn = await multiInputs.count()
for (let i = 0; i < mn; i++) {
  const want = i < 3 ? 1 : 0
  const input = multiInputs.nth(i)
  if ((await input.inputValue()) === String(want)) continue
  await input.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(String(want))
  await page.keyboard.press('Enter')
  await sleep(120)
}
const beforeMulti = q1('select coalesce(max(id),0) m from generation_batches').m
await page
  .getByRole('button', { name: /^Generate \d+$/ })
  .first()
  .click()
const multiBatch = await until(
  () => q1('select * from generation_batches where id > ?', beforeMulti),
  10000,
  'multi-scene batch created',
)
await until(
  () => multiBatch && idle() && imgsOf(multiBatch.id).length >= 3,
  90000,
  'multi-scene batch finished',
  400,
)
const stamps = q(
  `select i.created_at c from generated_images i join generation_jobs j on j.id = i.job_id
    where j.batch_id = ? order by i.id`,
  multiBatch?.id ?? 0,
).map((r) => Date.parse(r.c.replace(' ', 'T') + 'Z'))
check(
  stamps.length === 3 && stamps[2] - stamps[0] >= 3500,
  `3 one-image jobs are spaced by the 2s delay (span ${stamps[2] - stamps[0]}ms)`,
)
await open('/settings')
await page.locator('#delay-input').fill('500')
await page.locator('#delay-input').blur()
await sleep(800)

// ── 6. settings: delay jitter ──
await open('/settings')
const jitter = page.locator('[data-delay-jitter]')
await jitter.waitFor({ timeout: 10000 })
check(
  (await jitter.getAttribute('aria-checked')) === 'false',
  'jitter switch defaults to off',
)
await jitter.click()
await until(
  () =>
    q1(`select value v from settings where key = 'generation_delay_jitter'`)
      ?.v === '1',
  8000,
  'jitter setting saved',
)
await page.reload({ waitUntil: 'networkidle' })
check(
  (await page.locator('[data-delay-jitter]').getAttribute('aria-checked')) ===
    'true',
  'jitter switch stays on after reload',
)
await shot('settings-1440')

check(consoleErrors === 0, `no console errors (${consoleErrors})`)
await browser.close()
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
