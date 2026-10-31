// Quick Generate character-parts smoke against a NAI_MOCK server (real writes).
//
// Library data (character, two outfit items, a preset) is inserted straight
// into the throwaway DB by this script (the library UI is covered by
// parts.mjs); everything else goes through the Quick Generate UI:
//   1. Chars tab: link the library character + add outfit items, global
//      View/Framing selector, final-prompt preview, switch View -> preview
//      changes, Empty badge + info line for the item without a Back fragment
//   2. Generate -> job resolved_prompts / image metadata contain the composed
//      parts text; image_axis_values / image_library_links rows exist
//   3. Library item "Images (N)" counts the Quick Generate images
//   4. reload keeps the Quick Generate parts state
//   5. 390px layout
//   6. deleting the library character -> "Link broken", item text still composed
//   7. a plain character (no parts) still works; no global axes / preview
// Screenshots (1440 + 390) go to SMOKE_OUT.
//
// REFUSES to run unless the server shows the MOCK badge and the queue is idle.
//
// Usage (repo root, throwaway data, NOT re-runnable on the same data):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-mock-qparts
//   NAI_MOCK=1 NAI_MOCK_DELAY_MS=300 STUDIO_DATA_DIR=<repo>/demo-mock-qparts/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3197 --strictPort
//   PW_CORE=<playwright-core> runtime/node/node.exe scripts/smoke/quick-parts.mjs \
//     http://127.0.0.1:3197 demo-mock-qparts/data/studio.db
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
let step = '0'
const check = (cond, msg) => {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'} [${step}] ${msg}`)
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
const json = (s) => {
  try {
    return JSON.parse(s ?? '{}')
  } catch {
    return {}
  }
}
if (q1("select 1 x from library_characters where name = 'QP Hero'"))
  refuse('QP Hero already exists: reseed the demo data first')
const axisIdOf = (name) =>
  q1(
    'select id from library_axes where name = ? and owner_character_id is null and owner_item_id is null',
    name,
  )?.id
const valueIdOf = (axis, value) =>
  q1(
    `select v.id from library_axis_values v join library_axes a on a.id = v.axis_id
     where a.name = ? and v.name = ? order by v.id limit 1`,
    axis,
    value,
  )?.id

// ── browser ──
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
async function newPage(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('87studio-locale', 'en')
    } catch {}
  })
  const p = await ctx.newPage()
  p.on('console', (m) => {
    if (m.type() !== 'error') return
    if (/Failed to load resource/.test(m.text())) return
    consoleErrors++
    console.log(`  [console.error] ${m.text().slice(0, 300)}`)
  })
  p.on('pageerror', (e) => {
    consoleErrors++
    console.log(`  [pageerror] ${e.message.slice(0, 300)}`)
  })
  return p
}
const page = await newPage(1440, 900)
const shot = async (name, p = page) => {
  const file = path.join(OUT, `qparts-${name}.png`)
  await p.screenshot({ path: file })
  console.log(`  shot ${file}`)
}
const welcomeHandled = new WeakSet()
async function open(route, p = page) {
  await p.goto(BASE + route, { waitUntil: 'networkidle' })
  const welcome = p.getByRole('dialog').filter({ hasText: 'Welcome to 87 Studio' })
  if (
    !welcomeHandled.has(p) &&
    (await welcome
      .waitFor({ timeout: 2500 })
      .then(() => true)
      .catch(() => false))
  ) {
    await welcome.getByRole('button', { name: 'Skip', exact: true }).click()
    await sleep(500)
    welcomeHandled.add(p)
  }
}
const charsTab = (p = page) => p.getByRole('tab', { name: /^Char/ })
const previewText = async (p = page) =>
  (
    await p
      .locator('[data-testid="quick-parts-preview-text"]')
      .first()
      .innerText()
  ).trim()
const axisBtn = (name, p = page) =>
  p.locator('[data-testid="quick-global-axes"] [role="radio"]').filter({
    hasText: new RegExp(`^${name}`),
  })

// ── 0. preflight + library data ──
await open('/')
const badge = await page
  .locator('[data-testid="mock-badge"]')
  .first()
  .waitFor({ timeout: 15000 })
  .then(() => true)
  .catch(() => false)
if (!badge) refuse(`${BASE} does not show the MOCK badge (NAI_MOCK=1 missing)`)
if (
  q1(`select count(*) c from generation_jobs where status in ('pending','running')`)
    .c !== 0
)
  refuse('queue is not idle')
const viewAx = axisIdOf('View')
const front = valueIdOf('View', 'Front')
const back = valueIdOf('View', 'Back')
if (!viewAx || !front || !back) refuse('global View axis (Front/Back) missing')
consoleErrors = 0

const wdb = new Database(DB_PATH, { fileMustExist: true })
wdb.pragma('busy_timeout = 8000')
wdb.pragma('foreign_keys = ON')
const insert = (sql, ...a) => wdb.prepare(sql).run(...a).lastInsertRowid
const cond = (...ids) => JSON.stringify({ [viewAx]: ids })
const heroId = Number(insert(`insert into library_characters (name) values ('QP Hero')`))
const frag = (owner, id, text, c) =>
  insert(
    `insert into fragments (${owner}, text, conditions) values (?, ?, ?)`,
    id,
    text,
    c ?? '{}',
  )
frag('character_id', heroId, 'qp_hero_base')
frag('character_id', heroId, 'qp_front_hair', cond(front))
frag('character_id', heroId, 'qp_back_hair', cond(back))
const jacketId = Number(insert(`insert into outfit_items (name) values ('QP Jacket')`))
frag('item_id', jacketId, 'qp_jacket_front', cond(front))
frag('item_id', jacketId, 'qp_jacket_back', cond(back))
const badgeId = Number(insert(`insert into outfit_items (name) values ('QP Badge')`))
frag('item_id', badgeId, 'qp_badge', cond(front)) // no Back fragment
const presetId = Number(
  insert(
    `insert into outfit_presets (name, item_ids) values ('QP Look', ?)`,
    JSON.stringify([{ id: jacketId }, { id: badgeId }]),
  ),
)
const baseline = q1('select coalesce(max(id),0) m from generation_jobs').m
check(true, 'preflight: MOCK badge, idle queue; library data inserted')

// ═════════════════════════════════════════════════════════════════════════════
step = '1'
try {
  await open('/generate')
  await page.evaluate(() => localStorage.removeItem('87studio-quick-generate'))
  await open('/generate')
  await page.getByRole('tab', { name: /^Prompt/ }).click()
  const cm = page.locator('.cm-content').first()
  await cm.waitFor({ timeout: 15000 })
  await cm.click()
  await page.keyboard.type('qp general, 1girl', { delay: 10 })
  await page.keyboard.press('Escape')

  await charsTab().click()
  check(
    (await page.locator('[data-testid="quick-global-axes"]').count()) === 0,
    'no global axes selector without any parts character',
  )
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()
  await until(
    async () => (await page.locator('[data-library-character-select]').count()) > 0,
    8000,
    'parts card rendered',
  )
  check(
    (await page.locator('[data-parts-view]').count()) === 1 &&
      (await page.getByRole('button', { name: 'Detach' }).count()) === 0,
    'parts card shown, no Detach in Quick Generate',
  )
  await page.locator('[data-library-character-select]').click()
  await page.locator('[cmdk-item]').filter({ hasText: 'QP Hero' }).first().click()
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'QP Jacket' }).first().click()
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'QP Badge' }).first().click()

  await page.locator('[data-testid="quick-global-axes"]').waitFor({ timeout: 8000 })
  check(
    (await page.locator('[data-parts-hint]').count()) > 0,
    'global axes selector + @{char}/@{outfit} hint shown once a character uses parts',
  )
  await until(
    async () => /qp_hero_base/.test(await previewText()),
    10000,
    'preview shows composed text',
  )
  const frontText = await previewText()
  console.log(`  preview (Front): ${frontText}`)
  check(
    /qp_front_hair/.test(frontText) &&
      /qp_jacket_front/.test(frontText) &&
      /qp_badge/.test(frontText) &&
      !/qp_back_hair|qp_jacket_back/.test(frontText),
    'default View=Front preview has the Front fragments and the badge',
  )
  await shot('1440-front')

  await axisBtn('Back').click()
  await until(
    async () => /qp_back_hair/.test(await previewText()),
    10000,
    'preview switches to Back',
  )
  const backText = await previewText()
  console.log(`  preview (Back):  ${backText}`)
  check(
    /qp_jacket_back/.test(backText) && !/qp_badge|qp_front_hair/.test(backText),
    'switching View to Back changes the preview (badge gone)',
  )
  await until(
    async () => (await page.locator('[data-empty-badge]').count()) > 0,
    8000,
    'Empty badge',
  )
  const info = await page.locator('[data-empty-line]').first().innerText()
  check(
    /QP Badge/.test(info) && /Back/.test(info),
    `Empty badge on QP Badge + info line "${info}"`,
  )
  await shot('1440-back')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('1-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
step = '2'
let jobId
try {
  await page.getByRole('button', { name: /^Generate \d+$/ }).first().click()
  jobId = (
    await until(
      () => q1('select id from generation_jobs where id > ? and project_id is null', baseline)?.id,
      10000,
      'quick job created',
    )
  )
  await until(
    () => q1('select status from generation_jobs where id = ?', jobId).status === 'completed',
    60000,
    'job completed',
    500,
  )
  const job = q1('select * from generation_jobs where id = ?', jobId)
  const rp = json(job.resolved_prompts)
  const c0 = rp.characterPrompts[0]
  console.log(`  resolved: ${c0.prompt}`)
  check(
    /qp_hero_base/.test(c0.prompt) &&
      /qp_back_hair/.test(c0.prompt) &&
      /qp_jacket_back/.test(c0.prompt) &&
      !/qp_badge/.test(c0.prompt),
    'job resolved_prompts contain the composed Back text',
  )
  check(
    c0.libraryCharacterId === heroId &&
      JSON.stringify(c0.outfitItemIds) === JSON.stringify([jacketId]) &&
      c0.axisValues?.[viewAx] === back,
    'resolved prompt records library character, contributing items and View=Back',
  )
  const imgs = q('select * from generated_images where job_id = ?', jobId)
  check(imgs.length === 4, `${imgs.length} images generated`)
  check(
    imgs.every((i) => /qp_back_hair/.test(i.metadata ?? '')),
    'image metadata contains the composed text',
  )
  const ids = imgs.map((i) => i.id)
  const inIds = `(${ids.join(',')})`
  const ax = q(`select * from image_axis_values where image_id in ${inIds}`)
  check(
    ax.length >= 4 && ax.every((r) => r.axis_id === viewAx && r.value_id === back || r.axis_id !== viewAx),
    `image_axis_values rows (${ax.length}), View=Back`,
  )
  const links = q(`select * from image_library_links where image_id in ${inIds}`)
  const has = (kind, ref) =>
    ids.every((id) => links.some((l) => l.image_id === id && l.kind === kind && l.ref_id === ref))
  check(has('character', heroId), 'image_library_links: character on every image')
  check(
    has('item', jacketId) && !links.some((l) => l.kind === 'item' && l.ref_id === badgeId),
    'image_library_links: jacket yes, covered-out/empty badge no',
  )
  check(has('preset', presetId), 'image_library_links: global preset "QP Look" matched')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
step = '3'
try {
  await open(`/characters?tab=outfits&id=${jacketId}`)
  const sec = page.locator('[data-library-images]')
  await sec.waitFor({ timeout: 15000 })
  await until(async () => /Images \(4\)/.test(await sec.innerText()), 10000, 'Images (4)')
  check(/Images \(4\)/.test(await sec.innerText()), 'library item "Images (4)" counts the Quick Generate images')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
step = '4'
try {
  await open('/generate')
  await charsTab().click()
  await until(
    async () => /QP Hero/.test(await page.locator('[data-library-character-select]').first().innerText()),
    8000,
    'link restored after reload',
  )
  check(true, 'reload keeps the linked library character')
  const names = await page.locator('[data-parts-view]').first().innerText()
  check(/QP Jacket/.test(names) && /QP Badge/.test(names), 'reload keeps the default outfit')
  check(
    (await axisBtn('Back').first().getAttribute('data-state')) === 'on',
    'reload keeps the global View=Back selection',
  )
  await until(async () => /qp_back_hair/.test(await previewText()), 10000, 'preview after reload')
  check(true, 'preview recomputed after reload')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
step = '5'
try {
  const mp = await newPage(390, 844)
  const saved = await page.evaluate(() =>
    localStorage.getItem('87studio-quick-generate'),
  )
  await open('/generate', mp)
  await mp.evaluate(
    (v) => localStorage.setItem('87studio-quick-generate', v),
    saved,
  )
  await open('/generate', mp)
  await charsTab(mp).click()
  await mp.locator('[data-parts-view]').first().waitFor({ timeout: 15000 })
  await mp.locator('[data-testid="quick-parts-preview-text"]').first().scrollIntoViewIfNeeded()
  await sleep(500)
  await shot('390-chars', mp)
  const overflow = await mp.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  check(!overflow, '390px: no horizontal page scroll on the Chars tab')
  await mp.close()
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
step = '6'
try {
  wdb.prepare('delete from library_characters where id = ?').run(heroId)
  await open('/generate')
  await charsTab().click()
  await page.locator('[data-link-broken]').waitFor({ timeout: 10000 })
  check(true, '"Link broken" badge after the library character was deleted')
  await until(
    async () => {
      const t = await previewText()
      return /qp_jacket_back/.test(t) && !/qp_hero_base|qp_back_hair/.test(t)
    },
    10000,
    'broken link ignored in composition',
  )
  check(true, 'broken link ignored in the preview; outfit still composed')
  await shot('1440-broken')
  const before = q1('select coalesce(max(id),0) m from generation_jobs').m
  await page.getByRole('button', { name: /^Generate \d+$/ }).first().click()
  const j2 = await until(
    () => q1('select id from generation_jobs where id > ? and project_id is null', before)?.id,
    10000,
    'second job',
  )
  const p2 = json(q1('select resolved_prompts r from generation_jobs where id = ?', j2).r)
  check(
    !/qp_hero_base/.test(p2.characterPrompts[0].prompt) &&
      /qp_jacket_back/.test(p2.characterPrompts[0].prompt) &&
      p2.characterPrompts[0].libraryCharacterId === undefined,
    'generation with a broken link ignores the character but keeps the outfit',
  )
  await until(
    () => q1('select status from generation_jobs where id = ?', j2).status === 'completed',
    60000,
    'job 2 completed',
    500,
  )
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
}

// ═════════════════════════════════════════════════════════════════════════════
step = '7'
try {
  // a plain character: strip the parts from local state
  await page.evaluate(() => {
    const k = '87studio-quick-generate'
    const s = JSON.parse(localStorage.getItem(k))
    s.characters = [{ id: 'plain-1', name: 'Plain', prompt: 'plain_prompt', negative: '' }]
    localStorage.setItem(k, JSON.stringify(s))
  })
  await open('/generate')
  await charsTab().click()
  await sleep(800)
  check(
    (await page.locator('[data-testid="quick-global-axes"]').count()) === 0 &&
      (await page.locator('[data-testid="quick-parts-preview"]').count()) === 0,
    'plain character: no global axes, no parts preview',
  )
  const before = q1('select coalesce(max(id),0) m from generation_jobs').m
  await page.getByRole('button', { name: /^Generate \d+$/ }).first().click()
  const j3 = await until(
    () => q1('select id from generation_jobs where id > ? and project_id is null', before)?.id,
    10000,
    'third job',
  )
  const c = json(q1('select resolved_prompts r from generation_jobs where id = ?', j3).r).characterPrompts[0]
  check(
    c.prompt === 'plain_prompt' && c.axisValues === undefined && c.libraryCharacterId === undefined,
    'plain character prompt unchanged, no parts fields recorded',
  )
  await until(
    () => q1('select status from generation_jobs where id = ?', j3).status === 'completed',
    60000,
    'job 3 completed',
    500,
  )
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
}

check(consoleErrors === 0, `no console/page errors (${consoleErrors})`)
await browser.close()
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
