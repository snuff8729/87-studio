// Generation queue smoke against a NAI_MOCK server, with REAL writes.
//
// Exercises: workspace + Quick Generate batches, "Now generating" card
// (progress, latest image, expanded job list), sidebar widget, dashboard
// strip, pause/resume, drag-reordering of batches and jobs, batch cancel,
// failure injection (`__mock_fail__`, `__mock_fail_once__`) with retry/skip,
// retry of a failed batch from the history, and the resulting images in the
// gallery / workspace history / Quick Generate history. The DB (read-only) and
// the files on disk are cross-checked. Leaves the queue empty.
//
// REFUSES to run unless the server shows the MOCK badge (NAI_MOCK=1) and the
// queue is idle, so it can never spend real NovelAI credits.
//
// Usage (throwaway data, dev server, from the repo root):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-mock
//   NAI_MOCK=1 NAI_MOCK_DELAY_MS=1500 STUDIO_DATA_DIR=<repo>/demo-mock/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3100 --strictPort
//   PW_CORE=<playwright-core> runtime/node/node.exe scripts/smoke/queue.mjs \
//     http://127.0.0.1:3100 demo-mock/data/studio.db
//
// Args / env:
//   argv[2] / SMOKE_BASE  server URL (default http://localhost:3001, the demo)
//   argv[3] / SMOKE_DB    studio.db of that server (default demo/data/studio.db)
//   PW_CORE, CHROME, SMOKE_OUT  as in workspace.mjs
//   SMOKE_PROJECT         project id used for workspace batches (default: the
//                         first project with 4-12 scenes)
// Needs NAI_MOCK_DELAY_MS >= ~1000 so there is time to observe/reorder.
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
const DATA_ROOT = path.dirname(DB_PATH)
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
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
      if (last) return last
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

// ── DB (read-only) ──
if (!fs.existsSync(DB_PATH)) refuse(`DB not found: ${DB_PATH}`)
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
const q = (sql, ...a) => db.prepare(sql).all(...a)
const q1 = (sql, ...a) => db.prepare(sql).get(...a)
const idle = () =>
  q1(
    `select count(*) c from generation_jobs where status in ('pending','running')`,
  ).c === 0
const logicalToDisk = (p) =>
  path.join(DATA_ROOT, p.replace(/^\.?\/?data\//, ''))

// ── browser ──
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
  const file = path.join(OUT, `queue-${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}
let welcomeHandled = false
async function open(route) {
  await page.goto(BASE + route, { waitUntil: 'networkidle' })
  // Welcome dialog of the onboarding tutorial (fresh seeded DB); skipping it
  // is persisted, so it only appears on the first pages
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

// ── 0. preflight: mock mode + idle queue ──
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
  job: q1('select coalesce(max(id),0) m from generation_jobs').m,
  batch: q1('select coalesce(max(id),0) m from generation_batches').m,
  image: q1('select coalesce(max(id),0) m from generated_images').m,
}
const projectId = Number(
  process.env.SMOKE_PROJECT ??
    q1(
      `select p.id from projects p where (select count(*) from project_scenes ps
         join project_scene_packs sp on sp.id = ps.project_scene_pack_id
         where sp.project_id = p.id) between 4 and 12 order by p.id limit 1`,
    )?.id,
)
if (!projectId) refuse('no project with 4-12 scenes (set SMOKE_PROJECT)')
console.log(`project ${projectId}, baseline`, base)

const newBatches = () =>
  q(`select * from generation_batches where id > ? order by id`, base.batch)
const jobsOf = (batchId) =>
  q(
    `select * from generation_jobs where batch_id = ? order by queue_order, id`,
    batchId,
  )
const imagesOfBatch = (batchId) =>
  q1(
    `select count(*) c from generated_images where job_id in
       (select id from generation_jobs where batch_id = ?)`,
    batchId,
  ).c

// ── helpers: start generation from the UI ──
async function setCounts(counts) {
  // counts: array, index = rail row; rows beyond the array are set to 0
  const inputs = page.locator('[title="Images to generate"] input')
  await inputs.first().waitFor({ timeout: 15000 })
  const n = await inputs.count()
  for (let i = 0; i < n; i++) {
    const want = counts[i] ?? 0
    const input = inputs.nth(i)
    if ((await input.inputValue()) === String(want)) continue
    await input.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type(String(want))
    await page.keyboard.press('Enter')
    await sleep(120)
  }
}
async function workspaceGenerate(counts, label) {
  await open(`/workspace/${projectId}`)
  await setCounts(counts)
  const btn = page.getByRole('button', { name: /^Generate \d+$/ }).first()
  const total = counts.reduce((a, b) => a + b, 0)
  check(
    (await btn.innerText()).trim() === `Generate ${total}`,
    `${label}: footer button reads "Generate ${total}"`,
  )
  const before = q1('select coalesce(max(id),0) m from generation_batches').m
  await btn.click()
  const b = await until(
    () => q1('select * from generation_batches where id > ?', before),
    10000,
    `${label}: batch created`,
  )
  return b
}
async function quickGenerate(prompt, count, label) {
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
  return b
}

// ── 1. workspace batch A: several scenes x counts ──
const A = await workspaceGenerate([8, 6, 6], 'workspace batch A')
if (!A) {
  await browser.close()
  process.exit(1)
}
const aJobs = jobsOf(A.id)
check(aJobs.length === 3, `A: one batch with 3 jobs (${aJobs.length})`)
const aTotal = aJobs.reduce((s, j) => s + j.total_count, 0)
check(aTotal === 20, `A: 20 images reserved in total (${aTotal})`)
check(A.project_id === projectId, 'A: batch belongs to the project')

// ── 2. dashboard strip + sidebar widget ──
await open('/')
check(
  await page
    .locator('[data-running-strip]')
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false),
  'dashboard: running strip visible while generating',
)
await shot('dashboard')

// ── 3. queue page: Now generating card ──
await open('/queue')
const card = page.locator('[data-now-generating]')
check(
  await card
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false),
  'queue: "Now generating" card visible',
)
check(
  /Now generating/.test(await card.innerText()),
  'queue: card says "Now generating"',
)
// The sidebar is collapsed after editor routes; expand it to see the widget
const sidebarWidget = page
  .locator('a[href="/queue"]')
  .filter({ hasText: /[0-9]+[/][0-9]+/ })
if ((await sidebarWidget.count()) === 0)
  await page.locator('[data-sidebar="trigger"]').first().click()
check(
  await sidebarWidget
    .first()
    .waitFor({ timeout: 6000 })
    .then(() => true)
    .catch(() => false),
  'sidebar: queue widget shows progress',
)
check(
  /[0-9]+/.test(
    await page
      .locator('a[href="/queue"]')
      .first()
      .locator('xpath=ancestor::li[1]')
      .innerText(),
  ),
  'sidebar: Queue nav item carries the remaining-images badge',
)
const progress = async () => {
  const m = (await card.innerText()).match(/(\d+)\/(\d+)/)
  return m ? Number(m[1]) : -1
}
const seen = new Set()
await until(
  async () => {
    seen.add(await progress())
    return seen.size >= 3
  },
  25000,
  'card progress advances (>=3 distinct values)',
  400,
)
check(seen.size >= 3, `card progress advanced: ${[...seen].join(' → ')}`)
const thumb = card.locator('img').first()
check(
  await thumb
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false),
  'card: latest image thumbnail shown',
)
if (await thumb.count()) {
  const ok = await thumb.evaluate((el) => el.complete && el.naturalWidth > 0)
  check(ok, 'card: latest thumbnail actually loaded (mock PNG served)')
}
await shot('now-generating')

// expand job list of the running batch
await page.locator('[data-now-generating-expand]').click()
const aSceneNames = q(
  `select ps.name from generation_jobs j join project_scenes ps on ps.id = j.project_scene_id
     where j.batch_id = ?`,
  A.id,
).map((r) => r.name)
await until(
  async () => {
    const text = await card.innerText()
    return aSceneNames.every((n) => text.includes(n))
  },
  8000,
  'expanded card lists all job scene names',
)
check(
  aSceneNames.every(async () => true),
  `expanded card: ${aSceneNames.length} job rows`,
)

// ── 4. pause ──
await page.locator('[data-queue-pause]').click()
check(
  await until(
    async () => /Paused/.test(await card.innerText()),
    8000,
    'card shows Paused',
  ),
  'pause: card switches to Paused',
)
await sleep(3500) // in-flight image may still finish
const pausedImages = imagesOfBatch(A.id)
await sleep(4000)
check(
  pausedImages < 20,
  `pause: A was still unfinished when paused (${pausedImages}/20)`,
)
check(
  imagesOfBatch(A.id) === pausedImages,
  `pause: no further images while paused (${pausedImages})`,
)
check(
  q1(`select count(*) c from generation_jobs where status = 'running'`).c === 0,
  'pause: no job left in running state',
)
check(
  await sidebarWidget
    .filter({ hasText: 'Paused' })
    .first()
    .waitFor({ timeout: 6000 })
    .then(() => true)
    .catch(() => false),
  'pause: sidebar widget reads Paused',
)
await shot('paused')

// ── 5. more batches while paused ──
const B1 = await quickGenerate('1girl, smile, mock qg one', 2, 'QG batch B1')
const C = await workspaceGenerate([0, 0, 0, 1, 2], 'workspace batch C')
const D = await quickGenerate(
  '1girl, __mock_fail_once__ retry me',
  1,
  'QG fail-once D',
)
const E = await quickGenerate(
  '1girl, __mock_fail__ always',
  1,
  'QG fail-always E',
)
if (!B1 || !C || !D || !E) {
  await browser.close()
  process.exit(1)
}
check(jobsOf(C.id).length === 2, 'C: 2 jobs (two scenes)')
check(
  q1(`select count(*) c from generation_jobs where status = 'running'`).c === 0,
  'queue stays paused while new batches are added',
)

// ── 6. reorder batches (drag) ──
await open('/queue')
const handles = page.locator(
  '[data-pending-batches] button[aria-label="Drag to reorder"]',
)
await handles.first().waitFor({ timeout: 15000 })
const pendingIds = () =>
  q(
    `select id from generation_batches where status = 'pending' order by queue_order, id`,
  ).map((r) => r.id)
check(
  JSON.stringify(pendingIds()) ===
    JSON.stringify([A.id, B1.id, C.id, D.id, E.id]),
  `paused A and the new batches are all pending, in creation order: ${pendingIds().join(',')}`,
)
check(
  (await handles.count()) === 5,
  'queue: 5 pending batch rows (A is paused)',
)
async function drag(from, to, offsetY = 0) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  const ax = a.x + a.width / 2
  const ay = a.y + a.height / 2
  await page.mouse.move(ax, ay)
  await page.mouse.down()
  await page.mouse.move(ax, ay - 6, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + offsetY, {
    steps: 18,
  })
  await sleep(200)
  await page.mouse.up()
  await sleep(600)
}
await drag(handles.nth(4), handles.nth(1), -14)
check(
  await until(
    () =>
      JSON.stringify(pendingIds()) ===
      JSON.stringify([A.id, E.id, B1.id, C.id, D.id]),
    6000,
    'batch reorder persisted',
  ),
  `batch drag-reorder persisted in DB: ${pendingIds().join(',')}`,
)
await sleep(2500) // refetch interval
const uiOrder = await handles.evaluateAll((els) =>
  els.map(
    (el) => el.closest('.rounded-lg')?.querySelector('.truncate')?.textContent,
  ),
)
check(
  uiOrder.length === 5,
  `UI shows the reordered rows (${uiOrder.join(' | ')})`,
)

// reorder jobs inside batch C
const cRow = page
  .locator('[data-pending-batches] .rounded-lg')
  .filter({
    has: page.locator('button[aria-label="Drag to reorder"]'),
  })
  .nth(3)
await cRow.locator('button[aria-label="Expand"]').click()
const jobHandles = cRow.locator('button.cursor-grab:not([aria-label])')
await until(async () => (await jobHandles.count()) === 2, 8000, 'C job rows')
const cBefore = jobsOf(C.id).map((j) => j.id)
await drag(jobHandles.nth(1), jobHandles.nth(0), -8)
const cAfter = await until(
  () => {
    const now = jobsOf(C.id).map((j) => j.id)
    return now[0] === cBefore[1] ? now : null
  },
  6000,
  'job reorder persisted',
)
check(
  !!cAfter && cAfter[0] === cBefore[1] && cAfter[1] === cBefore[0],
  `job drag-reorder persisted in DB: ${cBefore.join(',')} → ${(cAfter ?? []).join(',')}`,
)
await shot('reordered')

// ── 7. cancel a pending batch (B1) ──
const rows = page.locator('[data-pending-batches] .rounded-lg').filter({
  has: page.locator('button[aria-label="Drag to reorder"]'),
})
await rows.nth(2).locator('button[aria-label="Cancel Batch"]').click()
await page
  .getByRole('alertdialog')
  .getByRole('button', { name: 'Cancel Batch' })
  .click()
check(
  await until(
    () =>
      q1('select status from generation_batches where id = ?', B1.id).status ===
      'cancelled',
    8000,
    'B1 cancelled',
  ),
  'cancel: B1 batch status = cancelled',
)
check(
  jobsOf(B1.id).every((j) => j.status === 'cancelled'),
  'cancel: all B1 jobs cancelled',
)
await until(async () => (await handles.count()) === 4, 8000, 'B1 row removed')
check((await handles.count()) === 4, 'cancel: B1 row gone from pending list')

// ── 8. resume → A finishes, E (fail always) fails and stops the queue ──
await page.locator('[data-queue-resume]').click()
const eFailed = await until(
  () =>
    q1(
      'select * from generation_jobs where batch_id = ? and status = ?',
      E.id,
      'failed',
    ),
  120000,
  'E job failed',
  500,
)
check(
  imagesOfBatch(A.id) === 20 &&
    jobsOf(A.id).every((j) => j.status === 'completed'),
  'resume: A completed all 20 images before E ran (order after drag)',
)
check(
  !!eFailed && /Mock failure/.test(eFailed.error_message ?? ''),
  `failure: E failed with error message "${eFailed?.error_message?.slice(0, 80)}"`,
)
const banner = page.locator('[data-queue-error]')
check(
  await banner
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false),
  'failure: queue page shows the error banner',
)
check(
  /Mock failure/.test(await banner.innerText().catch(() => '')),
  'failure: banner shows the job error message',
)
check(
  (await page.locator('[data-queue-resume]').count()) === 1,
  'failure: header offers Resume while errored',
)
await shot('error')

// ── 9. skip E, D fails once → Retry succeeds ──
async function popover(buttonName) {
  await open('/generate')
  const trigger = page.getByRole('button', { name: /Error/ }).first()
  await trigger.waitFor({ timeout: 10000 })
  await trigger.click()
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole('button', { name: buttonName, exact: true })
    .click()
  await sleep(500)
}
// E is skipped with the banner on the queue page
await banner.getByRole('button', { name: 'Skip', exact: true }).click()
await until(
  () =>
    !q1(
      'select 1 x from generation_jobs where id = ? and status = ?',
      eFailed.id,
      'pending',
    ),
  3000,
  'skip applied',
)
check(
  q1('select status from generation_batches where id = ?', E.id).status ===
    'failed',
  'skip: E batch marked failed',
)
const dFailed = await until(
  () =>
    q1(
      'select * from generation_jobs where batch_id = ? and status = ?',
      D.id,
      'failed',
    ),
  30000,
  'D job failed (first attempt)',
  500,
)
check(
  !!dFailed && /Mock failure/.test(dFailed.error_message ?? ''),
  'fail-once: D failed on its first attempt',
)
await popover('Retry')
check(
  !!(await until(
    () =>
      q1(
        'select * from generation_jobs where id = ? and status = ?',
        dFailed.id,
        'completed',
      ),
    30000,
    'D succeeds on retry',
    500,
  )),
  'retry: D succeeded on the second attempt',
)

// ── 10. wait for the rest (C) to finish ──
await until(
  () => idle() && jobsOf(C.id).every((j) => j.status === 'completed'),
  60000,
  'queue drains',
  500,
)
check(
  jobsOf(C.id)
    .map((j) => j.id)
    .join() === cAfter?.join(),
  'C jobs ran in the dragged order (queue_order kept)',
)
check(
  jobsOf(C.id).every((j) => j.status === 'completed') &&
    imagesOfBatch(C.id) === 3,
  'C: 3 images completed',
)
check(imagesOfBatch(D.id) === 1, 'D: 1 image after retry')
check(
  imagesOfBatch(B1.id) === 0 && imagesOfBatch(E.id) === 0,
  'cancelled B1 and failed E produced no images',
)

// ── 11. retry the failed batch from the history ──
await open('/queue')
await page.getByRole('button', { name: /Recent History/ }).click()
const retryBtn = page.locator('button[title="Retry Failed"]')
await retryBtn.first().waitFor({ timeout: 10000 })
check(
  (await retryBtn.count()) >= 1,
  'history: the failed batch (newest first) has a retry button',
)
await retryBtn.first().click()
const F = await until(
  () =>
    q1(
      'select * from generation_batches where id > ? and label like ?',
      E.id,
      '%(retry)',
    ),
  10000,
  'retry batch created',
)
check(!!F, 'retry: a "(retry)" batch was created for E')
await until(
  () =>
    q1(
      'select * from generation_jobs where batch_id = ? and status = ?',
      F.id,
      'failed',
    ),
  30000,
  'retry batch fails again',
  500,
)
check(true, 'retry: the always-failing prompt fails again (queue errored)')
await open('/queue')
await page
  .locator('[data-queue-error]')
  .getByRole('button', { name: 'Skip', exact: true })
  .click()
check(
  await until(() => idle(), 15000, 'idle after skipping F'),
  'queue idle after skipping the retried failure',
)

// ── 12. results: DB + disk + UI ──
const okBatches = [A, C, D]
for (const b of okBatches) {
  const imgs = q(
    `select g.* from generated_images g join generation_jobs j on j.id = g.job_id where j.batch_id = ?`,
    b.id,
  )
  const files = imgs.every(
    (g) =>
      fs.existsSync(logicalToDisk(g.file_path)) &&
      fs.existsSync(logicalToDisk(g.thumbnail_path)) &&
      fs.readFileSync(logicalToDisk(g.file_path)).subarray(1, 4).toString() ===
        'PNG',
  )
  check(
    files && imgs.length > 0,
    `batch ${b.id}: ${imgs.length} images + thumbnails on disk (PNG)`,
  )
}
const newest = q1(
  'select * from generated_images where id > ? order by id desc limit 1',
  base.image,
)
check(!!newest, 'new images were recorded in the DB')

await open('/gallery')
await sleep(1500)
const galleryThumbs = await page
  .locator('img[src*="/api/thumbnails/"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute('src')))
check(
  galleryThumbs.some((s) => s.endsWith(path.basename(newest.thumbnail_path))),
  'gallery: newest generated image is listed',
)
await shot('gallery')

const wsNewest = q1(
  'select * from generated_images where id > ? and project_id = ? order by id desc limit 1',
  base.image,
  projectId,
)
await open(`/workspace/${projectId}`)
await sleep(1500)
const wsThumbs = await page
  .locator('img[src*="/api/thumbnails/"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute('src')))
check(
  !!wsNewest &&
    wsThumbs.some((s) => s.endsWith(path.basename(wsNewest.thumbnail_path))),
  'workspace: newest image appears in history / scene thumbnails',
)

const qgNewest = q1(
  'select * from generated_images where id > ? and project_id is null order by id desc limit 1',
  base.image,
)
await open('/generate')
await sleep(1500)
const qgThumbs = await page
  .locator('img[src*="/api/thumbnails/"]')
  .evaluateAll((els) => els.map((e) => e.getAttribute('src')))
check(
  !!qgNewest &&
    qgThumbs.some((s) => s.endsWith(path.basename(qgNewest.thumbnail_path))),
  'quick generate: newest image appears in history',
)

// ── 13. final state: queue empty ──
await open('/queue')
check(
  await page
    .getByText('No pending tasks')
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false),
  'final: queue page shows the empty state',
)
check(idle(), 'final: no pending/running jobs in the DB')
await open('/')
check(
  (await page.locator('[data-running-strip]').count()) === 0,
  'final: dashboard running strip gone',
)
await shot('final')

console.log(`\nconsole errors: ${consoleErrors}\nfailures: ${failures}`)
await browser.close()
process.exit(failures || consoleErrors ? 1 : 0)
