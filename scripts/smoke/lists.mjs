// List editing smoke (drag / keyboard reorder, inline rename, Enter-add) on a NAI_MOCK server, REAL writes.
// Run AFTER scripts/smoke/parts.mjs on the same fresh seed (uses Smoke Jacket / Smoke Shirt and project 2). Restores what it changes.
// Usage as parts.mjs: PW_CORE=... runtime/node/node.exe scripts/smoke/lists.mjs <base> <db>
//
// Args / env: argv[2]/SMOKE_BASE, argv[3]/SMOKE_DB, PW_CORE, CHROME, SMOKE_OUT,
//   SMOKE_PROJECT (workspace project with >=3 scenes and >=1 character; default 5),
//   SMOKE_PROJECT2 (project with >=2 characters; default 2)
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
const PROJECT = Number(process.env.SMOKE_PROJECT ?? 5)
const PROJECT2 = Number(process.env.SMOKE_PROJECT2 ?? 2)

let failures = 0
let consoleErrors = 0
let step = '0'
const stepResults = new Map()
const check = (cond, msg) => {
  if (!cond) {
    failures++
    stepResults.set(step, false)
  } else if (!stepResults.has(step)) stepResults.set(step, true)
  console.log(`${cond ? 'PASS' : 'FAIL'} [${step}] ${msg}`)
  return !!cond
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, timeout, msg, every = 200) {
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

// ── DB (read-only) ──
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
const axisId = (name) =>
  q1(
    'select id from library_axes where name = ? and owner_character_id is null and owner_item_id is null',
    name,
  )?.id
const valueId = (axis, value) =>
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
let page = await newPage(1440, 900)
let tag = ''
const shot = async (name, p = page) => {
  const file = path.join(OUT, `smoke-${tag}${name}.png`)
  await p.screenshot({ path: file })
  console.log(`  shot ${file}`)
}
let welcomeHandled = new WeakSet()
async function open(route, p = page) {
  await p.goto(BASE + route, { waitUntil: 'networkidle' })
  const welcome = p
    .getByRole('dialog')
    .filter({ hasText: 'Welcome to 87 Studio' })
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

// ── helpers ──
const POP = '[data-slot="popover-content"]'
/** Mouse drag of a drag handle onto another row (below=true lands in its lower half). */
async function drag(p, handleLoc, targetLoc, below) {
  await handleLoc.scrollIntoViewIfNeeded()
  const a = await handleLoc.boundingBox()
  const b = await targetLoc.boundingBox()
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await p.mouse.down()
  const tx = b.x + b.width / 2
  const ty = b.y + b.height * (below ? 0.8 : 0.2)
  await p.mouse.move(a.x + a.width / 2 + 3, a.y + a.height / 2 + 3, { steps: 3 })
  await p.mouse.move(tx, ty, { steps: 14 })
  await sleep(150)
  await p.mouse.up()
}
/** Keyboard reorder: focus handle, Space, N x Arrow, Space. */
async function kbMove(p, handleLoc, key, n) {
  await handleLoc.focus()
  await sleep(250)
  await p.keyboard.press('Space')
  await sleep(250)
  for (let i = 0; i < n; i++) {
    await p.keyboard.press(key)
    await sleep(300)
  }
  await p.keyboard.press('Space')
}
const names = (sql, ...a) => q(sql, ...a).map((r) => r.name).join('|')
const valuesOf = (axis) =>
  names(
    'select v.name from library_axis_values v where v.axis_id = ? order by v.sort_order, v.id',
    axisId(axis),
  )
// Tree order: top-level areas, each followed by its children
const areasDb = () => {
  const all = q('select id, name, parent_id from library_areas order by sort_order, id')
  return all
    .filter((a) => a.parent_id === null)
    .flatMap((a) => [a, ...all.filter((c) => c.parent_id === a.id)])
    .map((a) => a.name)
    .join('|')
}
const topAreas = () =>
  q('select name from library_areas where parent_id is null order by sort_order, id').map((a) => a.name)
const handleOf = (row) => row.locator('[data-drag-handle]').first()

await open('/')
if (!(await page.locator('[data-testid="mock-badge"]').first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false)))
  refuse('no MOCK badge')

// 1. Axis values: Enter-add multiple, inline rename, Esc, drag, keyboard
step = '1'
try {
  await open('/characters?tab=axes')
  await page.locator('[data-list-row]').filter({ hasText: /^View/ }).first().click()
  const base = valuesOf('View')
  const valueRows = page.locator('[data-value-row]')
  await page.getByRole('button', { name: 'Add value' }).click()
  const addInput = page.getByRole('textbox', { name: 'Add value' })
  for (const n of ['L1', 'L2', 'L3']) {
    await addInput.fill(n)
    await addInput.press('Enter')
    await sleep(300)
  }
  check(await addInput.isVisible(), 'add input stays open after Enter')
  await until(() => valuesOf('View') === `${base}|L1|L2|L3`, 6000, 'L1-L3 added in order')
  check(valuesOf('View') === `${base}|L1|L2|L3`, `three values added with Enter (${valuesOf('View')})`)
  await addInput.press('Escape')
  check(!(await addInput.isVisible()), 'Esc closes the add input')
  await shot('lists-axes-values')

  const row = (n) => valueRows.filter({ has: page.locator('[data-inline-name]', { hasText: new RegExp(`^${n}$`) }) })
  const nb = base.split('|').length
  const at = (i) => valueRows.nth(nb + i)
  await at(1).locator('[data-inline-name]').click()
  await at(1).locator('[data-inline-name-input]').fill('L2x')
  await page.keyboard.press('Enter')
  await until(() => valuesOf('View').includes('L2x'), 6000, 'rename persisted')
  check(valuesOf('View') === `${base}|L1|L2x|L3`, 'inline rename (Enter) saved')
  await at(0).locator('[data-inline-name]').click()
  await at(0).locator('[data-inline-name-input]').fill('zzz')
  await page.keyboard.press('Escape')
  await sleep(500)
  check(valuesOf('View') === `${base}|L1|L2x|L3`, 'inline rename Esc cancels')
  await at(0).locator('[data-inline-name]').click()
  await at(0).locator('[data-inline-name-input]').fill('  ')
  await page.keyboard.press('Enter')
  await sleep(500)
  check(valuesOf('View') === `${base}|L1|L2x|L3`, 'empty inline name reverts')
  await drag(page, handleOf(row('L3')), row('L1'), false)
  await until(() => valuesOf('View') === `${base}|L3|L1|L2x`, 6000, 'drag persisted')
  check(valuesOf('View') === `${base}|L3|L1|L2x`, `mouse drag reorders values (${valuesOf('View')})`)
  await kbMove(page, handleOf(row('L3')), 'ArrowDown', 2)
  await until(() => valuesOf('View') === `${base}|L1|L2x|L3`, 6000, 'kb persisted')
  check(valuesOf('View') === `${base}|L1|L2x|L3`, `keyboard reorder (Space, Down x2, Space) (${valuesOf('View')})`)
  check((await valueRows.first().innerText()).includes('Default'), 'first value shows the Default badge')
  for (const n of ['L1', 'L2x', 'L3']) {
    await row(n).getByRole('button', { name: 'Delete value' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click()
    await sleep(500)
  }
  await until(() => valuesOf('View') === base, 6000, 'cleanup')
  check(valuesOf('View') === base, 'test values removed again')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('lists-1-error').catch(() => {})
}

// 2. Body areas
step = '2'
try {
  await open('/characters?tab=axes')
  await page.locator('[data-areas-entry]').click()
  await page.locator('[data-areas-editor]').waitFor({ timeout: 8000 })
  const rows = page.locator('[data-area-row]')
  const base = areasDb()
  const list = base.split('|')
  const tops = topAreas()
  const last = tops[tops.length - 1]
  const first = tops[0]
  const r = (n) => rows.filter({ has: page.locator('[data-inline-name]', { hasText: new RegExp(`^${n}$`) }) })
  await shot('lists-areas')
  await drag(page, handleOf(r(last)), r(first), false)
  await until(() => areasDb().startsWith(last), 6000, 'area drag')
  check(areasDb().split('|').join() === [last, ...list.filter((n) => n !== last)].join(), `drag moves top-level "${last}" to the top (${areasDb()})`)
  await kbMove(page, handleOf(r(last)), 'ArrowDown', tops.length - 1)
  await until(() => areasDb() === base, 6000, 'area kb restore')
  check(areasDb() === base, 'keyboard reorder restores the order')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('lists-2-error').catch(() => {})
}

// 3. Outfit item: fragments drag, cover rule row
step = '3'
const jacketId = q1(`select id from outfit_items where name = 'Smoke Jacket'`)?.id
const shirtId = q1(`select id from outfit_items where name = 'Smoke Shirt'`)?.id
try {
  check(!!jacketId && !!shirtId, 'parts smoke items exist (run parts.mjs first)')
  await open(`/characters?tab=outfits&id=${jacketId}`)
  const frags = page.locator('[data-fragment-row]')
  await frags.first().waitFor({ timeout: 10000 })
  const fragOrder = () =>
    q('select id from fragments where item_id = ? order by sort_order, id', jacketId).map((f) => f.id).join()
  while ((await frags.count()) < 2) {
    await page.locator('[data-add-fragment]').click()
    await sleep(1200)
  }
  const before = fragOrder()
  const ids = before.split(',')
  await drag(page, handleOf(frags.nth(1)), frags.nth(0), false)
  await until(() => fragOrder() !== before, 6000, 'fragment drag')
  const after = fragOrder().split(',')
  check(after[0] === ids[1] && after[1] === ids[0], `drag reorders fragments (${before} -> ${fragOrder()})`)
  await kbMove(page, handleOf(frags.nth(1)), 'ArrowUp', 1)
  await until(() => fragOrder() === before, 6000, 'fragment kb')
  check(fragOrder() === before, 'keyboard reorder restores fragments')
  check(
    (await page.locator('[data-fragment-row] [data-row-remove]').count()) === (await frags.count()),
    'each fragment has a hover remove button',
  )
  check((await page.locator('[data-cover-rule]').count()) >= 1, 'cover rules listed')
  check(await page.locator('[data-add-rule]').isVisible(), 'bottom "Add rule" row')
  await shot('lists-item-detail')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('lists-3-error').catch(() => {})
}

// 4. Workspace Chars tab: default outfit drag + character chip drag
step = '4'
const slotsDb = () => names('select name from characters where project_id = ? order by slot_index', PROJECT2)
try {
  await open(`/workspace/${PROJECT2}`)
  await page.getByRole('tab', { name: /^Chars/ }).click()
  const slot1 = q1('select id from characters where project_id = ? order by slot_index limit 1', PROJECT2)
  const outfitDb = () => {
    const v = json(q1('select outfit_item_ids o from characters where id = ?', slot1.id).o)
    return v.map((e) => (typeof e === 'number' ? e : e.id)).join()
  }
  const orows = page.locator('[data-outfit-row]')
  await orows.first().waitFor({ timeout: 10000 })
  const startOutfit = outfitDb()
  check(startOutfit === `${shirtId},${jacketId}`, `default outfit = shirt, jacket (${startOutfit})`)
  await shot('lists-chars-outfit')
  await drag(page, handleOf(orows.nth(1)), orows.nth(0), false)
  await until(() => outfitDb() !== startOutfit, 8000, 'outfit drag')
  check(outfitDb() === `${jacketId},${shirtId}`, `drag reorders default outfit (${outfitDb()})`)
  await kbMove(page, handleOf(orows.nth(0)), 'ArrowDown', 1)
  await until(() => outfitDb() === startOutfit, 8000, 'outfit kb')
  check(outfitDb() === startOutfit, 'keyboard reorder restores outfit')
  check((await orows.first().locator('[data-item-areas-label]').count()) > 0, 'outfit rows show area names')

  const chips = page.locator('[data-character-chip]')
  const chipRows = page.locator('[data-sortable-row]').filter({ has: chips })
  const n = await chips.count()
  check(n >= 2, `project has ${n} characters`)
  const startSlots = slotsDb()
  await drag(page, handleOf(chipRows.nth(1)), chipRows.nth(0), false)
  await until(() => slotsDb() !== startSlots, 8000, 'chip drag')
  const arr = startSlots.split('|')
  check(
    slotsDb() === [arr[1], arr[0], ...arr.slice(2)].join('|'),
    `chip drag reorders characters (${startSlots} -> ${slotsDb()})`,
  )
  const slotIdx = q('select slot_index s from characters where project_id = ? order by slot_index', PROJECT2).map((r) => r.s)
  check(slotIdx.join() === slotIdx.map((_, i) => i).join(), `slot_index contiguous (${slotIdx.join()})`)
  await shot('lists-chips')
  await kbMove(page, handleOf(chipRows.nth(0)), 'ArrowRight', 1)
  await until(() => slotsDb() === startSlots, 8000, 'chip kb')
  check(slotsDb() === startSlots, 'keyboard reorder restores chips')
  await page.locator('[data-character-menu]').click()
  check((await page.getByRole('menuitem', { name: 'Move right' }).count()) === 1, '"Move left/right" menu items kept')
  await page.keyboard.press('Escape')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('lists-4-error').catch(() => {})
}

// 5. Scene Parts: outfit override list with a Covered item
step = '5'
try {
  await open(`/workspace/${PROJECT2}`)
  await page.locator('[data-scene-id]').first().waitFor({ timeout: 15000 })
  const sec = page.locator('[data-testid="scene-parts-section"]')
  await sec.waitFor({ timeout: 15000 })
  const btn = sec.locator('> button').first()
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click()
  const parts = page.locator('[data-testid="scene-parts"]')
  await parts.waitFor({ timeout: 10000 })
  const crow = parts.locator('[data-testid="parts-character"]').first()
  const cb = crow.locator('> button')
  if ((await cb.getAttribute('aria-expanded')) !== 'true') await cb.click()
  const seg = (scope, axis, value) =>
    scope.locator(`[role="group"][aria-label="${axis}"]`).locator('button').filter({ hasText: new RegExp(`^${value}`) }).first()
  await seg(parts.locator('> div').first(), 'View', 'Front').click()
  await seg(crow, 'Zipper', 'Closed').click()
  await crow.getByText('Replace for this scene', { exact: true }).click()
  await crow.locator('[data-outfit-row]').first().waitFor({ timeout: 8000 })
  await until(async () => (await crow.locator('[data-covered-badge]').count()) === 1, 8000, 'covered badge in replace list')
  check((await crow.locator('[data-outfit-row] [data-covered-badge]').count()) === 1, 'Covered badge shown in the override outfit list')
  await crow.locator('[data-covered-badge]').first().scrollIntoViewIfNeeded()
  await sleep(300)
  await shot('lists-scene-override')
  await crow.getByText('Default outfit', { exact: true }).last().click()
  await sleep(800)
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('lists-5-error').catch(() => {})
}

// 6. Mobile screenshots
step = '6'
try {
  const mp = await newPage(390, 844)
  tag = 'm-'
  await open('/characters?tab=axes', mp)
  await mp.locator('[data-list-row]').filter({ hasText: /^View/ }).first().click()
  await mp.locator('[data-value-row]').first().waitFor({ timeout: 8000 })
  await shot('lists-axes-values', mp)
  await open('/characters?tab=axes&areas=true', mp)
  await mp.locator('[data-areas-editor]').waitFor({ timeout: 8000 })
  await shot('lists-areas', mp)
  await open(`/characters?tab=outfits&id=${jacketId}`, mp)
  await mp.locator('[data-fragment-row]').first().waitFor({ timeout: 10000 })
  await shot('lists-item-detail', mp)
  await open(`/workspace/${PROJECT2}`, mp)
  await mp.getByRole('tab', { name: /^Chars/ }).click()
  await mp.locator('[data-outfit-row]').first().waitFor({ timeout: 10000 })
  await shot('lists-chars-outfit', mp)
  const hv = await mp.locator('[data-outfit-row] [data-drag-handle]').first().evaluate((el) => getComputedStyle(el).opacity)
  check(hv === '1', `drag handle always visible on mobile (opacity ${hv})`)
  tag = ''
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
}

step = 'end'
check(consoleErrors === 0, `no console/page errors (${consoleErrors})`)
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
await browser.close()
process.exit(failures ? 1 : 0)
