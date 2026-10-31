// Wildcard (list) bundle smoke against a NAI_MOCK server, with REAL writes.
//
// Exercises: creating a text bundle and wildcard bundles in the /bundles
// editor (Wildcard switch, Random/Sequential, option count, list badge, "Add
// bundle" popover), then generating and checking (read-only DB) the prompts
// stored with every image:
//   - workspace: `@{bundle:wcexpression}` sequential x4 -> 1, 2, 3, 1
//   - Quick Generate: `:random` override, `:seq` override, fixed option
//     `@{bundle:wcexpression:wccrying}`, a bundle-ref option line and a fixed
//     option addressed by the referenced bundle's name
//   - metadata.wildcards, usedBundleIds link (image_bundles), gallery
//     promptTag filter matching the chosen option.
//
// REFUSES to run unless the server shows the MOCK badge (NAI_MOCK=1) and the
// queue is idle, so it can never spend real NovelAI credits.
//
// Usage (throwaway data, dev server, from the repo root):
//   node scripts/demo/seed.mjs --out demo-wild
//   NAI_MOCK=1 NAI_MOCK_DELAY_MS=300 STUDIO_DATA_DIR=<repo>/demo-wild/data \
//     node node_modules/vite/bin/vite.js dev --port 3130 --strictPort
//   PW_CORE=<playwright-core> node scripts/smoke/wildcard.mjs \
//     http://127.0.0.1:3130 demo-wild/data/studio.db
//
// Args / env: argv[2] / SMOKE_BASE, argv[3] / SMOKE_DB, PW_CORE, CHROME,
//   SMOKE_OUT (screenshots), SMOKE_PROJECT (workspace project id).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

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
  const file = path.join(OUT, `wildcard-${name}.png`)
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
  image: q1('select coalesce(max(id),0) m from generated_images').m,
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

// ── editor helpers ──
/** Replace the content of the CodeMirror editor `loc` with `lines` */
async function typeLines(loc, lines) {
  await loc.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  for (let i = 0; i < lines.length; i++) {
    await page.keyboard.type(lines[i], { delay: 5 })
    // close any autocomplete popup before Enter would accept it
    await page.keyboard.press('Escape')
    if (i < lines.length - 1) await page.keyboard.press('Enter')
  }
  await sleep(1200) // 800ms debounced save
}
const bundleRow = (name) =>
  q1('select * from prompt_bundles where name = ?', name)

async function createBundleUI(name) {
  await open('/bundles')
  await page.locator('[data-new-bundle]').click()
  await page.getByPlaceholder('Bundle name').fill(name)
  await page.keyboard.press('Enter')
  await until(() => bundleRow(name), 8000, `bundle ${name} created`)
  await page.locator('.cm-content').first().waitFor({ timeout: 10000 })
}

// ── 1. bundles: text bundle + wildcard bundles via the editor ──
await createBundleUI('wcgrin')
await typeLines(page.locator('.cm-content').first(), ['wcgrin, teeth'])
check(
  bundleRow('wcgrin')?.content === 'wcgrin, teeth' &&
    bundleRow('wcgrin')?.kind === 'text',
  'text bundle saved (kind text)',
)

await createBundleUI('wcexpression')
await page.locator('[data-wildcard-switch]').click()
await page.getByRole('radio', { name: 'Sequential' }).click()
await typeLines(page.locator('.cm-content').first(), [
  'wcsmile',
  'wccrying',
  'wcangry',
])
let wb = bundleRow('wcexpression')
check(wb?.kind === 'wildcard', 'wildcard switch saved kind=wildcard')
check(wb?.wildcard_mode === 'sequential', 'segmented control saved sequential')
check(
  wb?.content === 'wcsmile\nwccrying\nwcangry',
  `wildcard content saved (${JSON.stringify(wb?.content)})`,
)
check(
  /3/.test(await page.locator('[data-wildcard-count]').innerText()),
  'editor shows option count 3',
)
check(
  (await page.locator('[data-wildcard-badge]').count()) >= 1,
  'bundle list row shows the wildcard badge',
)
await shot('editor-1440')

// second wildcard: option lines that are text-bundle refs (Add bundle popover)
await createBundleUI('wcmood')
await page.locator('[data-wildcard-switch]').click()
await page.locator('[data-add-bundle-line]').click()
await page.getByPlaceholder('Search bundles...').last().fill('wcgrin')
await page.getByRole('option', { name: 'wcgrin' }).click()
await sleep(1200)
check(
  bundleRow('wcmood')?.content === '@{bundle:wcgrin}',
  `Add bundle appended @{bundle:wcgrin} (${JSON.stringify(bundleRow('wcmood')?.content)})`,
)
await page.locator('.cm-content').first().click()
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter')
await page.keyboard.type('wcsad, wctears', { delay: 5 })
await page.keyboard.press('Escape')
await sleep(1200)
check(
  bundleRow('wcmood')?.content === '@{bundle:wcgrin}\nwcsad, wctears',
  `manual line added (${JSON.stringify(bundleRow('wcmood')?.content)})`,
)
check(bundleRow('wcmood')?.wildcard_mode === 'random', 'default mode is random')

// mobile screenshot of the editor in wildcard mode
await page.setViewportSize({ width: 390, height: 844 })
await open('/bundles?bundle=wcexpression')
await page.locator('[data-wildcard-switch]').waitFor({ timeout: 10000 })
await shot('editor-390')
await page.setViewportSize({ width: 1440, height: 900 })

// ── 2. workspace: sequential default mode, 4 images of one scene ──
await open(`/workspace/${projectId}`)
const promptEditor = page.locator(
  '[data-onboarding="prompt-editor"] .cm-content',
)
await promptEditor.first().waitFor({ timeout: 15000 })
await typeLines(promptEditor.first(), ['1girl, @{bundle:wcexpression}'])
check(
  /@\{bundle:wcexpression\}/.test(
    q1('select general_prompt g from projects where id = ?', projectId).g,
  ),
  'project prompt references the wildcard bundle',
)
// editor classification: the ref gets the wildcard style, not the invalid one
check(
  (await page.locator('.cm-bundle-wildcard-highlight').count()) >= 1,
  'editor highlights the wildcard ref with the wildcard style',
)
await page.reload({ waitUntil: 'networkidle' })
const inputs = page.locator('[title="Images to generate"] input')
await inputs.first().waitFor({ timeout: 15000 })
const n = await inputs.count()
for (let i = 0; i < n; i++) {
  const want = i === 0 ? 4 : 0
  const input = inputs.nth(i)
  if ((await input.inputValue()) === String(want)) continue
  await input.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(String(want))
  await page.keyboard.press('Enter')
  await sleep(120)
}
const genBtn = page.getByRole('button', { name: /^Generate \d+$/ }).first()
await genBtn.click()
const batch = await until(
  () => q1('select * from generation_batches where id > ?', base.batch),
  10000,
  'workspace batch created',
)
await until(() => idle(), 60000, 'workspace batch finished', 500)
const imgsOf = (batchId) =>
  q(
    `select i.id, i.metadata from generated_images i
       join generation_jobs j on j.id = i.job_id
      where j.batch_id = ? order by i.id`,
    batchId,
  ).map((r) => ({ id: r.id, meta: JSON.parse(r.metadata) }))
const wsImgs = batch ? imgsOf(batch.id) : []
check(wsImgs.length === 4, `workspace: 4 images (${wsImgs.length})`)
const wsGeneral = wsImgs.map((i) => i.meta.prompts.generalPrompt)
check(
  JSON.stringify(wsGeneral) ===
    JSON.stringify([
      '1girl, wcsmile',
      '1girl, wccrying',
      '1girl, wcangry',
      '1girl, wcsmile',
    ]),
  `sequential order smile, crying, angry, smile (${JSON.stringify(wsGeneral)})`,
)
check(
  wsImgs.every((i) => !/@\{wc:/.test(JSON.stringify(i.meta.prompts))),
  'stored prompts hold no wildcard markers',
)
const w0 = wsImgs[1]?.meta.wildcards?.[0]
check(
  w0?.bundle === 'wcexpression' &&
    w0?.mode === 'sequential' &&
    w0?.option === 'wccrying' &&
    w0?.index === 1,
  `metadata.wildcards recorded (${JSON.stringify(w0)})`,
)
check(
  wsImgs.every(
    (i) =>
      q1(
        `select count(*) c from image_bundles ib
           join prompt_bundles b on b.id = ib.bundle_id
          where ib.image_id = ? and b.name = 'wcexpression'`,
        i.id,
      ).c === 1,
  ),
  'images are linked to the wildcard bundle (image_bundles)',
)

// scene preview shows the readable wildcard
const job = q1(
  'select resolved_prompts r from generation_jobs where batch_id = ?',
  batch?.id ?? 0,
)
const stored = JSON.parse(job?.r ?? '{}')
check(
  /@\{wc:0\}/.test(stored.generalPrompt) &&
    stored.wildcards?.[0]?.options?.length === 3,
  'job keeps the marker + option list (picked per image)',
)

// ── 3. Quick Generate: overrides, fixed option, bundle-ref lines ──
async function quick(prompt, count, label) {
  await open('/generate')
  await page.evaluate(
    ([p, c]) =>
      localStorage.setItem(
        '87studio-quick-generate',
        JSON.stringify({
          generalPrompt: p,
          negativePrompt: '',
          characters: [],
          parameters: {},
          count: c,
        }),
      ),
    [prompt, count],
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
  await until(() => idle(), 60000, `${label}: finished`, 400)
  return b ? imgsOf(b.id) : []
}
const gp = (imgs) => imgs.map((i) => i.meta.prompts.generalPrompt)

// :random override of a sequential bundle -> every pick is one of the options
const rnd = await quick('x @{bundle:wcexpression:random}', 12, 'random')
const opts = new Set(['x wcsmile', 'x wccrying', 'x wcangry'])
check(
  rnd.length === 12 && gp(rnd).every((p) => opts.has(p)),
  'quick :random -> every image has one of the options',
)
check(
  new Set(gp(rnd)).size >= 2 &&
    rnd.every((i) => i.meta.wildcards?.[0]?.mode === 'random'),
  `quick :random varies and records mode random (${new Set(gp(rnd)).size} distinct)`,
)

const seq = await quick('y @{bundle:wcexpression:seq}', 4, 'seq')
check(
  JSON.stringify(gp(seq)) ===
    JSON.stringify(['y wcsmile', 'y wccrying', 'y wcangry', 'y wcsmile']),
  'quick :seq override is sequential',
)

const fixed = await quick('z @{bundle:wcexpression:WCCrying}', 3, 'fixed')
check(
  gp(fixed).length === 3 && gp(fixed).every((p) => p === 'z wccrying'),
  `fixed option (case-insensitive) -> always wccrying (${JSON.stringify(gp(fixed))})`,
)
check(
  fixed[0]?.meta.wildcards?.[0]?.mode === 'fixed' &&
    fixed[0]?.meta.wildcards?.[0]?.index === 1,
  'fixed pick recorded with mode fixed and line index',
)

const missing = await quick('m @{bundle:wcexpression:nope}', 1, 'missing')
check(
  gp(missing)[0] === 'm ',
  `unknown option resolves to empty (${JSON.stringify(gp(missing))})`,
)

// bundle-ref option lines: whole bundle content, matched by bundle name
const mood = await quick('@{bundle:wcmood:seq}', 2, 'mood seq')
check(
  JSON.stringify(gp(mood)) ===
    JSON.stringify(['wcgrin, teeth', 'wcsad, wctears']),
  `option lines resolve bundle refs / raw tag lines (${JSON.stringify(gp(mood))})`,
)
const moodFixed = await quick('@{bundle:wcmood:wcgrin}', 1, 'mood fixed')
check(
  gp(moodFixed)[0] === 'wcgrin, teeth',
  `fixed option addressed by referenced bundle name (${JSON.stringify(gp(moodFixed))})`,
)

// text bundle with a mode suffix is a plain ref
const plain = await quick('@{bundle:wcgrin:seq}', 1, 'text suffix')
check(
  gp(plain)[0] === 'wcgrin, teeth',
  'mode suffix on a text bundle is ignored',
)

// ── 4. gallery prompt-tag filter matches the chosen option ──
// (whole comma-token match: "1girl, wcangry" matches, "x wcangry" does not)
const angryCount = q(
  `select metadata from generated_images where id > ?`,
  base.image,
).filter((r) =>
  JSON.parse(r.metadata)
    .prompts.generalPrompt.split(',')
    .some((tok) => tok.trim() === 'wcangry'),
).length
await open('/gallery?promptTag=wcangry')
await sleep(1500)
const cards = await page.locator('img[src*="/api/thumbnails/"]').count()
check(
  angryCount > 0 && cards === angryCount,
  `gallery promptTag=wcangry shows ${cards} of ${angryCount} matching images`,
)

// ── 5. editor: unknown option flagged ──
await open('/bundles')
await page.locator('[data-new-bundle]').click()
await page.getByPlaceholder('Bundle name').fill('wcprobe')
await page.keyboard.press('Enter')
await until(() => bundleRow('wcprobe'), 8000, 'probe bundle')
await page.locator('.cm-content').first().waitFor({ timeout: 10000 })
await typeLines(page.locator('.cm-content').first(), [
  '@{bundle:wcexpression:wccrying} @{bundle:wcexpression:nope} @{bundle:wcexpression}',
])
check(
  (await page.locator('.cm-invalid-ref-highlight').count()) === 1,
  'editor flags exactly the unknown option ref',
)
check(
  (await page.locator('.cm-bundle-wildcard-highlight').count()) === 2,
  'editor styles valid wildcard refs distinctly',
)

check(consoleErrors === 0, `no console errors (${consoleErrors})`)
await browser.close()
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
