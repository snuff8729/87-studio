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
  const inputs = page.locator('input[aria-label="Value"]')
  const idx = await until(async () => {
    const vals = await inputs.evaluateAll((els) => els.map((e) => e.value))
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
  await until(async () => /Nothing is included/.test(await prev()), 5000, 'jacket preview Framing Face = empty (item skipped)')
  check(/Nothing is included/.test(await previewOut().innerText()), 'empty preview shows the "nothing included" hint')
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
        json(q1('select item_ids from outfit_presets where id = ?', preset.id).item_ids),
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
      JSON.stringify(json(q1('select outfit_item_ids o from characters where id = ?', slot.id).o)) ===
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
  const newItems = json(s2.outfit_item_ids)
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
  const rows = page.locator('[data-area-row] input')
  const names = await rows.evaluateAll((els) => els.map((e) => e.value))
  check(
    names.join() === 'Top,Bottom,Outerwear,Shoes,Headwear,Accessory',
    `Body areas lists the 6 seeded areas: ${names.join()}`,
  )
  const nameInput = page.getByRole('textbox', { name: 'New area name' })
  await nameInput.fill('Smoke Area')
  await nameInput.press('Enter')
  await until(() => !!areaId('Smoke Area'), 6000, 'area "Smoke Area" created')
  await until(async () => (await rows.count()) === 7, 6000, 'UI shows 7 area rows')
  check(q('select id from library_areas').length === 7, 'area added (DB 7 rows)')
  const last = rows.nth(6)
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
  check(q('select id from library_areas').length === 6, 'area deleted (DB back to 6 rows)')
  await until(async () => (await rows.count()) === 6, 6000, 'UI back to 6 area rows')
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
    () => JSON.stringify(json(q1('select outfit_item_ids o from characters where id = ?', slot2.id).o)) === JSON.stringify([shirtId]),
    8000,
    'slot outfit = [shirt]',
  )
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.locator('[cmdk-item]').filter({ hasText: 'Smoke Jacket' }).first().click()
  await until(
    () => JSON.stringify(json(q1('select outfit_item_ids o from characters where id = ?', slot2.id).o)) === JSON.stringify([shirtId, jacketId]),
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
