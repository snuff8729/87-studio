// Character parts library smoke against a NAI_MOCK server, with REAL writes.
//
// Exercises (1440px, plus a few 390px screenshots):
//   1. /characters: character with fragments + conditions, outfit item with a
//      local axis / item condition / fragments, live preview
//   2. preset with the item; global axis value add + delete
//   3. workspace Chars tab: link the library character, default outfit
//   4. scene Parts section: view/framing, final prompt preview, per-character
//      override, fast scene switches right after a change (persistence)
//   5. selection mode "Set view/framing..." (merge into axis_values)
//   6. mock generation: resolved_prompts contains the composed prompt
//   7. detach: library unchanged, slot points to a project-only copy
//   8. an unlinked character keeps a clean prompt (no stray commas)
//   9-14. occlusion + gallery: body areas CRUD, item areas + cover rules,
//      Covered badge / final preview, image axis values + library links on
//      mock-generated images, library Images grid + thumbnail, gallery View
//      filter (chip, prev/next, remove). Needs a FRESH seed (not re-runnable)
// The DB is only opened read-only for cross-checks. Console / page errors fail.
//
// REFUSES to run unless the server shows the MOCK badge (NAI_MOCK=1) and the
// queue is idle.
//
// Usage (repo root, throwaway data):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-parts
//   NAI_MOCK=1 NAI_MOCK_DELAY_MS=300 STUDIO_DATA_DIR=<repo>/demo-parts/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3100 --strictPort
//   PW_CORE=<playwright-core> runtime/node/node.exe scripts/smoke/parts.mjs \
//     http://127.0.0.1:3100 demo-parts/data/studio.db
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
const entryIds = (raw) => {
  const v = json(raw)
  return Array.isArray(v) ? v.map((e) => (typeof e === 'number' ? e : e?.id)) : []
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

// ── page helpers ──
const POP = '[data-slot="popover-content"]'
async function typeInto(locator, text) {
  await locator.click()
  await page.keyboard.type(text, { delay: 12 })
  await page.keyboard.press('Escape') // close any tag autocomplete
}
async function newEntry(name) {
  await page.locator('[data-new-entry]').click()
  const input = page.locator(POP).getByRole('textbox')
  await input.fill(name)
  await input.press('Enter')
  await page
    .locator('[data-list-row]')
    .filter({ hasText: name })
    .first()
    .waitFor({ timeout: 8000 })
}
/** Add a fragment row and type its text into the CodeMirror editor. */
async function addFragment(text) {
  const rows = page.locator('[data-fragment-row]')
  const before = await rows.count()
  await page.locator('[data-add-fragment]').click()
  await until(async () => (await rows.count()) === before + 1, 8000, 'fragment row added')
  const row = rows.nth(before)
  const cm = row.locator('.cm-content')
  await cm.waitFor({ timeout: 15000 })
  await typeInto(cm, text)
  await sleep(1000) // 800ms autosave
  return row
}
/** Open a ConditionEditor popover on `trigger` and tick `names`. */
async function setCondition(trigger, names) {
  await trigger.click()
  const pop = page.locator(POP).last()
  await pop.waitFor()
  for (const n of names) {
    await pop.getByRole('checkbox', { name: n, exact: true }).click()
    await sleep(350)
  }
  await page.keyboard.press('Escape')
  await sleep(300)
}
const axisGroup = (scope, name) => scope.locator(`[role="group"][aria-label="${name}"]`)
const segBtn = (scope, axis, value) =>
  axisGroup(scope, axis)
    .locator('button')
    .filter({ hasText: new RegExp(`^${value}`) })
    .first()
const previewOut = () => page.locator('[data-preview-output]')
/** Delete-value button of the axis value row named `name` (waits for the UI list to catch up with the DB). */
async function deleteValueButton(name) {
  const inputs = page.locator('[data-value-row] [data-inline-name]')
  const idx = await until(async () => {
    const vals = await inputs.evaluateAll((els) => els.map((e) => e.textContent))
    const i = vals.lastIndexOf(name)
    return i >= 0 ? i + 1 : 0
  }, 8000, `value row "${name}" rendered`)
  return page.getByRole('button', { name: 'Delete value' }).nth((idx ?? 1) - 1)
}

// ── 0. preflight ──
await open("/")
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
if (q1("select 1 x from library_characters where name = 'Smoke Hana'")) refuse('Smoke Hana already exists: reseed the demo data first (this smoke is not re-runnable)')
for (const n of ['View', 'Framing'])
  if (!axisId(n)) refuse(`global axis ${n} missing (migration 0015 not applied?)`)
const baseline = {
  globalChars: q1('select count(*) c from library_characters where project_id is null').c,
  job: q1('select coalesce(max(id),0) m from generation_jobs').m,
}
check(true, 'preflight: MOCK badge, idle queue, global axes View/Framing present')
consoleErrors = 0 // first dev-server load can fail a dynamic import while vite optimizes deps

// ═════════════════════════════════════════════════════════════════════════════
step = '1'
let hanaId, jacketId
try {
  await open('/characters')
  await newEntry('Smoke Hana')
  hanaId = q1(`select id from library_characters where name = 'Smoke Hana'`)?.id
  check(!!hanaId, 'library character "Smoke Hana" created (DB)')
  await addFragment('hana_face')
  const row2 = await addFragment('hana_back_hair')
  await setCondition(row2.getByRole('button', { name: 'Condition' }), ['Back'])
  const frs = q(
    'select text, conditions from fragments where character_id = ? order by sort_order, id',
    hanaId,
  )
  check(
    frs.length === 2 &&
      frs[0].text === 'hana_face' &&
      frs[1].text === 'hana_back_hair',
    `Hana fragments saved: ${JSON.stringify(frs.map((f) => f.text))}`,
  )
  check(
    Object.keys(json(frs[0]?.conditions)).length === 0 &&
      JSON.stringify(json(frs[1]?.conditions)[axisId('View')]) ===
        JSON.stringify([valueId('View', 'Back')]),
    'Hana conditions: face = always, back_hair = View: Back',
  )
  await until(
    async () => (await previewOut().innerText()).trim() === 'hana_face',
    5000,
    'character preview at View Front = "hana_face"',
  )
  await segBtn(page, 'View', 'Back').click()
  const t = await until(
    async () => {
      const s = (await previewOut().innerText()).trim()
      return s === 'hana_face, hana_back_hair' ? s : null
    },
    5000,
    'character preview at View Back = "hana_face, hana_back_hair"',
  )
  check(!!t, 'character preview text changes with View')
  await shot('1-character')

  // Outfit item
  await open('/characters?tab=outfits')
  await newEntry('Smoke Jacket')
  jacketId = q1(`select id from outfit_items where name = 'Smoke Jacket'`)?.id
  check(!!jacketId, 'outfit item "Smoke Jacket" created (DB)')
  await page.getByRole('button', { name: 'Axis', exact: true }).click()
  const pop = page.locator(POP).last()
  await pop.getByRole('textbox', { name: 'Axis name' }).fill('Zipper')
  await pop.getByRole('textbox', { name: 'Values' }).fill('Closed, Open')
  await pop.getByRole('button', { name: 'Create', exact: true }).click()
  const zip = await until(
    () =>
      q1('select id from library_axes where name = ? and owner_item_id = ?', 'Zipper', jacketId),
    6000,
    'local axis Zipper saved',
  )
  check(
    zip &&
      q('select name from library_axis_values where axis_id = ? order by sort_order, id', zip.id)
        .map((v) => v.name)
        .join() === 'Closed,Open',
    'Zipper values Closed, Open (DB)',
  )
  // item condition: Framing ≠ Face
  await setCondition(page.getByRole('button', { name: 'Condition' }).first(), [
    'Full body',
    'Upper body',
  ])
  const ic = json(q1('select conditions from outfit_items where id = ?', jacketId)?.conditions)
  check(
    JSON.stringify(ic[axisId('Framing')]) ===
      JSON.stringify([valueId('Framing', 'Full body'), valueId('Framing', 'Upper body')]),
    'item condition Framing ∈ {Full body, Upper body} (DB)',
  )
  await addFragment('jacket_base')
  const r2 = await addFragment('jacket_zip_closed')
  await setCondition(r2.getByRole('button', { name: 'Condition' }), ['Closed', 'Front', 'Side'])
  const r3 = await addFragment('jacket_back_logo')
  await setCondition(r3.getByRole('button', { name: 'Condition' }), ['Back'])
  const jf = q(
    'select text, conditions from fragments where item_id = ? order by sort_order, id',
    jacketId,
  )
  check(
    jf.map((f) => f.text).join() === 'jacket_base,jacket_zip_closed,jacket_back_logo',
    `jacket fragments saved: ${jf.map((f) => f.text)}`,
  )
  const zc = json(jf[1]?.conditions)
  check(
    zc[String(zip?.id)]?.length === 1 && zc[axisId('View')]?.length === 2,
    'jacket_zip_closed condition = Zipper: Closed + View: Front, Side',
  )
  // preview: View Front → base + zip_closed ; View Back → base + back_logo
  const prev = async () => (await previewOut().innerText()).trim().replace(/\s+/g, ' ')
  await until(async () => (await prev()) === 'jacket_base, jacket_zip_closed', 5000, 'jacket preview Front = base, zip_closed')
  await segBtn(page, 'View', 'Back').click()
  await until(async () => (await prev()) === 'jacket_base, jacket_back_logo', 5000, 'jacket preview Back = base, back_logo')
  await segBtn(page, 'Zipper', 'Open').click()
  await segBtn(page, 'View', 'Front').click()
  await until(async () => (await prev()) === 'jacket_base', 5000, 'jacket preview Front + Zipper Open = base')
  await segBtn(page, 'Zipper', 'Closed').click()
  await segBtn(page, 'Framing', 'Face').click()
  await until(async () => /Smoke Jacket is empty|This item is empty for .*Face/.test(await prev()), 5000, 'jacket preview Framing Face = empty (item skipped)')
  check(/This item is empty for .*Face./.test(await previewOut().innerText()), 'empty preview names the values ("This item is empty for ... Face.")')
  await shot('1-outfit')

  // #11: reload, preview at pure defaults (nothing clicked) must include the jacket
  await open(`/characters?tab=outfits&id=${jacketId}`)
  await until(
    async () => (await prev()) === 'jacket_base, jacket_zip_closed',
    8000,
    'jacket preview at defaults after reload',
  )
  check(true, 'outfit preview at defaults (Front / Full body / Closed) = "jacket_base, jacket_zip_closed"')

  // #4: rapid successive condition edits must compose (no stale-props overwrite)
  const itemCondBtn = page.getByRole('button', { name: 'Condition' }).first()
  await itemCondBtn.click()
  const cpop = page.locator(POP).last()
  await cpop.waitFor()
  await cpop.getByRole('checkbox', { name: 'Face', exact: true }).click()
  await cpop.getByRole('checkbox', { name: 'Upper body', exact: true }).click()
  await cpop.getByRole('checkbox', { name: 'Upper body', exact: true }).click()
  await sleep(1500)
  const fr = axisId('Framing')
  const want = [valueId('Framing', 'Face'), valueId('Framing', 'Full body'), valueId('Framing', 'Upper body')].sort((a, b) => a - b)
  const got = (json(q1('select conditions from outfit_items where id = ?', jacketId)?.conditions)[fr] ?? []).slice().sort((a, b) => a - b)
  check(JSON.stringify(got) === JSON.stringify(want), `rapid condition clicks compose (DB Framing = ${JSON.stringify(got)})`)
  // restore: untick Face (rapid with a re-tick of Upper body pair is not needed)
  await cpop.getByRole('checkbox', { name: 'Face', exact: true }).click()
  await sleep(1200)
  await page.keyboard.press('Escape')
  const got2 = (json(q1('select conditions from outfit_items where id = ?', jacketId)?.conditions)[fr] ?? []).slice().sort((a, b) => a - b)
  check(
    JSON.stringify(got2) ===
      JSON.stringify([valueId('Framing', 'Full body'), valueId('Framing', 'Upper body')].sort((a, b) => a - b)),
    'item condition restored to {Full body, Upper body}',
  )
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('1-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
step = '2'
try {
  await open('/characters?tab=presets')
  await newEntry('Smoke Outfit')
  const preset = q1(`select id, item_ids from outfit_presets where name = 'Smoke Outfit'`)
  check(!!preset, 'preset "Smoke Outfit" created')
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Jacket' }).first().click()
  await until(
    () =>
      JSON.stringify(
        entryIds(q1('select item_ids from outfit_presets where id = ?', preset.id).item_ids),
      ) === JSON.stringify([jacketId]),
    6000,
    'preset item_ids = [jacket]',
  )
  check(true, 'preset contains the jacket (DB)')
  await shot('2-preset')

  // Axes tab: add + delete a value of View
  await open('/characters?tab=axes')
  await page.locator('[data-list-row]').filter({ hasText: /^View/ }).first().click()
  const viewBefore = q('select id from library_axis_values where axis_id = ?', axisId('View')).length
  await page.getByRole('button', { name: 'Add value' }).click()
  const addInput = page.getByRole('textbox', { name: 'Add value' })
  await addInput.fill('Temp')
  await addInput.press('Enter')
  await until(
    () => q('select id from library_axis_values where axis_id = ?', axisId('View')).length === viewBefore + 1,
    6000,
    'View value "Temp" added',
  )
  check(true, 'axis value added (DB count +1)')
  await (await deleteValueButton('Temp')).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await until(
    () => q('select id from library_axis_values where axis_id = ?', axisId('View')).length === viewBefore,
    6000,
    'View value "Temp" deleted',
  )
  check(
    !q1(`select 1 from library_axis_values where name = 'Temp'`),
    'axis value deleted again; View values restored',
  )
  await shot('2-axes')

  // #6: deleting a value that is a fragment's only allowed value must NOT make it unconditional
  if (!(await addInput.isVisible())) await page.getByRole('button', { name: 'Add value' }).click()
  await addInput.fill('Tmp')
  await addInput.press('Enter')
  await until(() => !!valueId('View', 'Tmp'), 6000, 'View value Tmp added')
  const tmpId = valueId('View', 'Tmp')
  await open(`/characters?tab=characters&id=${hanaId}`)
  const tmpRow = await addFragment('hana_tmp')
  await setCondition(tmpRow.getByRole('button', { name: 'Condition' }), ['Tmp'])
  const tmpFrag = q1(`select id, conditions from fragments where character_id = ? and text = 'hana_tmp'`, hanaId)
  check(
    JSON.stringify(json(tmpFrag?.conditions)[axisId('View')]) === JSON.stringify([tmpId]),
    'fragment hana_tmp condition = View: Tmp (DB)',
  )
  await open('/characters?tab=axes')
  await page.locator('[data-list-row]').filter({ hasText: /^View/ }).first().click()
  await (await deleteValueButton('Tmp')).click()
  const dlg = page.getByRole('alertdialog')
  await dlg.waitFor()
  const dlgText = (await dlg.innerText()).replace(/\s+/g, ' ')
  console.log(`  value-delete confirm: ${dlgText}`)
  check(/1 fragment\(s\)\/item\(s\)/.test(dlgText), 'value-delete confirm names the number of referencing fragments/items (1)')
  await dlg.getByRole('button', { name: 'Delete', exact: true }).click()
  await until(() => !valueId('View', 'Tmp'), 6000, 'Tmp deleted')
  const after = json(q1('select conditions from fragments where id = ?', tmpFrag.id)?.conditions)
  check(
    Array.isArray(after[axisId('View')]) && after[axisId('View')].length === 0,
    `fragment keeps the key with [] after the value delete (${JSON.stringify(after)})`,
  )
  await open(`/characters?tab=characters&id=${hanaId}`)
  const broken = page.locator('[data-fragment-row] [data-condition-broken]')
  await broken.first().waitFor({ timeout: 8000 })
  const brokenText = (await broken.first().innerText()).trim()
  check(/View: \(none\)/.test(brokenText), `condition chip renders as warning "${brokenText}"`)
  await until(async () => (await previewOut().innerText()).trim() === 'hana_face', 5000, 'hana preview excludes the never-matching fragment')
  check(true, 'never-matching fragment is not included in the preview (not unconditional)')
  await shot('2-broken-condition')
  // cleanup: delete the temporary fragment
  await page.locator('[data-fragment-row]').filter({ hasText: 'hana_tmp' }).getByRole('button', { name: 'Delete fragment' }).click()
  await until(() => !q1('select 1 x from fragments where id = ?', tmpFrag.id), 6000, 'hana_tmp removed')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('2-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
step = '3'
const rail = () => page.locator('[data-scene-id]')
const sceneIdFromUrl = () => Number(new URL(page.url()).searchParams.get('scene'))
const partsSection = () => page.locator('[data-testid="scene-parts"]')
const sceneRow = () => partsSection().locator('> div').first()
const charRow = () => partsSection().locator('[data-testid="parts-character"]').first()
let A, B, C, slot
async function ensurePartsOpen() {
  const sec = page.locator('[data-testid="scene-parts-section"]')
  await sec.waitFor({ timeout: 15000 })
  const btn = sec.locator('> button').first()
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click()
  await partsSection().waitFor({ timeout: 10000 })
}
async function ensurePreviewOpen() {
  const btn = partsSection().getByRole('button', { name: /Final prompt preview/ })
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click()
  await page.locator('[data-testid="parts-preview"]').waitFor({ timeout: 10000 })
}
const previewAll = async () => {
  await ensurePreviewOpen()
  return (await page.locator('[data-testid="parts-preview"]').innerText()).replace(/\s+/g, ' ')
}
async function previewMatches(fn, msg, timeout = 8000) {
  let last = ''
  const ok = await until(
    async () => {
      last = await previewAll()
      return fn(last) ? last : null
    },
    timeout,
    `${msg} (last: ${last.slice(0, 160)})`,
    300,
  )
  return ok
}
async function selectScene(id) {
  await page.locator(`[data-scene-id="${id}"]`).first().click({ position: { x: 70, y: 14 } })
}
try {
  await open(`/workspace/${PROJECT}`)
  slot = q1('select * from characters where project_id = ? order by slot_index limit 1', PROJECT)
  check(!!slot, `project ${PROJECT} has a character slot`)
  await rail().first().waitFor({ timeout: 15000 })
  await until(() => sceneIdFromUrl() > 0, 8000, 'first scene auto-selected')
  A = sceneIdFromUrl()
  const ids = await rail().evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-scene-id'))))
  ;[B, C] = ids.filter((i) => i !== A)
  check(ids.length >= 3 && A === ids[0], `rail scenes ${ids.join(',')}; A=${A}, B=${B}, C=${C}`)

  await page.getByRole('tab', { name: /^Chars/ }).click()
  await page.locator('[data-library-character-select]').click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Hana' }).first().click()
  await until(
    () => q1('select library_character_id l from characters where id = ?', slot.id).l === hanaId,
    8000,
    'slot linked to Smoke Hana',
  )
  check(true, 'slot linked to "Smoke Hana" (DB)')
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Jacket' }).first().click()
  await until(
    () =>
      JSON.stringify(entryIds(q1('select outfit_item_ids o from characters where id = ?', slot.id).o)) ===
      JSON.stringify([jacketId]),
    8000,
    'slot default outfit = [jacket]',
  )
  check(true, 'jacket added as default outfit (DB)')
  check(
    (await page.locator('[data-parts-hint]').count()) > 0,
    'prompt hint about @{char}/@{outfit} shown for a linked slot',
  )
  await shot('3-chars-tab')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('3-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
step = '4'
const sceneAx = (id) => json(q1('select axis_values a from project_scenes where id = ?', id)?.a)
const overrideAx = (sceneId) =>
  json(
    q1(
      'select axis_values a from character_scene_overrides where project_scene_id = ? and character_id = ?',
      sceneId,
      slot.id,
    )?.a,
  )
try {
  await open(`/workspace/${PROJECT}?scene=${A}`)
  await ensurePartsOpen()
  await shot('4-parts-section')
  const V = axisId('View'), F = axisId('Framing')

  await segBtn(sceneRow(), 'View', 'Back').click()
  await previewMatches(
    (s) => s.includes('hana_face, hana_back_hair') && s.includes('jacket_back_logo') && !s.includes('jacket_zip_closed'),
    'View Back → hana_face, hana_back_hair + jacket_back_logo, no zip_closed',
  )
  check(true, 'View Back: composed prompt has face+back_hair and back_logo, not zip_closed')
  check(
    (await until(() => sceneAx(A)[V] === valueId('View', 'Back'), 6000, 'scene View=Back persisted')) !== null,
    'scene axis_values.View = Back persisted',
  )

  await segBtn(sceneRow(), 'Framing', 'Face').click()
  await previewMatches((s) => !s.includes('jacket_'), 'Framing Face → jacket gone')
  check(true, 'Framing Face: jacket fragments are gone')
  await segBtn(sceneRow(), 'Framing', 'Full body').click()
  await previewMatches((s) => s.includes('jacket_back_logo'), 'Framing Full body → jacket back')

  // per-character override: View Front
  await charRow().locator('> button').click()
  await segBtn(charRow(), 'View', 'Front').click()
  await previewMatches(
    (s) => s.includes('jacket_zip_closed') && !s.includes('jacket_back_logo') && !s.includes('hana_back_hair'),
    'override View Front → jacket_zip_closed present (Zipper default Closed)',
  )
  check(true, 'override View Front: jacket_zip_closed present, back parts gone')
  check(
    (await until(() => overrideAx(A)[V] === valueId('View', 'Front'), 6000, 'override persisted')) !== null,
    'override axis_values.View = Front persisted',
  )
  await shot('4-override')

  // fast switch (scene axis): change then switch immediately
  await segBtn(sceneRow(), 'View', 'Side').click()
  await selectScene(B)
  await until(() => sceneIdFromUrl() === B, 5000, 'switched to scene B')
  const okSide = await until(() => sceneAx(A)[V] === valueId('View', 'Side'), 6000, 'A.View=Side persisted after fast switch')
  check(!!okSide, `fast switch: scene A View=Side persisted (${JSON.stringify(sceneAx(A))})`)
  check(
    sceneAx(B)[V] === undefined,
    `scene B untouched by A's change (${JSON.stringify(sceneAx(B))})`,
  )
  await selectScene(A)
  await until(() => sceneIdFromUrl() === A, 5000, 'back on A')
  await ensurePartsOpen()
  check(
    ((await segBtn(sceneRow(), 'View', 'Side').getAttribute('data-state')) ?? '') === 'on',
    'switching back to A shows View=Side selected',
  )

  // fast switch (override): Framing Upper body override then switch
  await charRow().locator('> button').click().catch(() => {})
  if ((await charRow().locator('> button').getAttribute('aria-expanded')) !== 'true')
    await charRow().locator('> button').click()
  await segBtn(charRow(), 'Framing', 'Upper body').click()
  await selectScene(C)
  await until(() => sceneIdFromUrl() === C, 5000, 'switched to scene C')
  const okOv = await until(
    () => overrideAx(A)[F] === valueId('Framing', 'Upper body'),
    6000,
    'override Framing persisted after fast switch',
  )
  check(!!okOv, `fast switch: override Framing=Upper body persisted (${JSON.stringify(overrideAx(A))})`)
  check(
    overrideAx(A)[V] === valueId('View', 'Front'),
    'earlier override View=Front still intact (no clobber)',
  )
  await selectScene(A)
  await until(() => sceneIdFromUrl() === A, 5000, 'back on A (2)')
  await ensurePartsOpen()
  if ((await charRow().locator('> button').getAttribute('aria-expanded')) !== 'true')
    await charRow().locator('> button').click()
  check(
    ((await segBtn(charRow(), 'Framing', 'Upper body').getAttribute('data-state')) ?? '') === 'on',
    'switching back to A shows override Framing=Upper body selected',
  )
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('4-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
step = '5'
try {
  await open(`/workspace/${PROJECT}?scene=${A}`)
  await rail().first().waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'More scene options' }).click()
  await page.getByRole('menuitem', { name: 'Select', exact: true }).click()
  await page.locator('[data-selection-header]').first().waitFor({ timeout: 8000 })
  for (const id of [A, C]) {
    await page.locator(`[data-scene-id="${id}"] [role="checkbox"]`).first().click()
    await sleep(150)
  }
  check(/2 selected/.test(await page.locator('[data-selection-header]').first().innerText()), '2 scenes selected')
  await page.getByRole('button', { name: 'More selection actions' }).click()
  await page.getByRole('menuitem', { name: /Set view\/framing/ }).click()
  const dlg = page.getByRole('dialog').filter({ hasText: 'Set view / framing' })
  await dlg.waitFor({ timeout: 8000 })
  await dlg.getByRole('combobox', { name: 'Framing' }).click()
  await page.getByRole('option', { name: 'Face', exact: true }).click()
  await dlg.getByRole('button', { name: 'Apply' }).click()
  const V = axisId('View'), F = axisId('Framing')
  await until(() => sceneAx(C)[F] === valueId('Framing', 'Face'), 6000, 'bulk applied to C')
  check(
    sceneAx(A)[F] === valueId('Framing', 'Face') && sceneAx(A)[V] === valueId('View', 'Side'),
    `A merged: Framing=Face, View=Side kept (${JSON.stringify(sceneAx(A))})`,
  )
  check(
    JSON.stringify(sceneAx(C)) === JSON.stringify({ [F]: valueId('Framing', 'Face') }),
    `C got only Framing=Face (${JSON.stringify(sceneAx(C))})`,
  )
  check(sceneAx(B)[F] === undefined, 'unselected scene B untouched')
  await shot('5-bulk')
  await page.getByRole('button', { name: 'Exit selection' }).first().click()
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('5-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
step = '6'
let previewBeforeDetach = ''
try {
  await open(`/workspace/${PROJECT}?scene=${A}`)
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
  const btn = page.getByRole('button', { name: /^Generate \d+$/ }).first()
  check((await btn.innerText()).trim() === 'Generate 1', 'footer reads "Generate 1"')
  await ensurePartsOpen()
  previewBeforeDetach = await previewAll()
  await btn.click()
  const job = await until(
    () => q1('select * from generation_jobs where id > ? and project_scene_id = ?', baseline.job, A),
    10000,
    'job created for scene A',
  )
  if (job) {
    await until(
      () => q1('select status s from generation_jobs where id = ?', job.id).s === 'completed',
      30000,
      'mock job completed',
    )
    const rp = q1('select resolved_prompts r from generation_jobs where id = ?', job.id).r
    check(
      rp.includes('hana_face') && rp.includes('jacket_base') && rp.includes('jacket_zip_closed'),
      'resolved_prompts contains hana_face, jacket_base, jacket_zip_closed',
    )
    check(
      !rp.includes('hana_back_hair') && !rp.includes('jacket_back_logo') && !rp.includes('@{char}'),
      'resolved_prompts has no back-only fragments and no raw tokens',
    )
    const parsed = json(rp)
    console.log('  resolved_prompts:', JSON.stringify(parsed).slice(0, 360))
    check(
      q1('select count(*) c from generated_images where job_id = ?', job.id).c === 1,
      'one image generated',
    )
  }
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('6-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
step = '7'
try {
  const hanaBefore = q('select id, name from library_characters where project_id is null order by id')
  const itemsBefore = q('select id from outfit_items where project_id is null order by id')
  await open(`/workspace/${PROJECT}?scene=${A}`)
  await page.getByRole('tab', { name: /^Chars/ }).click()
  await page.getByRole('button', { name: 'Detach', exact: true }).click()
  const ad = page.getByRole('alertdialog')
  await ad.waitFor()
  const confirmLabel = (await ad.getByRole('button').last().innerText()).trim()
  console.log(`  detach confirm button label: "${confirmLabel}"`)
  check(
    /detach/i.test(confirmLabel),
    `detach confirm button is labelled "Detach" (is "${confirmLabel}")`,
  )
  await ad.getByRole('button').last().click()
  await until(
    () => {
      const l = q1('select library_character_id l from characters where id = ?', slot.id).l
      return l && l !== hanaId
    },
    8000,
    'slot relinked to a copy',
  )
  const s2 = q1('select * from characters where id = ?', slot.id)
  const copy = q1('select * from library_characters where id = ?', s2.library_character_id)
  check(
    copy?.project_id === PROJECT && copy?.source_id === hanaId,
    `slot points to a project-only copy (project_id=${copy?.project_id}, source_id=${copy?.source_id})`,
  )
  const copyFr = q('select text from fragments where character_id = ? order by sort_order, id', copy?.id)
  check(copyFr.map((f) => f.text).join() === 'hana_face,hana_back_hair', 'copy has the fragments')
  const newItems = entryIds(s2.outfit_item_ids)
  const copiedItem = q1('select * from outfit_items where id = ?', newItems[0])
  check(
    newItems.length === 1 && copiedItem?.project_id === PROJECT && copiedItem.id !== jacketId,
    'default outfit points to a project-only item copy',
  )
  const hanaAfter = q('select id, name from library_characters where project_id is null order by id')
  const itemsAfter = q('select id from outfit_items where project_id is null order by id')
  check(
    JSON.stringify(hanaAfter) === JSON.stringify(hanaBefore) &&
      JSON.stringify(itemsAfter) === JSON.stringify(itemsBefore),
    'global library rows unchanged (characters + items)',
  )
  const ov = q1(
    'select outfit_item_ids o, axis_values a from character_scene_overrides where project_scene_id = ? and character_id = ?',
    A,
    slot.id,
  )
  check(
    JSON.stringify(json(ov?.a)) ===
      JSON.stringify({ [axisId('View')]: valueId('View', 'Front'), [axisId('Framing')]: valueId('Framing', 'Upper body') }),
    'override axis_values (global axes) unchanged by detach',
  )
  await shot('7-detached')

  await open(`/workspace/${PROJECT}?scene=${A}`)
  await ensurePartsOpen()
  const after = await previewAll()
  check(after === previewBeforeDetach, `preview unchanged after detach`)
  if (after !== previewBeforeDetach)
    console.log(`  before: ${previewBeforeDetach}\n  after:  ${after}`)

  await open('/characters')
  await page.locator('[data-list-row]').first().waitFor({ timeout: 8000 })
  const rowsHana = page.locator('[data-list-row]').filter({ hasText: 'Smoke Hana' })
  check((await rowsHana.count()) === 1, 'library page lists "Smoke Hana" exactly once (copy hidden)')
  check(
    (await page.locator('[data-list-row]').count()) === q1('select count(*) c from library_characters where project_id is null').c,
    'library page row count = global characters in DB',
  )
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('7-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
step = '8'
try {
  await open(`/workspace/${PROJECT2}`)
  const chars = q('select * from characters where project_id = ? order by slot_index', PROJECT2)
  check(chars.length >= 2, `project ${PROJECT2} has ${chars.length} characters`)
  const [c1, c2] = chars
  check(!c2.library_character_id, 'second character is not linked')
  // link the first one so the Parts section / preview exists
  await page.getByRole('tab', { name: /^Chars/ }).click()
  await page.locator('[data-library-character-select]').click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Hana' }).first().click()
  await until(
    () => q1('select library_character_id l from characters where id = ?', c1.id).l === hanaId,
    8000,
    'first character linked',
  )
  await open(`/workspace/${PROJECT2}`)
  await rail().first().waitFor({ timeout: 15000 })
  await ensurePartsOpen()
  const all = await previewAll()
  const blocks = page.locator('[data-testid="parts-preview"] > div')
  const textOf = async (label) =>
    (
      await blocks
        .evaluateAll((els, l) => els.filter((e) => e.children[0]?.textContent === l).map((e) => e.querySelector("pre")?.textContent ?? ""), label)
    )[0]?.trim() ?? ""
  const linkedText = await textOf(c1.name)
  const plainText = await textOf(c2.name)
  console.log(`  linked   (${c1.name}): ${linkedText}`)
  console.log(`  unlinked (${c2.name}): ${plainText}`)
  check(linkedText.startsWith('hana_face'), 'linked character prompt starts with its parts')
  const stem = c2.char_prompt.split('@{')[0].trim()
  check(
    plainText.startsWith(stem),
    `unlinked prompt starts with its own text "${stem}" (no leading commas)`,
  )
  check(
    !/(^|[^\w]),\s*,|,\s*,|^\s*,/.test(plainText),
    'unlinked prompt has no leading / double commas',
  )
  check(!plainText.includes('hana_') && !plainText.includes('jacket_'), 'no parts leaked into the unlinked character')
  void all
  await shot('8-unlinked')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('8-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
// Occlusion + library images + gallery axis filter (steps 9-14 = A-F)
const areaId = (name) => q1('select id from library_areas where name = ?', name)?.id
const itemRow = (id) => q1('select * from outfit_items where id = ?', id)
let shirtId, S2
let dImages = []

step = '9' // A. Body areas section
try {
  await open('/characters?tab=axes')
  await page.locator('[data-areas-entry]').click()
  await page.locator('[data-areas-editor]').waitFor({ timeout: 8000 })
  const rows = page.locator('[data-area-row]')
  const names = await rows.evaluateAll((els) =>
    els.map((e) => e.querySelector('[data-inline-name]').textContent),
  )
  check(
    names.join() === 'Top,Neck,Chest,Arms,Bottom,Outerwear,Shoes,Headwear,Accessory',
    `Body areas lists the 9 seeded areas (children under Top): ${names.join()}`,
  )
  await page.getByRole('button', { name: 'Add area' }).click()
  const nameInput = page.getByRole('textbox', { name: 'Add area' })
  await nameInput.fill('Smoke Area')
  await nameInput.press('Enter')
  await until(() => !!areaId('Smoke Area'), 6000, 'area "Smoke Area" created')
  await until(async () => (await rows.count()) === 10, 6000, 'UI shows 10 area rows')
  check(q('select id from library_areas').length === 10, 'area added (DB 10 rows)')
  await rows.nth(9).locator('[data-inline-name]').click()
  const last = rows.nth(9).locator('[data-inline-name-input]')
  await last.fill('Smoke Area 2')
  await last.press('Enter')
  await until(() => !!areaId('Smoke Area 2'), 6000, 'area renamed')
  check(!areaId('Smoke Area'), 'area renamed (DB: old name gone)')
  await shot('9-areas')
  await page.getByRole('button', { name: 'Delete area' }).last().click()
  const dlg = page.getByRole('alertdialog')
  await dlg.waitFor()
  console.log(`  area-delete confirm: ${(await dlg.innerText()).replace(/\s+/g, ' ')}`)
  await dlg.getByRole('button', { name: 'Delete', exact: true }).click()
  await until(() => !areaId('Smoke Area 2'), 6000, 'area deleted')
  check(q('select id from library_areas').length === 9, 'area deleted (DB back to 9 rows)')
  await until(async () => (await rows.count()) === 9, 6000, 'UI back to 9 area rows')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('9-error').catch(() => {})
}

step = '10' // B. Smoke Shirt / Jacket areas + cover rules, slot outfit order
try {
  await open('/characters?tab=outfits')
  await newEntry('Smoke Shirt')
  shirtId = q1(`select id from outfit_items where name = 'Smoke Shirt'`)?.id
  check(!!shirtId, 'outfit item "Smoke Shirt" created')
  await addFragment('shirt_white')
  const areaChip = (scope, name) =>
    scope.locator('[data-area-chip]').filter({ hasText: new RegExp(`^${name}$`) })
  await areaChip(page.locator('[data-item-areas]'), 'Top').click()
  await until(
    () => JSON.stringify(json(itemRow(shirtId)?.area_ids)) === JSON.stringify([areaId('Top')]),
    6000,
    'shirt area_ids = [Top]',
  )
  check(true, 'Smoke Shirt area = Top (DB)')
  await shot('10-shirt')

  await open(`/characters?tab=outfits&id=${jacketId}`)
  await page.locator('[data-item-areas]').waitFor({ timeout: 8000 })
  await areaChip(page.locator('[data-item-areas]'), 'Outerwear').click()
  await until(
    () => JSON.stringify(json(itemRow(jacketId)?.area_ids)) === JSON.stringify([areaId('Outerwear')]),
    6000,
    'jacket area_ids = [Outerwear]',
  )
  check(true, 'Smoke Jacket area = Outerwear (DB)')
  const rules = page.locator('[data-cover-rule]')
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-add-rule]').click()
    await until(async () => (await rules.count()) === i + 1, 5000, `rule ${i + 1} added`)
  }
  await setCondition(rules.nth(0).getByRole('button', { name: 'Condition' }), ['Closed'])
  await areaChip(rules.nth(0), 'Top').click()
  await setCondition(rules.nth(1).getByRole('button', { name: 'Condition' }), ['Back'])
  await areaChip(rules.nth(1), 'Top').click()
  const zipAxis = q1('select id from library_axes where name = ? and owner_item_id = ?', 'Zipper', jacketId).id
  const zipClosed = q1('select id from library_axis_values where axis_id = ? and name = ?', zipAxis, 'Closed').id
  const wantRules = [
    { conditions: { [zipAxis]: [zipClosed] }, areaIds: [areaId('Top')] },
    { conditions: { [axisId('View')]: [valueId('View', 'Back')] }, areaIds: [areaId('Top')] },
  ]
  const gotRules = await until(
    () => {
      const r = json(itemRow(jacketId)?.cover_rules)
      return JSON.stringify(r) === JSON.stringify(wantRules) ? r : null
    },
    8000,
    `jacket cover_rules saved (${itemRow(jacketId)?.cover_rules})`,
  )
  check(!!gotRules, 'cover rules: Zipper Closed -> Top, View Back -> Top (DB)')
  await shot('10-jacket-rules')
  check(
    JSON.stringify(json(itemRow(jacketId)?.conditions)[axisId('Framing')]) ===
      JSON.stringify([valueId('Framing', 'Full body'), valueId('Framing', 'Upper body')]),
    'jacket item condition untouched by rule edits',
  )

  // workspace slot (project 2, first character, linked to Hana in step 8)
  await open(`/workspace/${PROJECT2}`)
  await page.getByRole('tab', { name: /^Chars/ }).click()
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Shirt' }).first().click()
  const slot2 = q1('select * from characters where project_id = ? order by slot_index limit 1', PROJECT2)
  await until(
    () => JSON.stringify(entryIds(q1('select outfit_item_ids o from characters where id = ?', slot2.id).o)) === JSON.stringify([shirtId]),
    8000,
    'slot outfit = [shirt]',
  )
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Jacket' }).first().click()
  await until(
    () => JSON.stringify(entryIds(q1('select outfit_item_ids o from characters where id = ?', slot2.id).o)) === JSON.stringify([shirtId, jacketId]),
    8000,
    'slot outfit = [shirt, jacket]',
  )
  check(true, 'slot default outfit order = Shirt, Jacket (DB)')
  await shot('10-chars-tab')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('10-error').catch(() => {})
}

step = '11' // C. Scene Parts: covered state
const charRow2 = () => partsSection().locator('[data-testid="parts-character"]').first()
async function expandChar() {
  const b = charRow2().locator('> button')
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click()
}
const badgeCount = () => charRow2().locator('[data-covered-badge]').count()
try {
  await open(`/workspace/${PROJECT2}`)
  await rail().first().waitFor({ timeout: 15000 })
  await until(() => sceneIdFromUrl() > 0, 8000, 'scene auto-selected')
  S2 = sceneIdFromUrl()
  await ensurePartsOpen()
  await expandChar()
  await segBtn(sceneRow(), 'View', 'Front').click()
  await segBtn(charRow2(), 'Zipper', 'Closed').click()
  await previewMatches(
    (s) => s.includes('jacket_base') && !s.includes('shirt_white'),
    'View Front + Zipper Closed -> no shirt_white',
  )
  check(true, 'Front + Closed: final preview has no shirt_white (jacket present)')
  await until(async () => (await badgeCount()) === 1, 5000, 'Covered badge shown')
  check(
    (await charRow2().locator('[data-covered]').innerText()).includes('Smoke Shirt'),
    'Shirt chip is the dimmed one with the Covered badge',
  )
  await charRow2().locator('[data-covered-badge]').hover()
  const tip = await page.getByRole('tooltip').first().innerText({ timeout: 4000 }).catch(() => '')
  check(/Smoke Jacket/.test(tip), `Covered badge tooltip names the covering item ("${tip.trim()}")`)
  await page.mouse.move(5, 5)
  await shot('11-covered')

  await segBtn(charRow2(), 'Zipper', 'Open').click()
  await previewMatches((s) => s.includes('shirt_white'), 'Zipper Open -> shirt_white present')
  await until(async () => (await badgeCount()) === 0, 5000, 'Covered badge gone')
  check(true, 'Front + Open: shirt_white present, no Covered badge')
  await shot('11-open')

  await segBtn(sceneRow(), 'View', 'Back').click()
  await previewMatches((s) => !s.includes('shirt_white'), 'View Back (Zipper Open) -> shirt covered again')
  await until(async () => (await badgeCount()) === 1, 5000, 'Covered badge back')
  check(true, 'Back + Open: shirt covered again (badge shown, no shirt_white)')

  await segBtn(sceneRow(), 'Framing', 'Face').click()
  await previewMatches(
    (s) => s.includes('shirt_white') && !s.includes('jacket_'),
    'Framing Face -> jacket excluded, shirt_white present',
  )
  await until(async () => (await badgeCount()) === 0, 5000, 'no badge at Face')
  check(true, 'Framing Face: jacket excluded by item condition, shirt NOT covered')
  await shot('11-face')

  // back to the state used for generation: View Back, Full body, Zipper Closed
  await segBtn(sceneRow(), 'Framing', 'Full body').click()
  await segBtn(charRow2(), 'Zipper', 'Closed').click()
  await previewMatches((s) => !s.includes('shirt_white') && s.includes('jacket_back_logo'), 'restored Back/Full body/Closed')
  check(
    (await until(() => sceneAx(S2)[axisId('View')] === valueId('View', 'Back') && sceneAx(S2)[axisId('Framing')] === valueId('Framing', 'Full body'), 6000, 'scene axis persisted')) !== null,
    'scene axis_values: View=Back, Framing=Full body persisted',
  )
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('11-error').catch(() => {})
}

step = '12' // D. generate 2 images with View Back
try {
  await open(`/workspace/${PROJECT2}?scene=${S2}`)
  const inputs = page.locator('[title="Images to generate"] input')
  await inputs.first().waitFor({ timeout: 15000 })
  const n = await inputs.count()
  for (let i = 0; i < n; i++) {
    const rowScene = await inputs.nth(i).evaluate((el) => el.closest('[data-scene-id]')?.getAttribute('data-scene-id') ?? null)
    const want = rowScene === String(S2) ? 2 : 0
    const input = inputs.nth(i)
    if ((await input.inputValue()) === String(want)) continue
    await input.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type(String(want))
    await page.keyboard.press('Enter')
    await sleep(120)
  }
  const btn = page.getByRole('button', { name: /^Generate \d+$/ }).first()
  const label = (await btn.innerText()).trim()
  check(label === 'Generate 2', `footer reads "Generate 2" (is "${label}")`)
  const jobBase = q1('select coalesce(max(id),0) m from generation_jobs').m
  await btn.click()
  const job = await until(
    () => q1('select * from generation_jobs where id > ? and project_scene_id = ?', jobBase, S2),
    10000,
    'job created',
  )
  if (job) {
    await until(() => q1('select status s from generation_jobs where id = ?', job.id).s === 'completed', 40000, 'job completed')
    dImages = q('select id from generated_images where job_id = ? order by id', job.id).map((r) => r.id)
    check(dImages.length === 2, `2 images generated (${dImages})`)
    const rows = q(
      `select a.name axis, a.owner_character_id oc, a.owner_item_id oi, v.name value
       from image_axis_values iv join library_axes a on a.id = iv.axis_id join library_axis_values v on v.id = iv.value_id
       where iv.image_id in (${dImages.join(',')})`,
    )
    check(
      dImages.every((id) => q1('select 1 x from image_axis_values where image_id = ? and axis_id = ? and value_id = ?', id, axisId('View'), valueId('View', 'Back'))),
      'both images have image_axis_values View=Back',
    )
    check(
      rows.every((r) => r.oc === null && r.oi === null) && !rows.some((r) => r.axis === 'Zipper'),
      `only global axes recorded (${[...new Set(rows.map((r) => r.axis + '=' + r.value))].join(', ')})`,
    )
    for (const id of dImages) {
      const links = q('select kind, ref_id from image_library_links where image_id = ?', id)
      const has = (k, r) => links.some((l) => l.kind === k && l.ref_id === r)
      check(
        has('character', hanaId) && has('item', jacketId) && !has('item', shirtId),
        `image ${id} links: character Hana + item Jacket, not the covered Shirt (${JSON.stringify(links)})`,
      )
    }
  }
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('12-error').catch(() => {})
}

step = '13' // E. library images + thumbnail + view in gallery
try {
  const hanaImgs = q("select image_id from image_library_links where kind = 'character' and ref_id = ? order by image_id desc", hanaId).map((r) => r.image_id)
  check(hanaImgs.length >= 3 && dImages.every((i) => hanaImgs.includes(i)), `Hana has ${hanaImgs.length} linked images (DB), includes the 2 new ones`)
  await open(`/characters?tab=characters&id=${hanaId}`)
  const sec = page.locator('[data-library-images]')
  await sec.waitFor({ timeout: 10000 })
  check(
    new RegExp(`Images \\(${hanaImgs.length}\\)`).test(await sec.innerText()),
    `detail shows "Images (${hanaImgs.length})"`,
  )
  await until(async () => (await sec.locator('[data-library-image]').count()) === hanaImgs.length, 8000, 'image grid count')
  const gridIds = await sec.locator('[data-library-image]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-library-image'))))
  check(gridIds.every((i) => hanaImgs.includes(i)), 'grid shows exactly the linked images')
  const rowThumb = () =>
    page.locator('[data-list-row]').filter({ hasText: 'Smoke Hana' }).first().locator('[data-list-thumb]')
  const relOf = (id) => q1('select thumbnail_path p from generated_images where id = ?', id).p.replace('data/thumbnails/', '')
  await rowThumb().waitFor({ timeout: 8000 })
  const srcBefore = await rowThumb().getAttribute('src')
  check(srcBefore.endsWith(relOf(hanaImgs[0])), 'list row thumbnail = latest linked image (auto)')
  const oldest = hanaImgs[hanaImgs.length - 1]
  await sec.locator(`[data-set-thumbnail="${oldest}"]`).click({ force: true })
  await until(() => q1('select thumbnail_image_id t from library_characters where id = ?', hanaId).t === oldest, 6000, 'thumbnail_image_id set')
  const changed = await until(async () => (await rowThumb().getAttribute('src')).endsWith(relOf(oldest)), 8000, 'list thumbnail changed')
  check(!!changed, 'list row thumbnail changed to the chosen (oldest) image')
  await shot('13-thumb-set')
  await sec.locator('[data-reset-thumbnail]').click()
  await until(() => q1('select thumbnail_image_id t from library_characters where id = ?', hanaId).t === null, 6000, 'thumbnail reset (DB)')
  const back = await until(async () => (await rowThumb().getAttribute('src')).endsWith(relOf(hanaImgs[0])), 8000, 'list thumbnail back to auto')
  check(!!back, 'Reset thumbnail restores the auto thumbnail')

  // outfit item pages
  await open(`/characters?tab=outfits&id=${shirtId}`)
  const sSec = page.locator('[data-library-images]')
  await sSec.waitFor({ timeout: 8000 })
  check(/Images \(0\)/.test(await sSec.innerText()), 'covered Shirt: "Images (0)"')
  await open(`/characters?tab=outfits&id=${jacketId}`)
  const jN = q1("select count(*) c from image_library_links where kind = 'item' and ref_id = ?", jacketId).c
  check(new RegExp(`Images \\(${jN}\\)`).test(await page.locator('[data-library-images]').innerText()) && jN >= 2, `Jacket: "Images (${jN})"`)

  // View in gallery
  await open(`/characters?tab=characters&id=${hanaId}`)
  await page.locator('[data-view-in-gallery]').click()
  await page.waitForURL(/\/gallery\?.*libraryCharacter=/, { timeout: 8000 })
  const chip = page.locator('[data-filter-chip="library-character"]')
  await chip.waitFor({ timeout: 8000 })
  check(/Smoke Hana/.test(await chip.innerText()), `gallery shows chip "${(await chip.innerText()).trim()}"`)
  const cards = page.locator('[data-gallery-grid] a[href^="/gallery/"]')
  await until(async () => (await cards.count()) === hanaImgs.length, 10000, `gallery shows ${hanaImgs.length} cards`)
  const gIds = (await cards.evaluateAll((els) => els.map((e) => Number(e.getAttribute('href').match(/\/gallery\/(\d+)/)[1])))).sort((a, b) => a - b)
  check(JSON.stringify(gIds) === JSON.stringify([...hanaImgs].sort((a, b) => a - b)), 'gallery shows only Hana images')
  await shot('13-gallery-char')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('13-error').catch(() => {})
}

step = '14' // F. gallery View filter
try {
  const V = axisId('View'), Bk = valueId('View', 'Back')
  const expected = q('select distinct image_id from image_axis_values where axis_id = ? and value_id = ? order by image_id', V, Bk).map((r) => r.image_id)
  check(dImages.every((i) => expected.includes(i)) && expected.length >= 2, `DB: ${expected.length} images with View=Back`)
  await open('/gallery')
  const cards = page.locator('[data-gallery-grid] a[href^="/gallery/"]')
  await cards.first().waitFor({ timeout: 15000 })
  const idsOf = async () => (await cards.evaluateAll((els) => els.map((e) => Number(e.getAttribute('href').match(/\/gallery\/(\d+)/)[1])))).sort((a, b) => a - b)
  const unfilteredCount = await cards.count()
  await page.locator('[data-add-filter]').click()
  await page.locator(`[data-filter-menu="axis-${V}"]`).click()
  await page.locator(`[data-filter-option="axis-${V}-${Bk}"]`).click()
  const chip = page.locator('[data-filter-chip="axis"]')
  await chip.waitFor({ timeout: 8000 })
  check(/View: Back/.test(await chip.innerText()), `chip "${(await chip.innerText()).trim()}"`)
  check(/axis=/.test(page.url()), `URL carries axis param (${new URL(page.url()).search})`)
  await until(async () => (await cards.count()) === expected.length, 10000, `filtered gallery shows ${expected.length} cards`)
  check(JSON.stringify(await idsOf()) === JSON.stringify(expected), 'filtered gallery = exactly the View=Back images')
  await shot('14-gallery-axis')

  // detail prev/next stays within the filter
  await cards.first().click()
  await page.locator('[data-image-detail]').waitFor({ timeout: 10000 })
  const curId = () => Number(new URL(page.url()).pathname.match(/\/gallery\/(\d+)/)?.[1])
  const seen = new Set([curId()])
  let bad = false
  for (const key of ['ArrowRight', 'ArrowLeft']) {
    for (let i = 0; i < expected.length + 2; i++) {
      const before = curId()
      await page.keyboard.press(key)
      await sleep(900)
      const now = curId()
      if (now === before) break
      seen.add(now)
      if (!expected.includes(now)) bad = true
    }
  }
  check(!bad && [...seen].every((i) => expected.includes(i)), `detail prev/next stayed in the filter (visited ${[...seen]})`)
  check(seen.size === expected.length, `prev/next reached all ${expected.length} filtered images (${seen.size})`)
  check(/axis=/.test(page.url()), 'detail URL keeps the axis filter')
  await shot('14-detail')

  await page.goto(`${BASE}/gallery?axis=${V}:${Bk}`, { waitUntil: 'networkidle' })
  await page.locator('[data-filter-chip="axis"]').waitFor({ timeout: 8000 })
  await page.locator('[data-filter-chip="axis"] button').click()
  await until(async () => (await page.locator('[data-filter-chip="axis"]').count()) === 0, 5000, 'chip removed')
  await until(async () => (await cards.count()) > expected.length, 10000, 'unfiltered gallery restored')
  check(!/axis=/.test(page.url()), 'axis param removed from URL')
  check((await cards.count()) > expected.length, `removing the chip restores the gallery (${await cards.count()} cards, was ${unfilteredCount})`)
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('14-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
// Nested areas, fragment areas, item variables, preset images (steps 15-19)
const entriesOf = (raw) => {
  const v = json(raw)
  return Array.isArray(v) ? v.map((e) => (typeof e === 'number' ? { id: e } : e)) : []
}
const presetRow = (name) => q1('select * from outfit_presets where name = ?', name)
const areaChip2 = (scope, name) =>
  scope.locator('[data-area-chip]').filter({ hasText: new RegExp(`^${name}$`) })
let teeId, redId, whiteId

step = '15' // A. nested body areas
try {
  const Top = areaId('Top'), Arms = areaId('Arms')
  check(
    ['Neck', 'Chest', 'Arms'].every((n) => q1('select parent_id p from library_areas where name = ?', n)?.p === Top),
    'migration seeded Neck / Chest / Arms under Top (DB)',
  )
  await open('/characters?tab=axes')
  await page.locator('[data-areas-entry]').click()
  await page.locator('[data-areas-editor]').waitFor({ timeout: 8000 })
  check((await page.locator('[data-area-child]').count()) === 3, 'tree shows 3 indented child rows under Top')
  await shot('15-areas-tree')

  // Top has children: it cannot become a child itself
  const rowOf = (name) => page.locator('[data-area-row]').filter({ hasText: name }).first()
  await rowOf('Top').hover()
  await rowOf('Top').locator('[data-area-menu]').click()
  await page.locator('[data-set-parent]').click()
  const optBottom = page.locator(`[data-parent-option="${areaId('Bottom')}"]`)
  await optBottom.waitFor({ timeout: 4000 })
  check((await optBottom.getAttribute('data-disabled')) !== null, 'Set parent: an area with children cannot get a parent (option disabled)')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // add two areas, make Cap a child of Hat
  await page.getByRole('button', { name: 'Add area' }).click()
  const ai = page.getByRole('textbox', { name: 'Add area' })
  await ai.fill('Smoke Hat')
  await ai.press('Enter')
  await until(() => !!areaId('Smoke Hat'), 6000, 'Smoke Hat created')
  await ai.fill('Smoke Cap')
  await ai.press('Enter')
  await until(() => !!areaId('Smoke Cap'), 6000, 'Smoke Cap created')
  await page.keyboard.press('Escape')
  await rowOf('Smoke Cap').hover()
  await rowOf('Smoke Cap').locator('[data-area-menu]').click()
  await page.locator('[data-set-parent]').click()
  await page.locator(`[data-parent-option="${areaId('Smoke Hat')}"]`).click()
  await until(() => q1('select parent_id p from library_areas where name = ?', 'Smoke Cap')?.p === areaId('Smoke Hat'), 6000, 'Cap parent saved')
  check(true, 'Set parent: Smoke Cap is now a child of Smoke Hat (DB)')
  await until(async () => (await page.locator('[data-area-child]').count()) === 4, 6000, '4 child rows')
  // a child cannot be a parent target
  await rowOf('Smoke Hat').hover()
  await rowOf('Smoke Hat').locator('[data-area-menu]').click()
  await page.locator('[data-set-parent]').click()
  const optHatUnderCap = page.locator(`[data-parent-option="${areaId('Smoke Cap')}"]`)
  check(
    !(await optHatUnderCap.count()) || (await optHatUnderCap.getAttribute('data-disabled')) !== null,
    'a child (Smoke Cap) is not offered as a parent',
  )
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  // delete the parent -> child becomes top-level
  await rowOf('Smoke Hat').getByRole('button', { name: 'Delete area' }).click({ force: true })
  const dlg = page.getByRole('alertdialog')
  await dlg.waitFor()
  await dlg.getByRole('button', { name: 'Delete', exact: true }).click()
  await until(() => !areaId('Smoke Hat'), 6000, 'Smoke Hat deleted')
  await dlg.waitFor({ state: 'hidden', timeout: 6000 })
  await sleep(600)
  check(
    q1('select parent_id p from library_areas where name = ?', 'Smoke Cap')?.p === null,
    'deleting the parent: its child becomes top-level (parent_id NULL)',
  )
  await rowOf('Smoke Cap').getByRole('button', { name: 'Delete area' }).click({ force: true })
  await dlg.waitFor()
  await dlg.getByRole('button', { name: 'Delete', exact: true }).click()
  await until(() => !areaId('Smoke Cap'), 6000, 'Smoke Cap deleted')
  check(true, 'cleanup: Smoke Cap deleted')
  void Arms
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('15-error').catch(() => {})
}

step = '16' // B. fragment areas + a jacket rule that covers only Arms
try {
  const Top = areaId('Top'), Arms = areaId('Arms')
  await open(`/characters?tab=outfits&id=${shirtId}`)
  const sleeves = await addFragment('shirt_sleeves')
  await sleeves.locator('[data-fragment-areas]').click()
  const pop = page.locator(POP).last()
  await pop.waitFor()
  check(
    (await pop.locator('[data-area-child]').count()) >= 3 && (await pop.locator(`[data-area-group="${Top}"] [data-area-chip]`).count()) === 4,
    'fragment area picker groups Neck / Chest / Arms under Top',
  )
  await shot('16-fragment-area-picker')
  await areaChip2(pop, 'Arms').click()
  await until(
    () => q1(`select area_ids a from fragments where item_id = ? and text = 'shirt_sleeves'`, shirtId)?.a === JSON.stringify([Arms]),
    6000,
    'sleeves fragment area_ids = [Arms]',
  )
  check(true, 'fragment "shirt_sleeves" has own area Arms (DB); shirt_white keeps []')
  await page.keyboard.press('Escape')
  const labels = await page.locator('[data-fragment-areas]').evaluateAll((els) => els.map((e) => e.textContent.trim()))
  check(labels[0] === 'Areas: inherits item' && labels[1] === 'Areas: Arms', `fragment area buttons: ${JSON.stringify(labels)}`)
  await shot('16-fragment-areas')

  // jacket: 3rd rule "Zipper Open -> Arms"
  await open(`/characters?tab=outfits&id=${jacketId}`)
  const rules = page.locator('[data-cover-rule]')
  await rules.first().waitFor({ timeout: 8000 })
  await page.locator('[data-add-rule]').click()
  await until(async () => (await rules.count()) === 3, 5000, 'third rule added')
  await setCondition(rules.nth(2).getByRole('button', { name: 'Condition' }), ['Open'])
  await areaChip2(rules.nth(2), 'Arms').click()
  const zipAxis = q1('select id from library_axes where name = ? and owner_item_id = ?', 'Zipper', jacketId).id
  const zipOpen = q1('select id from library_axis_values where axis_id = ? and name = ?', zipAxis, 'Open').id
  const r3 = await until(
    () => {
      const r = json(itemRow(jacketId)?.cover_rules)
      return r.length === 3 && JSON.stringify(r[2]) === JSON.stringify({ conditions: { [zipAxis]: [zipOpen] }, areaIds: [Arms] }) ? r : null
    },
    8000,
    'third rule saved',
  )
  check(!!r3, 'jacket rule 3: Zipper Open -> Arms (DB)')
  check(
    (await rules.nth(2).locator('[data-area-child]').count()) === 3,
    'rule area chips show the 3 children grouped under Top',
  )
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('16-error').catch(() => {})
}

step = '17' // C. scene Parts: partly covered + parent cover
try {
  await open(`/workspace/${PROJECT2}?scene=${S2}`)
  await rail().first().waitFor({ timeout: 15000 })
  await ensurePartsOpen()
  await expandChar()
  await segBtn(sceneRow(), 'View', 'Front').click()
  await segBtn(charRow2(), 'Zipper', 'Open').click()
  await previewMatches(
    (s) => s.includes('shirt_white') && !s.includes('shirt_sleeves') && s.includes('jacket_'),
    'Front + Zipper Open -> shirt_white stays, shirt_sleeves gone',
  )
  check(true, 'Zipper Open (jacket covers Arms): shirt base stays, sleeves fragment gone')
  await until(async () => (await charRow2().locator('[data-partly-covered-badge]').count()) === 1, 5000, 'Partly covered badge')
  check((await charRow2().locator('[data-covered-badge]').count()) === 0, 'no full "Covered" badge while only partly covered')
  await charRow2().locator('[data-partly-covered-badge]').hover()
  const tip = await page.locator('[data-partly-covered-tip]').first().innerText({ timeout: 4000 }).catch(() => '')
  check(/shirt_sleeves/.test(tip) && /Smoke Jacket/.test(tip), `Partly covered tooltip lists fragment + coverer ("${tip.replace(/\s+/g, ' ').trim()}")`)
  await shot('17-partly-covered')
  await page.mouse.move(5, 5)

  await segBtn(charRow2(), 'Zipper', 'Closed').click()
  await previewMatches(
    (s) => !s.includes('shirt_white') && !s.includes('shirt_sleeves'),
    'Zipper Closed (Top covers its children) -> shirt fully hidden',
  )
  await until(async () => (await charRow2().locator('[data-covered-badge]').count()) === 1, 5000, 'full Covered badge')
  check((await charRow2().locator('[data-partly-covered-badge]').count()) === 0, 'Closed: parent cover hides the whole shirt ("Covered", not "Partly")')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('17-error').catch(() => {})
}

step = '18' // D. item variables + presets with variable values
try {
  await open('/characters?tab=outfits')
  await newEntry('Smoke Tee')
  teeId = q1(`select id from outfit_items where name = 'Smoke Tee'`)?.id
  check(!!teeId, 'outfit item "Smoke Tee" created')
  await page.getByRole('button', { name: 'Add variable' }).click()
  const vi = page.getByRole('textbox', { name: 'Add variable' })
  await vi.fill('color')
  await vi.press('Enter')
  await until(() => json(q1('select variables v from outfit_items where id = ?', teeId)?.v).length === 1, 6000, 'variable saved')
  const vrow = page.locator('[data-variable-row="color"]')
  await vrow.locator('[data-variable-default]').fill('white')
  await vrow.locator('[data-variable-default]').press('Enter')
  await until(() => json(q1('select variables v from outfit_items where id = ?', teeId)?.v)[0]?.default === 'white', 6000, 'default saved')
  check(true, 'variable color (default white) saved on the item (DB)')

  const f1 = await addFragment('@{var:color} tee')
  check((await f1.locator('.cm-var-highlight').count()) === 1, 'known @{var:color} is highlighted in the fragment editor')
  const f2 = await addFragment('@{var:nope} x')
  check((await f2.locator('.cm-invalid-ref-highlight').count()) >= 1, 'unknown @{var:nope} is flagged')
  await f2.getByRole('button', { name: 'Delete fragment' }).click({ force: true })
  await until(async () => (await page.locator('[data-fragment-row]').count()) === 1, 5000, 'temp fragment removed')
  await until(async () => (await previewOut().innerText()).trim() === 'white tee', 6000, 'preview "white tee"')
  check(true, 'item preview substitutes the default: "white tee"')
  await shot('18-item-variables')

  // autocomplete offers the item's variable names
  await f1.locator('.cm-content').click()
  await page.keyboard.press('End')
  await page.keyboard.type(', @{va', { delay: 25 })
  const opt = page.locator('.cm-tooltip-autocomplete li').filter({ hasText: 'var:color' }).first()
  check(await opt.waitFor({ timeout: 4000 }).then(() => true).catch(() => false), 'autocomplete offers var:color after "@{va"')
  await page.keyboard.press('Escape')
  // undo the typed text (select all + retype) so the fragment stays clean
  await page.keyboard.press('Control+A')
  await page.keyboard.type('@{var:color} tee', { delay: 12 })
  await page.keyboard.press('Escape')
  await sleep(1200)

  // rename keeps the fragment tokens in sync
  await vrow.locator('[data-inline-name]').click()
  const rn = vrow.locator('[data-inline-name-input]')
  await rn.fill('colour')
  await rn.press('Enter')
  await until(() => json(q1('select variables v from outfit_items where id = ?', teeId)?.v)[0]?.name === 'colour', 6000, 'renamed')
  const ft = await until(
    () => {
      const t = q1(`select text from fragments where item_id = ?`, teeId)?.text
      return t === '@{var:colour} tee' ? t : null
    },
    6000,
    'fragment token rewritten',
  )
  check(!!ft, 'rename color -> colour rewrote the fragment token (DB)')
  await until(async () => (await f1.locator('.cm-content').innerText()).includes('colour'), 6000, 'editor follows the rewrite')
  await until(async () => (await previewOut().innerText()).trim() === 'white tee', 6000, 'preview still "white tee"')
  check(true, 'editor + preview follow the rename (white tee)')

  // presets A (red) / B (white = default)
  await open('/characters?tab=presets')
  for (const name of ['Smoke Red', 'Smoke White']) {
    await page.keyboard.press('Escape')
    await sleep(700)
    await newEntry(name)
    await page.getByRole('button', { name: 'Add item' }).click()
    await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Tee' }).first().click()
    await until(() => entriesOf(presetRow(name)?.item_ids).length === 1, 6000, `${name} has the tee`)
    if (name === 'Smoke Red') {
      const vin = page.locator('[data-outfit-var="colour"]')
      await vin.waitFor({ timeout: 6000 })
      await vin.fill('red')
      await vin.press('Enter')
      await until(() => entriesOf(presetRow(name)?.item_ids)[0]?.vars?.colour === 'red', 6000, 'red saved')
      await shot('18-preset-vars')
    }
  }
  redId = presetRow('Smoke Red').id
  whiteId = presetRow('Smoke White').id
  check(
    JSON.stringify(entriesOf(presetRow('Smoke Red').item_ids)) === JSON.stringify([{ id: teeId, vars: { colour: 'red' } }]) &&
      JSON.stringify(entriesOf(presetRow('Smoke White').item_ids)) === JSON.stringify([{ id: teeId }]),
    'presets: Smoke Red = [tee colour=red], Smoke White = [tee] (DB)',
  )

  // workspace: slot default outfit variable input
  await open(`/workspace/${PROJECT2}`)
  await page.getByRole('tab', { name: /^Chars/ }).click()
  const slotP2 = q1('select * from characters where project_id = ? order by slot_index limit 1', PROJECT2)
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Tee' }).first().click()
  const gin = page.locator('[data-outfit-var="colour"]')
  await gin.waitFor({ timeout: 8000 })
  check((await gin.getAttribute('placeholder')) === 'white', 'slot outfit variable input shows the default as placeholder')
  await gin.fill('green')
  await gin.press('Enter')
  await until(() => entriesOf(q1('select outfit_item_ids o from characters where id = ?', slotP2.id).o).some((e) => e.id === teeId && e.vars?.colour === 'green'), 8000, 'slot var saved')
  check(true, 'slot default outfit entry keeps colour=green (DB)')
  await page.getByRole('button', { name: 'Remove Smoke Tee' }).click({ force: true })
  await until(() => !entriesOf(q1('select outfit_item_ids o from characters where id = ?', slotP2.id).o).some((e) => e.id === teeId), 8000, 'tee removed from slot')
  check(true, 'tee removed again from the slot default')

  // scene "replace for this scene": load preset Red / White, edit the value
  await open(`/workspace/${PROJECT2}?scene=${S2}`)
  await ensurePartsOpen()
  await expandChar()
  await charRow2().getByRole('radio', { name: 'Replace for this scene' }).click()
  await charRow2().getByRole('button', { name: 'Load preset' }).click()
  await page.getByRole('menuitem', { name: 'Smoke Red' }).click()
  const ovOutfit = () => entriesOf(q1('select outfit_item_ids o from character_scene_overrides where project_scene_id = ? and character_id = ?', S2, slotP2.id)?.o)
  await until(() => ovOutfit().length === 1 && ovOutfit()[0].vars?.colour === 'red', 8000, 'override outfit = [tee red]')
  check(true, 'Load preset "Smoke Red" copies its entries incl. values into the scene override (DB)')
  await previewMatches((s) => s.includes('red tee'), 'preview "red tee"')
  const sin = charRow2().locator('[data-outfit-var="colour"]')
  await sin.fill('blue')
  await sin.press('Enter')
  await previewMatches((s) => s.includes('blue tee') && !s.includes('red tee'), 'preview "blue tee"')
  check(true, 'scene override value edit -> preview "blue tee"')
  await shot('18-scene-vars')
  await charRow2().getByRole('button', { name: 'Load preset' }).click()
  await page.getByRole('menuitem', { name: 'Smoke White' }).click()
  await previewMatches((s) => s.includes('white tee') && !s.includes('blue tee'), 'preview "white tee"')
  check(true, 'preset A red / B white: loading Smoke White -> "white tee"')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('18-error').catch(() => {})
}

step = '19' // E. preset <-> images, gallery preset chip
const genOn = async (sceneId, n) => {
  await open(`/workspace/${PROJECT2}?scene=${sceneId}`)
  const inputs = page.locator('[title="Images to generate"] input')
  await inputs.first().waitFor({ timeout: 15000 })
  const cnt = await inputs.count()
  for (let i = 0; i < cnt; i++) {
    const rowScene = await inputs.nth(i).evaluate((el) => el.closest('[data-scene-id]')?.getAttribute('data-scene-id') ?? null)
    const want = rowScene === String(sceneId) ? n : 0
    const input = inputs.nth(i)
    if ((await input.inputValue()) === String(want)) continue
    await input.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type(String(want))
    await page.keyboard.press('Enter')
    await sleep(120)
  }
  const jobBase = q1('select coalesce(max(id),0) m from generation_jobs').m
  await page.getByRole('button', { name: new RegExp(`^Generate ${n}$`) }).first().click()
  const job = await until(() => q1('select * from generation_jobs where id > ? and project_scene_id = ?', jobBase, sceneId), 10000, 'job created')
  if (!job) return []
  await until(() => q1('select status s from generation_jobs where id = ?', job.id).s === 'completed', 40000, 'job completed')
  return q('select id from generated_images where job_id = ? order by id', job.id).map((r) => r.id)
}
const presetLinks = (imageId) => q("select ref_id from image_library_links where image_id = ? and kind = 'preset' order by ref_id", imageId).map((r) => r.ref_id)
let redImgs = [], whiteImgs = []
try {
  const slotP2 = q1('select * from characters where project_id = ? order by slot_index limit 1', PROJECT2)
  const setOverrideValue = async (preset, value) => {
    await open(`/workspace/${PROJECT2}?scene=${S2}`)
    await ensurePartsOpen()
    await expandChar()
    await charRow2().getByRole('button', { name: 'Load preset' }).click()
    await page.getByRole('menuitem', { name: preset }).click()
    if (value) {
      const sin = charRow2().locator('[data-outfit-var="colour"]')
      await sin.fill(value)
      await sin.press('Enter')
    }
    await sleep(1200)
  }
  // currently: override = [tee] (Smoke White entries)
  whiteImgs = await genOn(S2, 1)
  check(whiteImgs.length === 1 && JSON.stringify(presetLinks(whiteImgs[0])) === JSON.stringify([whiteId]), `image generated with the white outfit links only "Smoke White" (${JSON.stringify(presetLinks(whiteImgs[0]))})`)
  await setOverrideValue('Smoke Red')
  redImgs = await genOn(S2, 1)
  check(redImgs.length === 1 && JSON.stringify(presetLinks(redImgs[0])) === JSON.stringify([redId]), `image generated with the red outfit links only "Smoke Red" (${JSON.stringify(presetLinks(redImgs[0]))})`)
  await setOverrideValue('Smoke Red', 'blue')
  const blueImgs = await genOn(S2, 1)
  check(blueImgs.length === 1 && presetLinks(blueImgs[0]).length === 0, 'a value matching no preset (blue) links no preset')
  check(
    q1("select count(*) c from image_library_links where kind = 'item' and ref_id = ?", teeId).c === 3,
    'the tee item is linked to all 3 images',
  )

  // library Presets tab: images section + thumbnail
  await open(`/characters?tab=presets&id=${redId}`)
  const sec = page.locator('[data-library-images]')
  await sec.waitFor({ timeout: 10000 })
  check(/Images \(1\)/.test(await sec.innerText()), 'preset detail shows "Images (1)"')
  await sec.locator(`[data-library-image="${redImgs[0]}"]`).waitFor({ timeout: 8000 })
  await sec.locator(`[data-set-thumbnail="${redImgs[0]}"]`).click({ force: true })
  await until(() => q1('select thumbnail_image_id t from outfit_presets where id = ?', redId)?.t === redImgs[0], 6000, 'preset thumbnail pinned')
  check(true, 'pinning an image sets outfit_presets.thumbnail_image_id (DB)')
  const listImg = page.locator('[data-list-row]').filter({ hasText: 'Smoke Red' }).locator('img')
  check(await listImg.first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false), 'preset list row shows the thumbnail')
  await shot('19-preset-images')

  // open the image from the library: overlay keeps the preset context
  await sec.locator(`[data-library-image="${redImgs[0]}"]`).click()
  await page.locator('[data-detail-library-thumb]').waitFor({ timeout: 10000 })
  check(/detailPreset=/.test(page.url()), 'overlay opened with detailPreset in the URL')
  await page.keyboard.press('Escape')
  await sleep(500)

  await page.locator('[data-view-in-gallery]').click()
  await page.waitForURL(/\/gallery\?.*outfitPreset=/, { timeout: 8000 })
  const chip = page.locator('[data-filter-chip="outfit-preset"]')
  await chip.waitFor({ timeout: 8000 })
  check(/Preset: Smoke Red/.test(await chip.innerText()), `gallery chip "${(await chip.innerText()).trim()}"`)
  const cards = page.locator('[data-gallery-grid] a[href^="/gallery/"]')
  await until(async () => (await cards.count()) === 1, 10000, 'gallery shows 1 card')
  check(
    (await cards.first().getAttribute('href')).includes(`/gallery/${redImgs[0]}`),
    'preset filter shows exactly the red image',
  )
  await shot('19-gallery-preset')
  await chip.locator('button').click()
  await until(async () => (await cards.count()) > 1, 10000, 'chip removed')
  check(!/outfitPreset=/.test(page.url()), 'removing the chip drops the param')

  // reset thumbnail, then delete a preset: links go away
  await open(`/characters?tab=presets&id=${redId}`)
  await page.locator('[data-reset-thumbnail]').click()
  await until(() => q1('select thumbnail_image_id t from outfit_presets where id = ?', redId)?.t === null, 6000, 'thumbnail reset')
  check(true, 'reset thumbnail clears thumbnail_image_id')
  await open(`/characters?tab=presets&id=${whiteId}`)
  const wrow = page.locator('[data-list-row]').filter({ hasText: 'Smoke White' }).first()
  await wrow.waitFor({ timeout: 8000 })
  await wrow.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const dd = page.getByRole('alertdialog')
  await dd.waitFor()
  await dd.getByRole('button', { name: 'Delete', exact: true }).click()
  await until(() => !presetRow('Smoke White'), 6000, 'preset deleted')
  check(
    q1("select count(*) c from image_library_links where kind = 'preset' and ref_id = ?", whiteId).c === 0,
    'deleting a preset removes its image links',
  )
  // image delete clears a pinned preset thumbnail (server rule)
  check(
    q1('select count(*) c from outfit_presets where thumbnail_image_id is not null and thumbnail_image_id not in (select id from generated_images)').c === 0,
    'no preset thumbnail points to a missing image',
  )

  // restore the scene to the slot's default outfit (later smokes expect it)
  await open(`/workspace/${PROJECT2}?scene=${S2}`)
  await ensurePartsOpen()
  await expandChar()
  await charRow2().getByRole('radio', { name: 'Default outfit' }).click()
  await until(
    () => q1('select outfit_item_ids o from character_scene_overrides where project_scene_id = ? and character_id = ?', S2, slotP2.id)?.o === null,
    8000,
    'scene override outfit reset to default',
  )
  check(true, 'scene override outfit reset to the slot default')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('19-error').catch(() => {})
}

// ═════════════════════════════════════════════════════════════════════════════
step = '20' // empty-item indicators: library combination grid + scene Parts
let scarfId, capId, muteId
const cell = (label) => page.locator(`[data-combo-cell][aria-label="${label}"]`)
try {
  // A. library: one referenced global axis -> a single row
  await open('/characters?tab=outfits')
  await newEntry('Smoke Scarf')
  scarfId = q1(`select id from outfit_items where name = 'Smoke Scarf'`)?.id
  check(!!scarfId, 'outfit item "Smoke Scarf" created')
  check((await page.locator('[data-combo-grid]').count()) === 0, 'no combination grid while no condition references a global axis')
  const sRow = await addFragment('scarf_front')
  await setCondition(sRow.getByRole('button', { name: 'Condition' }), ['Front', 'Side'])
  await page.locator('[data-combo-grid]').waitFor({ timeout: 8000 })
  check((await page.locator('[data-combo-cell]').count()) === 3, 'one axis (View): single row of 3 cells')
  check(
    (await cell('Front: OK').count()) === 1 &&
      (await cell('Side: OK').count()) === 1 &&
      (await cell('Back: Empty').count()) === 1,
    'Front/Side cells filled, Back cell empty',
  )
  check(
    (await cell('Back: Empty').getAttribute('data-empty')) !== null &&
      /Empty/.test(await cell('Back: Empty').innerText()),
    'empty cell shows "– Empty"',
  )
  check((await cell('Front: OK').getAttribute('data-current')) !== null, 'cell matching the current preview (Front) is highlighted')
  await cell('Back: Empty').click()
  const emptyTxt = await until(
    async () => {
      const s = (await page.locator('[data-preview-empty]').innerText().catch(() => '')).trim()
      return /Back/.test(s) ? s : null
    },
    5000,
    'preview empty text names Back',
  )
  check(/This item is empty for Back/.test(emptyTxt ?? ''), `clicking the Back cell sets the preview: "${emptyTxt}"`)
  check((await cell('Back: Empty').getAttribute('data-current')) !== null, 'Back cell now highlighted')

  // B. second axis referenced -> 2D, updates live
  const sRow2 = await addFragment('scarf_upper')
  await setCondition(sRow2.getByRole('button', { name: 'Condition' }), ['Upper body'])
  await until(async () => (await page.locator('[data-combo-cell]').count()) === 9, 8000, '3x3 grid')
  check(true, 'two axes (View x Framing): 3x3 grid appears live')
  check(
    (await cell('Front · Full body: OK').count()) === 1 &&
      (await cell('Back · Upper body: OK').count()) === 1 &&
      (await cell('Back · Full body: Empty').count()) === 1 &&
      (await cell('Back · Face: Empty').count()) === 1,
    'cells: Front/Full ok, Back/Upper ok (2nd fragment), Back/Full + Back/Face empty',
  )
  await cell('Back · Face: Empty').click()
  const t2 = await until(
    async () => {
      const s = (await page.locator('[data-preview-empty]').innerText().catch(() => '')).trim()
      return /Back · Face/.test(s) ? s : null
    },
    5000,
    'preview empty names Back · Face',
  )
  check(!!t2, `empty text names both axes: "${t2}"`)
  await shot('20-grid')

  // C. item condition counts: Cap only in Full/Upper body
  await newEntry('Smoke Cap')
  capId = q1(`select id from outfit_items where name = 'Smoke Cap'`)?.id
  await setCondition(page.getByRole('button', { name: 'Condition' }).first(), ['Full body', 'Upper body'])
  await addFragment('cap_a')
  await page.locator('[data-combo-grid]').waitFor({ timeout: 8000 })
  check(
    (await cell('Full body: OK').count()) === 1 && (await cell('Face: Empty').count()) === 1,
    'item condition (Framing != Face) makes the Face cell empty',
  )

  // D. a character (Hana): conditions reference View only; nothing empty
  await open(`/characters?tab=characters&id=${hanaId}`)
  await page.locator('[data-combo-grid]').waitFor({ timeout: 8000 })
  check(
    (await page.locator('[data-combo-cell]').count()) === 3 && (await page.locator('[data-combo-cell][data-empty]').count()) === 0,
    'character grid: View row, every cell filled',
  )

  // E. scene Parts (project 2, slot default outfit = [Shirt, Jacket])
  await open(`/workspace/${PROJECT2}?scene=${S2}`)
  await ensurePartsOpen()
  await expandChar()
  const resetBtn = charRow2().getByRole('button', { name: 'Reset to defaults' })
  if (await resetBtn.isEnabled()) await resetBtn.click()
  const infoBox = () => page.locator('[data-testid="parts-empty-info"]')
  const emptyBadges = () => charRow2().locator('[data-empty-badge]')
  await segBtn(sceneRow(), 'View', 'Back').click()
  await segBtn(sceneRow(), 'Framing', 'Face').click()
  await until(async () => (await emptyBadges().count()) === 1, 8000, 'Empty badge on default-outfit chip at Face')
  const chipTxt = await emptyBadges().first().evaluate((el) => el.parentElement.innerText)
  check(/Smoke Jacket/.test(chipTxt) && (await charRow2().locator('[data-covered-badge]').count()) === 0, `Face: default-outfit chip "Smoke Jacket" has the Empty badge (item condition) -> "${chipTxt.replace(/\s+/g, ' ')}"`)
  const infoTxt = await infoBox().innerText()
  check(/Smoke Jacket — empty in this scene \(Back · Face\)/.test(infoTxt), `info line above the preview: "${infoTxt.trim()}"`)

  // F. Back + Full body + Zipper Closed: shirt covered (Covered, not Empty), nothing empty
  await segBtn(sceneRow(), 'Framing', 'Full body').click()
  await segBtn(charRow2(), 'Zipper', 'Closed').click()
  await until(async () => (await charRow2().locator('[data-covered-badge]').count()) === 1, 8000, 'Covered badge')
  check(
    (await emptyBadges().count()) === 0 && (await infoBox().count()) === 0,
    'covered shirt shows Covered, not Empty; no info line',
  )

  // G. replace outfit [Shirt, Jacket, Scarf]: scarf empty at Back/Full body, shirt still just Covered
  await charRow2().getByRole('radio', { name: 'Replace for this scene' }).click()
  await charRow2().getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Scarf' }).first().click()
  await until(async () => (await emptyBadges().count()) === 1, 8000, 'Empty badge on the scarf chip')
  const sc = await emptyBadges().first().evaluate((el) => el.parentElement.parentElement.innerText)
  check(/Smoke Scarf/.test(sc), 'only the scarf chip is Empty (editor chips)')
  check(
    (await charRow2().locator('[data-covered-badge]').count()) === 1 &&
      /Smoke Scarf — empty in this scene \(Back · Full body\)/.test(await infoBox().innerText()),
    'shirt keeps Covered; info line names the scarf with the scene values',
  )
  await emptyBadges().first().hover()
  const tip2 = await page.getByRole('tooltip').first().innerText({ timeout: 4000 }).catch(() => '')
  check(/No fragments in this scene \(Back · Full body\)/.test(tip2), `Empty badge tooltip: "${tip2.trim()}"`)
  await page.mouse.move(5, 5)
  await shot('20-scene-empty')

  // H. every worn item empty at Face -> one line, no badges
  for (const n of ['Smoke Shirt', 'Smoke Scarf']) await charRow2().getByRole('button', { name: `Remove ${n}` }).click()
  await charRow2().getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Cap' }).first().click()
  await segBtn(sceneRow(), 'Framing', 'Face').click()
  await until(async () => /entirely empty/.test(await infoBox().innerText().catch(() => '')), 8000, 'single "entirely empty" line')
  check(
    (await emptyBadges().count()) === 0 && (await infoBox().locator('[data-empty-line]').count()) === 1,
    'Face + [Jacket, Cap] all empty: one line, no per-item badges',
  )
  check(/outfit is entirely empty in this scene/.test(await infoBox().innerText()), `single line: "${(await infoBox().innerText()).trim()}"`)
  await shot('20-scene-all-empty')
  await charRow2().getByRole('button', { name: 'Reset to defaults' }).click()
  await until(
    () => q1('select outfit_item_ids o from character_scene_overrides where project_scene_id = ? and character_id = ?', S2, q1('select id from characters where project_id = ? order by slot_index limit 1', PROJECT2).id)?.o === null,
    8000,
    'scene outfit override reset',
  )

  // I. library character with no matching fragment: slot linked to "Smoke Mute" (fragment only for View Front)
  await open('/characters')
  await newEntry('Smoke Mute')
  muteId = q1(`select id from library_characters where name = 'Smoke Mute'`)?.id
  const mRow = await addFragment('mute_front')
  await setCondition(mRow.getByRole('button', { name: 'Condition' }), ['Front'])
  await open(`/workspace/${PROJECT2}?scene=${S2}`)
  const slotM = q1('select * from characters where project_id = ? order by slot_index limit 1', PROJECT2)
  await page.getByRole('tab', { name: /^Chars/ }).click()
  await page.locator('[data-library-character-select]').click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Mute' }).first().click()
  await until(() => q1('select library_character_id l from characters where id = ?', slotM.id).l === muteId, 8000, 'slot linked to Smoke Mute')
  await open(`/workspace/${PROJECT2}?scene=${S2}`)
  await ensurePartsOpen()
  await until(async () => /no character fragments in this scene/.test(await infoBox().innerText().catch(() => '')), 10000, 'character-empty line')
  check(true, `character with no matching fragment: "${(await infoBox().innerText()).trim().split('\n')[0]}"`)
  // restore the link to Hana
  await page.getByRole('tab', { name: /^Chars/ }).click()
  await page.locator('[data-library-character-select]').click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Hana' }).first().click()
  await until(() => q1('select library_character_id l from characters where id = ?', slotM.id).l === hanaId, 8000, 'slot relinked to Hana')
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
  await shot('20-error').catch(() => {})
}

step = 'm'
try {
  const mp = await newPage(390, 844)
  tag = 'm-'
  await open(`/characters?tab=characters&id=${hanaId}`, mp)
  await mp.locator('[data-preview-output]').waitFor({ timeout: 10000 })
  await shot('library-detail', mp)
  await open('/characters?tab=outfits', mp)
  await shot('library-list', mp)
  await open(`/workspace/${PROJECT}?scene=${A}`, mp)
  await sleep(1500)
  await shot('workspace', mp)
  await open('/characters?tab=axes&areas=true', mp)
  await mp.locator('[data-areas-editor]').waitFor({ timeout: 10000 })
  await shot('areas', mp)
  await open('/characters?tab=outfits&id=' + jacketId, mp)
  await mp.locator('[data-cover-rules]').waitFor({ timeout: 10000 })
  await shot('jacket-rules', mp)
  await open('/characters?tab=characters&id=' + hanaId, mp)
  await mp.locator('[data-library-images]').waitFor({ timeout: 10000 })
  await shot('library-images', mp)
  await open('/gallery?axis=' + axisId('View') + ':' + valueId('View', 'Back'), mp)
  await mp.locator('[data-filter-chip="axis"]').waitFor({ timeout: 10000 })
  await shot('gallery-axis', mp)
  await open('/characters?tab=axes&areas=true', mp)
  await mp.locator('[data-area-child]').first().waitFor({ timeout: 10000 })
  await shot('areas-tree', mp)
  await open('/characters?tab=outfits&id=' + shirtId, mp)
  await mp.locator('[data-fragment-areas]').first().waitFor({ timeout: 10000 })
  await mp.locator('[data-fragment-areas]').nth(1).click()
  await mp.locator(POP).last().waitFor({ timeout: 5000 })
  await shot('fragment-areas', mp)
  await mp.keyboard.press('Escape')
  await open('/characters?tab=outfits&id=' + teeId, mp)
  await mp.locator('[data-item-variables]').waitFor({ timeout: 10000 })
  await shot('item-variables', mp)
  await open('/characters?tab=presets&id=' + redId, mp)
  await mp.locator('[data-outfit-var="colour"]').waitFor({ timeout: 10000 })
  await shot('preset-vars', mp)
  await mp.locator('[data-library-images]').scrollIntoViewIfNeeded()
  await shot('preset-images', mp)
  await open('/gallery?outfitPreset=' + redId, mp)
  await mp.locator('[data-filter-chip="outfit-preset"]').waitFor({ timeout: 10000 })
  await shot('gallery-preset', mp)
  await open('/characters?tab=outfits&id=' + scarfId, mp)
  await mp.locator('[data-combo-grid]').waitFor({ timeout: 10000 })
  await mp.locator('[data-combo-grid]').scrollIntoViewIfNeeded()
  await shot('20-grid', mp)
  check(
    await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    '390px: combination grid causes no page horizontal scroll',
  )
  await open(`/workspace/${PROJECT2}?scene=${S2}`, mp)
  await sleep(1500)
  await mp.getByRole('tab', { name: 'Result' }).click().catch(() => {})
  const mParts = mp.locator('[data-testid="scene-parts"]')
  const mSec = mp.locator('[data-testid="scene-parts-section"] > button').first()
  if ((await mSec.getAttribute('aria-expanded')) !== 'true') await mSec.click()
  const mChar = mp.locator('[data-testid="parts-character"] > button').first()
  if ((await mChar.getAttribute('aria-expanded')) !== 'true') await mChar.click()
  await mParts.scrollIntoViewIfNeeded().catch(() => {})
  await mp.locator('[data-testid="parts-empty-info"]').scrollIntoViewIfNeeded()
  await sleep(500)
  await shot('20-scene-parts', mp)
  const kp = await newPage(390, 844)
  await kp.addInitScript(() => {
    try {
      localStorage.setItem('87studio-locale', 'ko')
    } catch {}
  })
  await open('/characters?tab=outfits&id=' + scarfId, kp)
  await kp.locator('[data-combo-cell][data-empty]').first().click()
  const koTxt = await kp.locator('[data-preview-empty]').innerText({ timeout: 5000 }).catch(() => '')
  check(/비어 있어요/.test(koTxt), `ko: "${koTxt.trim()}"`)
  check(true, '390px screenshots taken')
  tag = ''
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
}

// ── summary ──
step = 'end'
check(consoleErrors === 0, `no console/page errors (${consoleErrors})`)
console.log('\nSummary')
for (const [s, ok] of [...stepResults].sort())
  console.log(`  step ${s}: ${ok ? 'PASS' : 'FAIL'}`)
console.log(`${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'}`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
