// Scene templates dialog smoke against a NAI_MOCK dev server, with REAL writes.
//
// Exercises (desktop 1440 + mobile 390): create pack, add / rename /
// duplicate / move / delete scene, add / rename / remove key, edit a value
// (persisted after reopen), pack rename / description / duplicate / delete,
// apply only the checked scenes (DB cross-check), and that Ctrl/Cmd+Enter and
// Ctrl+K are inert while the dialog is open. The DB is only read.
//
// REFUSES to run unless the server shows the MOCK badge (NAI_MOCK=1), so it
// can only touch throwaway STUDIO_DATA_DIR data. Never clicks Generate.
//
// Usage (from the repo root):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-mock
//   NAI_MOCK=1 STUDIO_DATA_DIR=<repo>/demo-mock/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3100 --strictPort
//   PW_CORE=<playwright-core> runtime/node/node.exe scripts/smoke/templates.mjs \
//     http://127.0.0.1:3100 demo-mock/data/studio.db
//
// Env: PW_CORE, CHROME, SMOKE_OUT as in workspace.mjs; SMOKE_PROJECT (default 1)
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
  'http://127.0.0.1:3100'
).replace(/\/$/, '')
const DB_PATH = path.resolve(
  process.argv[3] ?? process.env.SMOKE_DB ?? 'demo-mock/data/studio.db',
)
const PROJECT = Number(process.env.SMOKE_PROJECT ?? 1)
const OUT = process.env.SMOKE_OUT ?? path.join(os.tmpdir(), '87studio-smoke')
fs.mkdirSync(OUT, { recursive: true })

let failures = 0
let consoleErrors = 0
const check = (cond, msg) => {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
  return !!cond
}
const db = () => new Database(DB_PATH, { readonly: true, fileMustExist: true })
const query = (sql, ...args) => {
  const d = db()
  try {
    return d.prepare(sql).all(...args)
  } finally {
    d.close()
  }
}
const settle = (page, ms = 400) => page.waitForTimeout(ms)
const stamp = Date.now().toString(36)

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
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() !== 'error' && !/hydrat/i.test(m.text())) return
    if (/ERR_FAILED|Failed to fetch|net::/.test(m.text())) return
    consoleErrors++
    console.log(`  [console.${m.type()}] ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', (e) => {
    consoleErrors++
    console.log(`  [pageerror] ${e.message.slice(0, 300)}`)
  })
  return { ctx, page }
}

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}

/** Opens the workspace, skipping the onboarding welcome dialog if it shows. */
async function gotoWorkspace(page) {
  await page.goto(BASE + `/workspace/${PROJECT}`, { waitUntil: 'networkidle' })
  const welcome = page
    .getByRole('dialog')
    .filter({ hasText: 'Welcome to 87 Studio' })
  if (
    await welcome
      .waitFor({ timeout: 2500 })
      .then(() => true)
      .catch(() => false)
  ) {
    await welcome.getByRole('button', { name: 'Skip', exact: true }).click()
    await settle(page, 500)
  }
  await page.waitForSelector('[role="tab"]', { timeout: 20000 })
}

async function openDialog(page) {
  await page
    .locator('button')
    .filter({ hasText: /^Scene Templates$/i })
    .first()
    .click()
  await page.waitForSelector('[data-testid="templates-dialog"]')
  await settle(page, 800)
}
const dialog = (page) => page.locator('[data-testid="templates-dialog"]')
const packRow = (page, name) =>
  dialog(page).locator('[data-testid="pack-row"]').filter({ hasText: name })
const sceneRow = (page, name) =>
  dialog(page)
    .locator('[data-testid="scene-row"]')
    .filter({ has: page.getByText(name, { exact: true }) })
const rowNames = async (page) =>
  (
    await dialog(page)
      .locator('[data-testid="scene-row"] span.truncate')
      .allInnerTexts()
  ).map((s) => s.trim())

async function popoverSubmit(page, text) {
  const input = page.locator('[data-slot="popover-content"] input').first()
  await input.fill(text)
  await input.press('Enter')
  await settle(page, 700)
}
async function contextAction(page, row, label) {
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: label, exact: true }).click()
  await settle(page, 500)
}
async function confirmDelete(page) {
  await page
    .locator('[data-slot="alert-dialog-content"]')
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  await settle(page, 700)
}
const placeholdersOf = (packName, sceneName) => {
  const rows = query(
    `SELECT s.placeholders FROM scenes s JOIN scene_packs p ON p.id = s.scene_pack_id
     WHERE p.name = ? AND s.name = ?`,
    packName,
    sceneName,
  )
  return rows.length ? JSON.parse(rows[0].placeholders) : null
}
const sceneNamesInDb = (packName) =>
  query(
    `SELECT s.name FROM scenes s JOIN scene_packs p ON p.id = s.scene_pack_id
     WHERE p.name = ? ORDER BY s.sort_order, s.id`,
    packName,
  ).map((r) => r.name)

async function typeInto(page, keyName, text) {
  const editor = dialog(page)
    .locator(`[data-testid="key-block"][data-key="${keyName}"] .cm-content`)
    .first()
  await editor.waitFor({ timeout: 10000 })
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(text)
}

// ───────── Desktop 1440 ─────────
async function desktop() {
  console.log('== desktop 1440x900 (real writes)')
  const { ctx, page } = await newPage(1440, 900)
  await gotoWorkspace(page)
  const mock = await page.locator('[data-testid="mock-badge"]').count()
  if (!check(mock > 0, 'server shows the MOCK badge (refuses otherwise)')) {
    await browser.close()
    process.exit(1)
  }

  const packName = `Smoke ${stamp}`
  const dupPackName = `${packName} (copy)`

  await openDialog(page)
  const box = await dialog(page).boundingBox()
  check(
    Math.abs(box.width - 1200) < 4 && Math.abs(box.height - 0.88 * 900) < 4,
    `dialog is ~1200x${Math.round(0.88 * 900)} (${Math.round(box.width)}x${Math.round(box.height)})`,
  )
  check(
    (await dialog(page).locator('[data-slot="resizable-panel"]').count()) === 3,
    'three resizable panes',
  )
  const descBox = await dialog(page)
    .locator('[data-slot="dialog-description"]')
    .boundingBox()
  check(
    !descBox || (descBox.width <= 1 && descBox.height <= 1),
    'no visible description paragraph (sr-only)',
  )
  await shot(page, 'templates-desktop-open')

  // ── Dialog is inert for Generate / palette shortcuts ──
  const batchesBefore = query('SELECT COUNT(*) AS n FROM generation_batches')[0]
    .n
  await page.keyboard.press('Control+Enter')
  await page.keyboard.press('Control+k')
  await settle(page, 800)
  check(
    (await page.locator('[cmdk-root]').count()) === 0,
    'Ctrl+K does not open the scene palette while the dialog is open',
  )
  check(
    query('SELECT COUNT(*) AS n FROM generation_batches')[0].n ===
      batchesBefore,
    'Ctrl+Enter does not queue a batch while the dialog is open',
  )

  // ── Create pack ──
  await dialog(page).locator('[data-testid="new-pack"]').click()
  await popoverSubmit(page, packName)
  check(
    (await packRow(page, packName).count()) === 1 &&
      (await packRow(page, packName).getAttribute('data-selected')) !== null,
    'create pack: row appears and is selected',
  )
  check(
    query('SELECT name FROM scene_packs WHERE name = ?', packName).length === 1,
    'create pack: persisted',
  )
  check(
    (await dialog(page).getByText('No scenes yet').count()) >= 1,
    'empty pack shows the no-scenes state',
  )

  // ── Add scenes ──
  await dialog(page).locator('[data-testid="new-scene"]').click()
  await popoverSubmit(page, 'Alpha')
  await dialog(page).locator('[data-testid="new-scene"]').click()
  await popoverSubmit(page, 'Beta')
  await dialog(page).locator('[data-testid="new-scene"]').click()
  await popoverSubmit(page, 'Gamma')
  check(
    (await rowNames(page)).join('|') === 'Alpha|Beta|Gamma',
    `add scene: rows Alpha|Beta|Gamma (${(await rowNames(page)).join('|')})`,
  )
  check(
    sceneNamesInDb(packName).join('|') === 'Alpha|Beta|Gamma',
    'add scene: persisted in order',
  )
  check(
    (await dialog(page).locator('[data-testid="scene-name"]').innerText()) ===
      'Gamma',
    'new scene is selected in the editor',
  )

  // ── Keys: add / edit / rename / remove ──
  await dialog(page).locator('[data-testid="add-key"]').click()
  await popoverSubmit(page, 'expression')
  check(
    (await dialog(page)
      .locator('[data-testid="key-block"][data-key="expression"]')
      .count()) === 1,
    'add key: block appears',
  )
  await typeInto(page, 'expression', 'smile, happy')
  await settle(page, 1800)
  check(
    (await dialog(page).locator('[data-testid="saved-indicator"]').count()) ===
      1,
    'autosave: "Saved" indicator',
  )
  check(
    placeholdersOf(packName, 'Gamma')?.expression === 'smile, happy',
    'edit value: persisted (autosave)',
  )
  await shot(page, 'templates-desktop-editor')

  // add a second key from suggestions (Gamma has expression; copy to Beta later)
  await dialog(page).locator('[data-testid="add-key"]').click()
  await popoverSubmit(page, 'bg')
  await typeInto(page, 'bg', 'simple background')
  // rename key bg -> background
  await dialog(page)
    .locator('[data-testid="key-block"][data-key="bg"]')
    .getByRole('button', { name: '@{slot:bg}' })
    .click()
  const keyInput = dialog(page).locator(
    '[data-testid="key-block"][data-key="bg"] input',
  )
  await keyInput.fill('background')
  await keyInput.press('Enter')
  await settle(page, 1800)
  const afterRename = placeholdersOf(packName, 'Gamma')
  check(
    afterRename &&
      !('bg' in afterRename) &&
      afterRename.background === 'simple background' &&
      Object.keys(afterRename).join('|') === 'expression|background',
    `rename key keeps value and order (${JSON.stringify(afterRename)})`,
  )
  // remove key
  await dialog(page)
    .locator('[data-testid="key-block"][data-key="background"]')
    .getByRole('button', { name: 'Remove key' })
    .click()
  await settle(page, 1800)
  check(
    Object.keys(placeholdersOf(packName, 'Gamma') ?? {}).join('|') ===
      'expression',
    'remove key: persisted',
  )

  // suggestions come from other scenes in the pack
  await dialog(page).locator('[data-testid="scene-row"]').nth(0).click()
  await dialog(page).locator('[data-testid="add-key"]').click()
  const suggestions = await page
    .locator('[data-slot="popover-content"] button')
    .allInnerTexts()
  check(
    suggestions.includes('expression'),
    `add key suggests keys used by other scenes (${suggestions.join(',')})`,
  )
  await page
    .locator('[data-slot="popover-content"] button', {
      hasText: /^expression$/,
    })
    .click()
  await settle(page, 400)

  // ── Switching scenes flushes a pending edit ──
  await typeInto(page, 'expression', 'flush on switch')
  await dialog(page).locator('[data-testid="scene-row"]').nth(1).click()
  await settle(page, 1200)
  check(
    placeholdersOf(packName, 'Alpha')?.expression === 'flush on switch',
    'scene switch flushes the pending edit immediately',
  )

  // ── Rename scene inline ──
  await dialog(page).locator('[data-testid="scene-name"]').click()
  const nameInput = dialog(page)
    .locator('[data-testid="scene-editor"] input')
    .first()
  await nameInput.fill('Beta2')
  await nameInput.press('Enter')
  await settle(page, 700)
  check(
    sceneNamesInDb(packName).includes('Beta2') &&
      !sceneNamesInDb(packName).includes('Beta'),
    'rename scene (inline): persisted',
  )
  // duplicate name is rejected
  await contextAction(page, sceneRow(page, 'Gamma'), 'Rename')
  const promptInput = page.locator('[data-slot="dialog-content"] input').last()
  await promptInput.fill('alpha')
  check(
    (await page
      .getByRole('alert')
      .filter({ hasText: /already exists/ })
      .count()) === 1,
    'rename scene: duplicate name shows an error',
  )
  await promptInput.fill('Gamma2')
  await promptInput.press('Enter')
  await settle(page, 700)
  check(
    sceneNamesInDb(packName).includes('Gamma2'),
    'rename scene (menu): persisted',
  )

  // ── Duplicate / move / delete ──
  await contextAction(page, sceneRow(page, 'Alpha'), 'Duplicate')
  check(
    sceneNamesInDb(packName).includes('Alpha (copy)') &&
      placeholdersOf(packName, 'Alpha (copy)')?.expression ===
        'flush on switch',
    'duplicate scene: copy persisted with values',
  )
  await contextAction(page, sceneRow(page, 'Alpha (copy)'), 'Move up')
  await settle(page, 600)
  check(
    sceneNamesInDb(packName).join('|') === 'Alpha|Beta2|Alpha (copy)|Gamma2',
    `move up: order persisted (${sceneNamesInDb(packName).join('|')})`,
  )
  await contextAction(page, sceneRow(page, 'Alpha (copy)'), 'Move down')
  await settle(page, 600)
  check(
    sceneNamesInDb(packName).join('|') === 'Alpha|Beta2|Gamma2|Alpha (copy)',
    `move down: order persisted (${sceneNamesInDb(packName).join('|')})`,
  )
  await contextAction(page, sceneRow(page, 'Alpha (copy)'), 'Delete')
  await confirmDelete(page)
  check(
    !sceneNamesInDb(packName).includes('Alpha (copy)'),
    'delete scene: removed from DB',
  )

  // ── Persisted after reopen ──
  await page.keyboard.press('Escape')
  await settle(page, 500)
  await openDialog(page)
  check(
    (await packRow(page, packName).getAttribute('data-selected')) !== null,
    'reopen: newest pack is selected',
  )
  await sceneRow(page, 'Alpha').click()
  await settle(page, 800)
  const reopened = await dialog(page)
    .locator('[data-testid="key-block"][data-key="expression"] .cm-content')
    .first()
    .innerText()
  check(
    reopened.trim() === 'flush on switch',
    `edited value is shown after reopen (${reopened.trim()})`,
  )

  // ── ↑ / ↓ moves selection from the list ──
  await sceneRow(page, 'Alpha').focus()
  await page.keyboard.press('ArrowDown')
  await settle(page, 300)
  check(
    (await dialog(page).locator('[data-testid="scene-name"]').innerText()) ===
      'Beta2',
    'ArrowDown moves the scene selection',
  )

  // ── Apply only the checked scenes ──
  const footer = dialog(page).locator('[data-testid="templates-footer"]')
  check(
    /3\/3 selected/.test(await footer.innerText()),
    `footer: all checked by default (${(await footer.innerText()).replace(/\s+/g, ' ')})`,
  )
  await sceneRow(page, 'Beta2').locator('[role="checkbox"]').click()
  check(
    /2\/3 selected/.test(await footer.innerText()),
    'unchecking updates the footer',
  )
  check(
    (await dialog(page).locator('[data-testid="scene-name"]').innerText()) ===
      'Beta2',
    'checkbox does not change the edited scene',
  )
  await footer.getByRole('button', { name: /Select all/ }).click()
  await footer.getByRole('button', { name: /Select none/ }).click()
  check(
    await footer.locator('[data-testid="apply-scenes"]').isDisabled(),
    'Apply is disabled at 0 selected',
  )
  await footer.getByRole('button', { name: /Select all/ }).click()
  await sceneRow(page, 'Beta2').locator('[role="checkbox"]').click()
  const pspBefore = query(
    'SELECT COUNT(*) AS n FROM project_scene_packs WHERE project_id = ?',
    PROJECT,
  )[0].n
  await shot(page, 'templates-desktop-apply')
  await footer.locator('[data-testid="apply-scenes"]').click()
  await settle(page, 1500)
  check(
    (await page.locator('[data-testid="templates-dialog"]').count()) === 0,
    'apply closes the dialog',
  )
  const psp = query(
    `SELECT id FROM project_scene_packs WHERE project_id = ? AND name = ?
     ORDER BY id DESC`,
    PROJECT,
    packName,
  )
  check(
    query(
      'SELECT COUNT(*) AS n FROM project_scene_packs WHERE project_id = ?',
      PROJECT,
    )[0].n ===
      pspBefore + 1 && psp.length === 1,
    'apply: one new project scene pack',
  )
  const applied = psp.length
    ? query(
        'SELECT name FROM project_scenes WHERE project_scene_pack_id = ? ORDER BY sort_order',
        psp[0].id,
      ).map((r) => r.name)
    : []
  check(
    applied.join('|') === 'Alpha|Gamma2',
    `apply: only the checked scenes were copied (${applied.join('|')})`,
  )

  // ── Pack actions ──
  await openDialog(page)
  await contextAction(page, packRow(page, packName), 'Edit description')
  const desc = page.locator('[data-slot="dialog-content"] textarea').last()
  await desc.fill('smoke description')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await settle(page, 700)
  check(
    query('SELECT description FROM scene_packs WHERE name = ?', packName)[0]
      ?.description === 'smoke description',
    'edit pack description: persisted',
  )
  await contextAction(page, packRow(page, packName), 'Duplicate')
  check(
    query('SELECT id FROM scene_packs WHERE name = ?', dupPackName).length ===
      1 &&
      sceneNamesInDb(dupPackName).join('|') ===
        sceneNamesInDb(packName).join('|'),
    'duplicate pack: copy with the same scenes',
  )
  await contextAction(page, packRow(page, dupPackName), 'Rename pack')
  const renameInput = page.locator('[data-slot="dialog-content"] input').last()
  await renameInput.fill(`${packName} renamed`)
  await renameInput.press('Enter')
  await settle(page, 700)
  check(
    query('SELECT id FROM scene_packs WHERE name = ?', `${packName} renamed`)
      .length === 1,
    'rename pack: persisted',
  )
  await contextAction(page, packRow(page, `${packName} renamed`), 'Delete')
  check(
    /not affected/i.test(
      await page.locator('[data-slot="alert-dialog-content"]').innerText(),
    ),
    'delete pack: confirm says applied scenes are unaffected',
  )
  await confirmDelete(page)
  check(
    query('SELECT id FROM scene_packs WHERE name = ?', `${packName} renamed`)
      .length === 0,
    'delete pack: removed',
  )
  // cleanup: delete the smoke pack too
  await contextAction(page, packRow(page, packName), 'Delete')
  await confirmDelete(page)
  check(
    query('SELECT id FROM scene_packs WHERE name = ?', packName).length === 0,
    'cleanup: smoke pack deleted',
  )
  check(
    query(
      'SELECT COUNT(*) AS n FROM project_scenes WHERE project_scene_pack_id = ?',
      psp[0]?.id ?? -1,
    )[0].n === 2,
    'project snapshot is unaffected by deleting the global pack',
  )
  await ctx.close()
}

// ───────── Mobile 390 ─────────
async function mobile() {
  console.log('== mobile 390x844 (real writes)')
  const { ctx, page } = await newPage(390, 844)
  await gotoWorkspace(page)
  const packName = `SmokeM ${stamp}`
  // the header button is icon-only on mobile
  await page
    .locator('button[data-slot="dialog-trigger"]')
    .filter({ has: page.locator('svg') })
    .first()
    .click()
  await page.waitForSelector('[data-testid="templates-dialog"]')
  await settle(page, 800)
  const box = await dialog(page).boundingBox()
  check(
    Math.abs(box.width - 390) < 2 && Math.abs(box.height - 844) < 2,
    `mobile dialog is full screen (${Math.round(box.width)}x${Math.round(box.height)})`,
  )
  check(
    (await dialog(page).locator('[data-slot="resizable-panel"]').count()) === 0,
    'mobile: stacked, no resizable panes',
  )
  check(
    (await dialog(page).locator('[data-testid="pack-row"]').count()) > 0,
    'mobile: step 1 shows the packs list',
  )
  check(
    (await dialog(page).locator('[data-testid="templates-footer"]').count()) ===
      0,
    'mobile: no apply bar on the packs step',
  )
  await shot(page, 'templates-mobile-packs')

  await dialog(page).locator('[data-testid="new-pack"]').click()
  await popoverSubmit(page, packName)
  check(
    (await dialog(page).locator('[data-testid="scene-row"]').count()) === 0 &&
      (await dialog(page).locator('[data-testid="new-scene"]').count()) === 1,
    'mobile: creating a pack advances to the scenes step',
  )
  await dialog(page).locator('[data-testid="new-scene"]').click()
  await popoverSubmit(page, 'One')
  check(
    (await dialog(page).locator('[data-testid="scene-name"]').count()) === 1,
    'mobile: adding a scene opens the editor step',
  )
  await dialog(page).locator('[data-testid="add-key"]').click()
  await popoverSubmit(page, 'pose')
  await typeInto(page, 'pose', 'standing')
  await settle(page, 1800)
  check(
    placeholdersOf(packName, 'One')?.pose === 'standing',
    'mobile: edit value persisted',
  )
  await shot(page, 'templates-mobile-editor')
  await dialog(page).getByRole('button', { name: 'Back' }).click()
  await settle(page, 400)
  check(
    (await dialog(page).locator('[data-testid="templates-footer"]').count()) ===
      1,
    'mobile: apply bar visible on the scenes step',
  )
  await shot(page, 'templates-mobile-scenes')
  await dialog(page).getByRole('button', { name: 'Back' }).click()
  await settle(page, 400)
  check(
    (await dialog(page).locator('[data-testid="pack-row"]').count()) > 0,
    'mobile: back returns to the packs step',
  )
  // cleanup
  await contextAction(page, packRow(page, packName), 'Delete')
  await confirmDelete(page)
  check(
    query('SELECT id FROM scene_packs WHERE name = ?', packName).length === 0,
    'mobile cleanup: pack deleted',
  )
  await ctx.close()
}

await desktop()
await mobile()

console.log(`\nconsole errors: ${consoleErrors}\nfailures: ${failures}`)
await browser.close()
process.exit(failures || consoleErrors ? 1 : 0)
