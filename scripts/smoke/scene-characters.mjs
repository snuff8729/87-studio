// Scene characters smoke against a NAI_MOCK server, with REAL writes.
//
// Exercises: character appearance default (Chars tab: All scenes / Only
// selected scenes + "Appears in N scenes"), per-scene presence in the SceneView
// "Characters in this scene" section (Default / On / Off / Replace + Replace
// prompt editor), the bulk "Characters..." dialog from the selection header,
// and mock generation: the job's resolved prompts hold only the characters that
// are present, Replace text is used verbatim. Screenshots of the section at
// 1440 and 390. Reads the DB read-only.
//
// REFUSES to run unless the server shows the MOCK badge (NAI_MOCK=1) and the
// queue is idle.
//
// Usage (throwaway data, dev server, from the repo root):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-cast
//   NAI_MOCK=1 NAI_MOCK_DELAY_MS=300 STUDIO_DATA_DIR=<repo>/demo-cast/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3140 --strictPort
//   PW_CORE=<playwright-core> runtime/node/node.exe scripts/smoke/scene-characters.mjs \
//     http://127.0.0.1:3140 demo-cast/data/studio.db
//
// Args / env: argv[2] / SMOKE_BASE, argv[3] / SMOKE_DB, PW_CORE, CHROME, SMOKE_OUT
// as in positions.mjs. SMOKE_PROJECT: project with >= 2 characters and >= 4
// scenes (default: the first one).
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

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport })
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
  const file = path.join(OUT, `scene-characters-${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}

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
      `select p.id id from projects p
        where (select count(*) from characters x where x.project_id = p.id) >= 2
          and (select count(*) from project_scenes ps join project_scene_packs sp
                 on sp.id = ps.project_scene_pack_id where sp.project_id = p.id) >= 4
        order by p.id limit 1`,
    )?.id,
)
if (!projectId) refuse('no project with >= 2 characters and >= 4 scenes')
const [cA, cB] = q(
  'select * from characters where project_id = ? order by slot_index',
  projectId,
)
const scenes = q(
  `select ps.* from project_scenes ps join project_scene_packs sp
     on sp.id = ps.project_scene_pack_id where sp.project_id = ? order by sp.sort_order, sp.id, ps.sort_order`,
  projectId,
)
const [s1, s2, s3, s4] = scenes
console.log(`project ${projectId}: A=${cA.name} B=${cB.name}, ${scenes.length} scenes`)
const ovr = (sceneId, charId) =>
  q1(
    'select * from character_scene_overrides where project_scene_id = ? and character_id = ?',
    sceneId,
    charId,
  )
const charRow = (id) => q1('select * from characters where id = ?', id)

// ── 1. Chars tab: appearance default ──
await open(page, `/workspace/${projectId}`)
await page.getByRole('tab', { name: /^Chars/ }).click()
await page
  .locator('[data-character-chip]')
  .filter({ hasText: cB.name })
  .first()
  .click()
const appearance = page.locator('[data-character-appearance]')
await appearance.waitFor({ timeout: 10000 })
check(
  (await appearance
    .getByRole('radio', { name: 'All scenes' })
    .getAttribute('aria-checked')) === 'true',
  'chars: appearance defaults to All scenes',
)
await appearance.getByRole('radio', { name: 'Only selected scenes' }).click()
await until(
  () => charRow(cB.id).appearance === 'selected',
  6000,
  'chars: appearance saved',
)
check(true, 'chars: B stored as selected')
check(
  /Appears in 0 scenes/.test(await appearance.locator('[data-appears-in]').innerText()),
  'chars: hint "Appears in 0 scenes"',
)

// ── 2. bulk dialog: B On for all scenes, then back to Default ──
async function bulkCharacters(choice) {
  await page
    .getByRole('button', { name: 'More scene options' })
    .first()
    .click()
  await page.getByRole('menuitem', { name: 'Select', exact: true }).click()
  const header = page.locator('[data-selection-header]').first()
  await header.waitFor({ timeout: 5000 })
  await header.getByRole('checkbox').click()
  await header.locator('button[aria-label="More selection actions"]').click()
  await page.locator('[data-bulk-cast-item]').click()
  const dlg = page.locator('[data-bulk-cast]')
  await dlg.waitFor({ timeout: 4000 })
  await dlg
    .locator(`[data-bulk-cast-row="${cB.id}"]`)
    .getByRole('radio', { name: choice })
    .click()
  await dlg.locator('[data-bulk-cast-apply]').click()
  await dlg.waitFor({ state: 'hidden', timeout: 6000 })
  await header.getByRole('button', { name: /Exit|Close|Cancel/ }).first().click().catch(() => {})
  await page.keyboard.press('Escape')
}
await open(page, `/workspace/${projectId}?scene=${s1.id}`)
await bulkCharacters('On')
await until(
  () =>
    scenes.every((s) => ovr(s.id, cB.id)?.presence === 'on'),
  8000,
  'bulk: B On in all scenes',
)
check(true, 'bulk: B stored On for every selected scene')
check(
  ovr(s1.id, cA.id)?.presence == null,
  'bulk: character A untouched (no change)',
)
await open(page, `/workspace/${projectId}?scene=${s1.id}`)
await bulkCharacters('Default')
await until(
  () => scenes.every((s) => ovr(s.id, cB.id)?.presence == null),
  8000,
  'bulk: B back to Default',
)
check(true, 'bulk: B reset to Default (NULL) in every scene')

// ── 3. SceneView: per-scene presence ──
const rowOf = (id) => page.locator(`[data-scene-cast-row="${id}"]`)
async function openScene(scene) {
  await open(page, `/workspace/${projectId}?scene=${scene.id}`)
  await page.locator('[data-scene-cast]').waitFor({ timeout: 10000 })
}
await openScene(s1)
check(
  /Default · Off/.test(await rowOf(cB.id).locator('[data-cast-default-hint]').innerText()),
  'scene 1: B shows "Default · Off"',
)
check(
  /Default · On/.test(await rowOf(cA.id).locator('[data-cast-default-hint]').innerText()),
  'scene 1: A shows "Default · On"',
)
await shot(page, 'desktop-default')

await openScene(s2)
await rowOf(cB.id).getByRole('radio', { name: 'On', exact: true }).click()
await until(() => ovr(s2.id, cB.id)?.presence === 'on', 6000, 'scene 2: B On saved')
check(true, 'scene 2: B On stored')

await openScene(s3)
await rowOf(cB.id).getByRole('radio', { name: 'Replace' }).click()
const replaceBox = page.locator(`[data-scene-cast-replace="${cB.id}"]`)
await replaceBox.waitFor({ timeout: 6000 })
await replaceBox.locator('.cm-content').first().click()
await page.keyboard.type('hand, pov hands')
await until(
  () => ovr(s3.id, cB.id)?.replace_prompt === 'hand, pov hands',
  8000,
  'scene 3: replace prompt saved (debounced)',
)
check(ovr(s3.id, cB.id)?.presence === 'replace', 'scene 3: B Replace stored')
await shot(page, 'desktop-replace')

await openScene(s4)
await rowOf(cA.id).getByRole('radio', { name: 'Off' }).click()
await rowOf(cB.id).getByRole('radio', { name: 'On', exact: true }).click()
await until(
  () => ovr(s4.id, cA.id)?.presence === 'off' && ovr(s4.id, cB.id)?.presence === 'on',
  6000,
  'scene 4: A Off, B On saved',
)
check(true, 'scene 4: A Off + B On stored')
await shot(page, 'desktop-a-off')

// ── 4. Chars tab hint reflects the scenes ──
await open(page, `/workspace/${projectId}`)
await page.getByRole('tab', { name: /^Chars/ }).click()
await page
  .locator('[data-character-chip]')
  .filter({ hasText: cB.name })
  .first()
  .click()
check(
  /Appears in 3 scenes/.test(
    await page.locator('[data-appears-in]').innerText(),
  ),
  'chars: hint reads "Appears in 3 scenes" (scenes 2, 3, 4)',
)

// ── 5. mock generation: stored prompts follow the cast ──
await openScene(s1)
const baseJob = q1('select coalesce(max(id),0) m from generation_jobs').m
const inputs = page.locator('[title="Images to generate"] input')
await inputs.first().waitFor({ timeout: 15000 })
const n = await inputs.count()
const sceneIds = scenes.map((s) => s.id)
const wanted = new Set([s1.id, s2.id, s3.id, s4.id])
for (let i = 0; i < n; i++) {
  const want = wanted.has(sceneIds[i]) ? 1 : 0
  const input = inputs.nth(i)
  if ((await input.inputValue()) === String(want)) continue
  await input.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(String(want))
  await page.keyboard.press('Enter')
  await sleep(120)
}
await page.getByRole('button', { name: /^Generate \d+$/ }).first().click()
await until(
  () =>
    q1('select count(*) c from generation_jobs where id > ?', baseJob).c >= 4,
  15000,
  'gen: 4 jobs created',
)
const promptsOf = (scene) =>
  json(
    q1(
      'select resolved_prompts p from generation_jobs where id > ? and project_scene_id = ? order by id limit 1',
      baseJob,
      scene.id,
    )?.p,
  )
const names = (p) => p.characterPrompts.map((c) => c.characterId)
const p1 = promptsOf(s1)
check(
  names(p1).length === 1 && names(p1)[0] === cA.id,
  'gen: scene 1 (B default Off) has only A',
)
const p2 = promptsOf(s2)
check(
  names(p2).join() === [cA.id, cB.id].join(),
  'gen: scene 2 (B On) has A and B',
)
const p3 = promptsOf(s3)
const b3 = p3.characterPrompts.find((c) => c.characterId === cB.id)
check(
  names(p3).length === 2 && b3?.prompt === 'hand, pov hands',
  'gen: scene 3 (B Replace) B prompt is exactly the replace text',
)
check(
  b3 && b3.negative === '' && b3.libraryCharacterId === undefined && b3.axisValues === undefined,
  'gen: replaced slot has no own negative / parts record',
)
const p4 = promptsOf(s4)
check(
  names(p4).length === 1 && names(p4)[0] === cB.id,
  'gen: scene 4 (A Off, B On) has only B',
)
await until(
  () =>
    q1(
      `select count(*) c from generation_jobs where id > ? and status = 'completed'`,
      baseJob,
    ).c >= 4,
  40000,
  'gen: 4 jobs completed',
  500,
)
const meta3 = json(
  q1(
    'select metadata m from generated_images where project_scene_id = ? order by id desc limit 1',
    s3.id,
  )?.m,
)
check(
  meta3?.prompts?.characterPrompts?.some((c) => c.prompt === 'hand, pov hands'),
  'gen: image metadata keeps the replaced prompt',
)

// ── 6. 390 px screenshots ──
await desktop.ctx.close()
const mobile = await newPage({ width: 390, height: 844 })
const mp = mobile.page
await open(mp, `/workspace/${projectId}?scene=${s3.id}`)
const scenesBtn = mp.getByRole('tab', { name: /^Result/ })
await scenesBtn.click().catch(() => {})
await mp.locator('[data-scene-cast]').waitFor({ timeout: 10000 })
const overflow = await mp.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth + 1,
)
check(!overflow, 'mobile: no horizontal page scroll')
await shot(mp, 'mobile-replace')
await mobile.ctx.close()

console.log(`\nconsole errors: ${consoleErrors}`)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
await browser.close()
process.exit(failures === 0 && consoleErrors === 0 ? 0 : 1)
