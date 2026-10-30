// Character positions smoke against a NAI_MOCK server, with REAL writes.
//
// Exercises: per-character default position (Chars tab: AI / Random / Fixed,
// picker drag + keyboard), per-scene override (SceneView section: Default /
// AI / Random / Fixed, shared picker, snap to grid), bulk override from the
// scene selection header, resolution change keeping positions, Quick Generate
// picker incl. touch drag at 390px, and mock generation: centers stored in the
// job's resolved prompts and in each image's metadata (random differs per
// image, all-AI keeps use_coords false). Reads the DB read-only.
//
// REFUSES to run unless the server shows the MOCK badge (NAI_MOCK=1) and the
// queue is idle.
//
// Usage (throwaway data, dev server, from the repo root):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-mock
//   NAI_MOCK=1 NAI_MOCK_DELAY_MS=300 STUDIO_DATA_DIR=<repo>/demo-mock/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3100 --strictPort
//   PW_CORE=<playwright-core> runtime/node/node.exe scripts/smoke/positions.mjs \
//     http://127.0.0.1:3100 demo-mock/data/studio.db
//
// Args / env: argv[2] / SMOKE_BASE, argv[3] / SMOKE_DB, PW_CORE, CHROME, SMOKE_OUT
// as in queue.mjs. SMOKE_PROJECT: project with >= 2 characters (default: the
// first one whose first character has a Fixed default).
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
const json = (s) => (s ? JSON.parse(s) : null)
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
async function newPage(viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch })
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
    // dev server cold start: the first navigation can race the client entry
    if (/Failed to fetch dynamically imported module/.test(e.message)) return
    consoleErrors++
    console.log(`  [pageerror] ${e.message.slice(0, 300)}`)
  })
  return { ctx, page }
}
let welcomeHandled = false
async function open(page, route) {
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
const shot = async (page, name) => {
  const file = path.join(OUT, `positions-${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}

/** Drag a dot to a normalised point inside its stage (mouse) */
async function dragDot(page, dotLocator, nx, ny) {
  const stage = dotLocator.locator('xpath=ancestor::*[@data-position-stage]')
  const sb = await stage.boundingBox()
  const db_ = await dotLocator.boundingBox()
  const sx = db_.x + db_.width / 2
  const sy = db_.y + db_.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(sb.x + sb.width * nx, sb.y + sb.height * ny, {
    steps: 6,
  })
  await page.mouse.up()
}
const dotPos = async (dot) =>
  dot.evaluate((el) => ({
    x: parseFloat(el.style.left) / 100,
    y: parseFloat(el.style.top) / 100,
  }))

// ── 0. preflight ──
const desktop = await newPage({ width: 1440, height: 900 })
const page = desktop.page
await open(page, '/')
const badge = await page
  .locator('[data-testid="mock-badge"]')
  .first()
  .waitFor({ timeout: 15000 })
  .then(() => true)
  .catch(() => false)
if (!badge) refuse(`${BASE} does not show the MOCK badge`)
if (
  q1(
    `select count(*) c from generation_jobs where status in ('pending','running')`,
  ).c !== 0
)
  refuse('the queue of that DB is not idle')
check(true, 'preflight: MOCK badge visible, queue idle')

const projectId = Number(
  process.env.SMOKE_PROJECT ??
    q1(
      `select c.project_id id from characters c where c.slot_index = 0
        and c.position like '%fixed%'
        and (select count(*) from characters x where x.project_id = c.project_id) >= 2
        order by c.project_id limit 1`,
    )?.id,
)
if (!projectId) refuse('no project with a Fixed first character')
const chars = q(
  'select * from characters where project_id = ? order by slot_index',
  projectId,
)
const [c1, c2] = chars
console.log(
  `project ${projectId}, characters`,
  chars.map((c) => `${c.name}:${c.position}`),
)
const scenes = q(
  `select ps.* from project_scenes ps join project_scene_packs sp
     on sp.id = ps.project_scene_pack_id where sp.project_id = ? order by sp.id, ps.sort_order`,
  projectId,
)
const sceneA = scenes[0] // seeded override: character 1 fixed 0.7 / 0.5
const sceneB = scenes[1]
const ovr = (sceneId, charId) =>
  q1(
    'select * from character_scene_overrides where project_scene_id = ? and character_id = ?',
    sceneId,
    charId,
  )
check(
  json(ovr(sceneA.id, c1.id)?.position)?.mode === 'fixed',
  'seed: scene A overrides character 1 with a Fixed position',
)

// ── 1. Chars tab: default position ──
await open(page, `/workspace/${projectId}`)
await page.getByRole('tab', { name: /^Chars/ }).click()
const field = page.locator('[data-character-position]').first()
await field.waitFor({ timeout: 10000 })
check(
  (await field
    .getByRole('radio', { name: 'Fixed' })
    .getAttribute('aria-checked')) === 'true',
  'chars: character 1 shows Fixed',
)
let dot = field.locator('[data-position-dot="1"]')
let p = await dotPos(dot)
check(near(p.x, 0.3) && near(p.y, 0.5), `chars: dot at B3 (${p.x}, ${p.y})`)
check(
  (await field.locator('[data-position-label]').innerText()).startsWith('B3'),
  'chars: label reads B3 · (0.30, 0.50)',
)
await shot(page, 'chars-desktop')
await dragDot(page, dot, 0.5, 0.25)
p = await dotPos(dot)
check(
  near(p.x, 0.5, 0.03) && near(p.y, 0.25, 0.03),
  `chars: dot dragged (${p.x}, ${p.y})`,
)
await until(
  () => {
    const s = json(
      q1('select position from characters where id = ?', c1.id).position,
    )
    return s?.mode === 'fixed' && near(s.x, 0.5, 0.03) && near(s.y, 0.25, 0.03)
  },
  6000,
  'chars: dragged position saved (debounced)',
)
check(true, 'chars: drag saved to DB')
// keyboard
await dot.focus()
await page.keyboard.press('ArrowRight')
await page.keyboard.press('Shift+ArrowDown')
p = await dotPos(dot)
check(
  near(p.x, 0.51, 0.005) && near(p.y, 0.35, 0.005),
  `chars: arrow keys move 0.01 / shift 0.1 (${p.x}, ${p.y})`,
)
// snap to grid
await field.getByRole('checkbox').click()
await dragDot(page, dot, 0.33, 0.62)
p = await dotPos(dot)
check(
  near(p.x, 0.3, 0.001) && near(p.y, 0.7, 0.001),
  `chars: snap to grid cell centre (${p.x}, ${p.y})`,
)
check(
  (await page.evaluate(() =>
    localStorage.getItem('87studio-position-snap'),
  )) === '1',
  'chars: snap preference persisted',
)
await field.getByRole('checkbox').click()
// modes
await field.getByRole('radio', { name: 'AI' }).click()
await until(
  () =>
    q1('select position from characters where id = ?', c1.id).position === null,
  6000,
  'chars: AI saved as NULL',
)
check(true, 'chars: AI stored as NULL')
await field.getByRole('radio', { name: 'Fixed' }).click()
await until(
  () =>
    json(q1('select position from characters where id = ?', c1.id).position)
      ?.mode === 'fixed',
  6000,
  'chars: Fixed saved',
)
// restore the seed value so scene checks below start from known data
await dragDot(page, field.locator('[data-position-dot="1"]'), 0.3, 0.5)
await until(
  () => {
    const s = json(
      q1('select position from characters where id = ?', c1.id).position,
    )
    return s?.mode === 'fixed' && near(s.x, 0.3, 0.03)
  },
  6000,
  'chars: restored 0.3/0.5',
)

// ── 2. SceneView: per-scene override ──
await open(page, `/workspace/${projectId}?scene=${sceneA.id}`)
const section = page.locator('[data-scene-positions]')
await section.waitFor({ timeout: 10000 })
await section.getByRole('button', { name: /Character positions/ }).click()
const row1 = section.locator(`[data-scene-position-row="${c1.id}"]`)
const row2 = section.locator(`[data-scene-position-row="${c2.id}"]`)
check(
  (await row1
    .getByRole('radio', { name: 'Fixed' })
    .getAttribute('aria-checked')) === 'true',
  'scene: A character 1 is Fixed (override)',
)
check(
  (await row2
    .getByRole('radio', { name: 'Default' })
    .getAttribute('aria-checked')) === 'true',
  'scene: A character 2 is Default',
)
check(
  /Default: Random/.test(
    await row2.locator('[data-position-default-hint]').innerText(),
  ),
  'scene: Default hint reads "Default: Random"',
)
dot = section.locator('[data-position-dot="1"]')
p = await dotPos(dot)
check(
  near(p.x, 0.7) && near(p.y, 0.5),
  `scene: override dot at 0.7/0.5 (${p.x}, ${p.y})`,
)
await shot(page, 'scene-desktop')
await dragDot(page, dot, 0.15, 0.8)
await until(
  () => {
    const s = json(ovr(sceneA.id, c1.id)?.position)
    return s?.mode === 'fixed' && near(s.x, 0.15, 0.04) && near(s.y, 0.8, 0.04)
  },
  6000,
  'scene: dragged override saved',
)
check(true, 'scene: override drag saved')
// scene B inherits the character default
await open(page, `/workspace/${projectId}?scene=${sceneB.id}`)
const sectionB = page.locator('[data-scene-positions]')
await sectionB.waitFor({ timeout: 10000 })
const hint1 = await sectionB
  .locator(`[data-scene-position-row="${c1.id}"] [data-position-default-hint]`)
  .innerText()
check(/Default: Fixed B3/.test(hint1), `scene: B shows "${hint1}"`)
// Set character 2 to Fixed in scene B, then back to Default
const rowB2 = sectionB.locator(`[data-scene-position-row="${c2.id}"]`)
await rowB2.getByRole('radio', { name: 'Fixed' }).click()
await until(
  () => json(ovr(sceneB.id, c2.id)?.position)?.mode === 'fixed',
  6000,
  'scene: B character 2 Fixed saved',
)
check(true, 'scene: B character 2 override Fixed saved')
check(
  (await sectionB.locator('[data-position-dot]').count()) === 2,
  'scene: shared picker shows both characters as dots',
)
await rowB2.getByRole('radio', { name: 'Default' }).click()
await until(
  () => ovr(sceneB.id, c2.id)?.position === null,
  6000,
  'scene: back to Default stores NULL',
)
check(true, 'scene: Default stores NULL (inherit)')

// ── 3. bulk override from the selection header ──
await open(page, `/workspace/${projectId}?scene=${sceneA.id}`)
await page
  .getByRole('button', { name: 'More scene options' })
  .first()
  .click()
  .catch(() => {})
await page
  .getByRole('menuitem', { name: 'Select', exact: true })
  .click()
  .catch(() => {})
const selHeader = page.locator('[data-selection-header]').first()
const inSelect = await selHeader
  .waitFor({ timeout: 4000 })
  .then(() => true)
  .catch(() => false)
check(inSelect, 'bulk: selection mode entered')
if (inSelect) {
  await selHeader.getByRole('checkbox').click() // select all
  await selHeader.locator('button[aria-label="More selection actions"]').click()
  await page.locator('[data-bulk-positions-item]').click()
  const dlg = page.locator('[data-bulk-positions]')
  await dlg.waitFor({ timeout: 4000 })
  await dlg.locator(`[data-bulk-character="${c2.id}"]`).click()
  await dlg.getByRole('radio', { name: 'Fixed' }).click()
  const bdot = dlg.locator('[data-position-dot]')
  await dragDot(page, bdot, 0.9, 0.9)
  await shot(page, 'bulk-dialog')
  await dlg.locator('[data-bulk-apply]').click()
  await until(
    () =>
      q1(
        `select count(*) c from character_scene_overrides o
        join project_scenes ps on ps.id = o.project_scene_id
        join project_scene_packs sp on sp.id = ps.project_scene_pack_id
       where sp.project_id = ? and o.character_id = ? and o.position like '%fixed%'`,
        projectId,
        c2.id,
      ).c === scenes.length,
    8000,
    'bulk: override applied to all scenes',
  )
  check(true, `bulk: Fixed applied to ${scenes.length} scenes`)
  const bp = json(ovr(sceneB.id, c2.id).position)
  check(
    near(bp.x, 0.9, 0.04) && near(bp.y, 0.9, 0.04),
    `bulk: stored coordinates (${bp.x}, ${bp.y})`,
  )
}

// ── 4. resolution change keeps positions ──
await open(page, `/workspace/${projectId}?scene=${sceneA.id}`)
await page.getByRole('tab', { name: /^Chars/ }).click()
const dot1 = () =>
  page.locator('[data-character-position] [data-position-dot="1"]').first()
const setPreset = async (name) => {
  await page.getByRole('tab', { name: /^Params/ }).click()
  await page.getByRole('button', { name: name }).first().click()
  await sleep(600)
  await page.getByRole('tab', { name: /^Chars/ }).click()
}
await setPreset(/^Portrait/)
const before = await page.locator('[data-position-stage]').first().boundingBox()
const beforeDot = await dotPos(dot1())
await setPreset(/^Landscape/)
const after = await page.locator('[data-position-stage]').first().boundingBox()
const afterDot = await dotPos(dot1())
check(
  before.width / before.height < 1 && after.width / after.height > 1,
  `resolution: canvas aspect follows size (${(before.width / before.height).toFixed(2)} -> ${(after.width / after.height).toFixed(2)})`,
)
check(
  near(beforeDot.x, afterDot.x, 0.001) && near(beforeDot.y, afterDot.y, 0.001),
  'resolution: normalised dot position unchanged',
)
await shot(page, 'resolution-landscape')

// ── 5. mock generation: centers in job + image metadata ──
// Scene B: character 1 Fixed (default), character 2 Random; scene A has overrides.
await open(page, `/workspace/${projectId}?scene=${sceneB.id}`)
const sectionC = page.locator('[data-scene-positions]')
await sectionC.waitFor({ timeout: 10000 })
const rowC2 = sectionC.locator(`[data-scene-position-row="${c2.id}"]`)
await rowC2.getByRole('radio', { name: 'Random' }).click()
const baseJob = q1('select coalesce(max(id),0) m from generation_jobs').m
const baseImage = q1('select coalesce(max(id),0) m from generated_images').m
// reserve 4 images for scene B only
const inputs = page.locator('[title="Images to generate"] input')
await inputs.first().waitFor({ timeout: 15000 })
const n = await inputs.count()
const sceneIds = scenes.map((s) => s.id)
const idxB = sceneIds.indexOf(sceneB.id)
for (let i = 0; i < n; i++) {
  const want = i === idxB ? 4 : 0
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
const job = await until(
  () =>
    q1(
      'select * from generation_jobs where id > ? order by id limit 1',
      baseJob,
    ),
  10000,
  'gen: job created',
)
const jobPrompts = json(job.resolved_prompts)
check(
  jobPrompts.characterPrompts[0].position?.mode === 'fixed',
  'gen: job stores the resolved default (Fixed) for character 1',
)
check(
  jobPrompts.characterPrompts[1].position?.mode === 'random',
  'gen: job stores the scene override (Random) for character 2',
)
await until(
  () =>
    q1('select count(*) c from generated_images where id > ?', baseImage).c >=
    4,
  30000,
  'gen: 4 images generated',
  500,
)
const imgs = q(
  'select * from generated_images where id > ? order by id',
  baseImage,
).map((r) => json(r.metadata))
check(
  imgs.every((m) => m.characterPositions?.useCoords === true),
  'gen: every image has useCoords true',
)
check(
  imgs.every(
    (m) =>
      near(m.characterPositions.centers[0].x, 0.3, 0.001) &&
      near(m.characterPositions.centers[0].y, 0.5, 0.001),
  ),
  'gen: fixed character keeps its centre on every image',
)
const randoms = new Set(
  imgs.map((m) => JSON.stringify(m.characterPositions.centers[1])),
)
check(
  randoms.size > 1,
  `gen: random centre differs between images (${randoms.size} distinct)`,
)
check(
  imgs.every((m) => {
    const c = m.characterPositions.centers[1]
    return c.x >= 0.1 && c.x <= 0.9 && c.y >= 0.1 && c.y <= 0.9
  }),
  'gen: random centres within [0.1, 0.9]',
)
const gal = imgs[0]
// image detail shows the used positions
const firstImg = q1(
  'select id from generated_images where id > ? order by id limit 1',
  baseImage,
).id
await open(page, `/gallery/${firstImg}`)
await page
  .getByText('Reference', { exact: true })
  .first()
  .click()
  .catch(() => {})
const metaBlock = page.locator('[data-character-positions-meta]')
check(
  await metaBlock
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false),
  'gen: image detail lists the used positions',
)
await shot(page, 'image-detail')
void gal

// All-AI project path: Quick Generate without characters keeps use_coords false
// ── 6. Quick Generate (desktop): AI only, then Fixed ──
const quickState = (characters) => ({
  generalPrompt: '1girl, mock positions',
  negativePrompt: '',
  characters,
  parameters: {},
  count: 2,
})
async function quickRun(pg, characters) {
  await open(pg, '/generate')
  await pg.evaluate(
    (s) => localStorage.setItem('87studio-quick-generate', JSON.stringify(s)),
    quickState(characters),
  )
  await pg.reload({ waitUntil: 'networkidle' })
  const bj = q1('select coalesce(max(id),0) m from generation_jobs').m
  const bi = q1('select coalesce(max(id),0) m from generated_images').m
  await pg
    .getByRole('button', { name: /^Generate \d+$/ })
    .first()
    .click()
  await until(
    () => q1('select count(*) c from generated_images where id > ?', bi).c >= 2,
    20000,
    'quick: 2 images',
    500,
  )
  return {
    job: q1(
      'select * from generation_jobs where id > ? order by id limit 1',
      bj,
    ),
    images: q(
      'select * from generated_images where id > ? order by id',
      bi,
    ).map((r) => json(r.metadata)),
  }
}
const ai = await quickRun(page, [
  { id: 'a', name: 'A', prompt: '1girl', negative: '' },
  { id: 'b', name: 'B', prompt: '1boy', negative: '' },
])
check(
  ai.images.every(
    (m) =>
      m.characterPositions?.useCoords === false &&
      m.characterPositions.centers.every((c) => c.x === 0.5 && c.y === 0.5),
  ),
  'quick: all-AI characters keep use_coords false, centred',
)
await desktop.ctx.close()

// ── 7. Quick Generate at 390 with touch drag ──
const mobile = await newPage({ width: 390, height: 844 }, true)
const mp = mobile.page
await open(mp, '/generate')
await mp.evaluate(
  (s) => localStorage.setItem('87studio-quick-generate', JSON.stringify(s)),
  quickState([
    {
      id: 'a',
      name: 'A',
      prompt: '1girl',
      negative: '',
      position: { mode: 'fixed', x: 0.3, y: 0.5 },
    },
    { id: 'b', name: 'B', prompt: '1boy', negative: '' },
  ]),
)
await mp.reload({ waitUntil: 'networkidle' })
await mp
  .getByRole('tab', { name: /^Edit/ })
  .click()
  .catch(() => {})
await mp.getByRole('tab', { name: /^Chars/ }).click()
const mfield = mp.locator('[data-character-position]').first()
await mfield.waitFor({ timeout: 10000 })
const mdot = mfield.locator('[data-position-dot="1"]')
const mstage = mfield.locator('[data-position-stage]')
const msb = await mstage.boundingBox()
check(
  msb.x >= 0 && msb.x + msb.width <= 390,
  `mobile: picker fits the viewport (${Math.round(msb.x)}..${Math.round(msb.x + msb.width)})`,
)
check(
  (await mp.evaluate(() => document.documentElement.scrollWidth)) <= 390,
  'mobile: no horizontal page scroll',
)
const mdb = await mdot.boundingBox()
check(
  mdb.width >= 24 && mdb.height >= 24,
  `mobile: dot hit area ${mdb.width}x${mdb.height}`,
)
await shot(mp, 'mobile-chars')
const cdp = await mobile.ctx.newCDPSession(mp)
const touch = (type, x, y) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  })
const sx = mdb.x + mdb.width / 2
const sy = mdb.y + mdb.height / 2
const tx = msb.x + msb.width * 0.75
const ty = msb.y + msb.height * 0.2
await touch('touchStart', sx, sy)
for (let i = 1; i <= 8; i++)
  await touch('touchMove', sx + ((tx - sx) * i) / 8, sy + ((ty - sy) * i) / 8)
await touch('touchEnd', tx, ty)
await sleep(300)
const mp1 = await dotPos(mdot)
check(
  near(mp1.x, 0.75, 0.04) && near(mp1.y, 0.2, 0.04),
  `mobile: touch drag moved the dot (${mp1.x.toFixed(2)}, ${mp1.y.toFixed(2)})`,
)
const stored = await mp.evaluate(
  () =>
    JSON.parse(localStorage.getItem('87studio-quick-generate')).characters[0]
      .position,
)
check(
  stored?.mode === 'fixed' && near(stored.x, 0.75, 0.04),
  'mobile: position kept in 87studio-quick-generate',
)
await shot(mp, 'mobile-dragged')
await mobile.ctx.close()

console.log(`\nconsole errors: ${consoleErrors}`)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
await browser.close()
process.exit(failures === 0 && consoleErrors === 0 ? 0 : 1)
