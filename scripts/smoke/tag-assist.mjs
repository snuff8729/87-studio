// Tag assist smoke: autocomplete rows + info panel, caret tag card, floating
// Tag Search window (shortcut, drag/resize/persist/reset, add to last editor,
// category tabs), mobile sheet, expanded-editor dialog.
//
// Needs a server whose data dir holds the real danbooru.db (copy it into the
// throwaway dir) and a studio.db with onboarding_completed=true. Writes
// nothing except localStorage in the browser context.
//
// Usage (repo root):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-mock-tags
//   (copy danbooru.db into demo-mock-tags/data, set onboarding_completed)
//   NAI_MOCK=1 STUDIO_DATA_DIR=<repo>/demo-mock-tags/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3178 --strictPort
//   runtime/node/node.exe scripts/smoke/tag-assist.mjs http://127.0.0.1:3178 demo-mock-tags/data
//
// Args / env: argv[2] server URL, argv[3] data dir (for the alias lookup),
// PW_CORE, CHROME, SMOKE_OUT (screenshot dir) as in browse.mjs.
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
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3178').replace(/\/$/, '')
const DATA = path.resolve(process.argv[3] ?? 'demo-mock-tags/data')
const OUT = process.env.SMOKE_OUT ?? path.join(os.tmpdir(), '87studio-smoke')
fs.mkdirSync(OUT, { recursive: true })

let failures = 0
let consoleErrors = 0
const check = (cond, msg) => {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
  return !!cond
}
async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}

// A real alias (antecedent is not itself a tag) of a popular tag
const dan = new Database(path.join(DATA, 'danbooru.db'), { readonly: true })
const aliasRow = dan
  .prepare(
    `SELECT a.antecedent_name AS alias, t.name AS tag
     FROM tag_aliases a JOIN tags t ON t.name = a.consequent_name
     WHERE a.status = 'active' AND length(a.antecedent_name) BETWEEN 6 AND 14
       AND a.antecedent_name NOT IN (SELECT name FROM tags)
       AND a.antecedent_name NOT LIKE '%\\_%' ESCAPE '\\'
       AND t.category = 0 AND t.post_count > 50000
     ORDER BY t.post_count DESC LIMIT 1`,
  )
  .get()
dan.close()
console.log('alias fixture', aliasRow)

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})

function attach(page) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (/Failed to load resource|favicon|net::ERR/.test(text)) return
    consoleErrors++
    console.log(`  [console.error] ${text.slice(0, 300)}`)
  })
  page.on('pageerror', (e) => {
    consoleErrors++
    console.log(`  [pageerror] ${String(e).slice(0, 300)}`)
  })
}

async function editorOf(page) {
  const ed = page.locator('.cm-content').first()
  await ed.waitFor({ timeout: 30000 })
  return ed
}

async function setDoc(page, text) {
  const ed = await editorOf(page)
  await page.keyboard.press('Escape')
  await ed.focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  if (text) await page.keyboard.insertText(text)
  return ed
}
async function firstRowIs(page, name) {
  await page
    .waitForFunction(
      (n) =>
        document
          .querySelector('[data-tag-row]')
          ?.getAttribute('data-tag-row') === n,
      name,
      { timeout: 8000 },
    )
    .catch(() => {})
}
const docText = (page) => page.locator('.cm-content').first().innerText()

// ── desktop ──────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  })
  const page = await ctx.newPage()
  attach(page)
  await page.goto(`${BASE}/generate`, { waitUntil: 'networkidle' })
  await editorOf(page)

  // 1. Autocomplete
  await setDoc(page, '1girl, solo, 1gir')
  await page.keyboard.type('l', { delay: 30 }) // "1girl"
  const rows = page.locator('.cm-tooltip-autocomplete li')
  await rows.first().waitFor({ timeout: 10000 })
  await page.waitForTimeout(400)
  check((await rows.count()) >= 1, 'autocomplete shows rows')
  check(
    (await rows.first().innerText()).toLowerCase().includes('1girl'),
    'exact match first for "1girl"',
  )
  check(
    (await rows.first().locator('.cm-tag-inprompt').count()) === 1,
    'first row marked "in prompt"',
  )
  check(
    (await rows.first().locator('.cm-tag-badge').count()) >= 1,
    'row has fine-category label',
  )
  check(
    (await rows.first().locator('.cm-tag-rowcount').innerText()).length > 0,
    'row has post count',
  )

  await setDoc(page, 'long ha')
  await page.waitForSelector('.cm-tooltip-autocomplete li', { timeout: 10000 })
  await page.waitForSelector('.cm-completionInfo', { timeout: 10000 })
  const infoText = await page.locator('.cm-completionInfo').first().innerText()
  check(infoText.length > 20, 'info panel beside list has content')
  const firstLabel = await page
    .locator('.cm-tooltip-autocomplete li .cm-completionLabel')
    .first()
    .innerText()
  check(
    /long hair/.test(firstLabel),
    `"long ha" ranks long hair first (${firstLabel})`,
  )
  await shot(page, 'tag-assist-1440-autocomplete-info')

  // Space/underscore equivalence + weight prefix
  await setDoc(page, '1.2::long_ha')
  await page.waitForSelector('.cm-tooltip-autocomplete li', { timeout: 10000 })
  await page.waitForTimeout(300)
  check(
    /long hair/.test(
      await page
        .locator('.cm-tooltip-autocomplete li .cm-completionLabel')
        .first()
        .innerText(),
    ),
    'weight prefix + underscore handled',
  )
  await page.keyboard.press('Escape')

  // Alias: shows hint, inserts canonical
  if (aliasRow) {
    await setDoc(page, aliasRow.alias.slice(0, aliasRow.alias.length))
    await page.waitForSelector('.cm-tooltip-autocomplete li', {
      timeout: 10000,
    })
    await page.waitForTimeout(400)
    const hint = await page
      .locator('.cm-tooltip-autocomplete .cm-tag-alias')
      .count()
    check(hint >= 1, `alias hint shown for "${aliasRow.alias}"`)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    const t = (await docText(page)).trim()
    check(
      t === aliasRow.tag.replace(/_/g, ' '),
      `alias inserts canonical tag (${t} == ${aliasRow.tag})`,
    )
  }

  // 2. Caret card
  await setDoc(page, 'long hair, smile, 1girl')
  await page.keyboard.press('Home')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  const card = page.locator('.cm-tag-card')
  await card.waitFor({ timeout: 6000 })
  check(true, 'caret card appears after arrow-key travel')
  check(
    /long hair/.test(await card.locator('.cm-tag-info-title').innerText()),
    'card shows tag name',
  )
  check((await card.locator('.cm-tag-chip').count()) > 0, 'card shows chips')
  await shot(page, 'tag-assist-1440-caret-card')
  const chip = card.locator('.cm-tag-chip').first()
  const chipName = (await chip.innerText()).trim()
  await chip.click()
  await page.waitForTimeout(200)
  const afterChip = await docText(page)
  check(
    afterChip.startsWith(`long hair, ${chipName}, smile`),
    `chip inserts after token ("${afterChip}")`,
  )
  check((await card.count()) === 0, 'card hides after insert')

  // Esc hides, typing hides
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await card.waitFor({ timeout: 6000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  check((await card.count()) === 0, 'Esc hides the card')
  await page.keyboard.press('ArrowRight')
  await card.waitFor({ timeout: 6000 })
  await page.keyboard.type('x')
  await page.waitForTimeout(100)
  check((await card.count()) === 0, 'typing hides the card')

  // Unknown token -> nothing
  await setDoc(page, 'zzqqxxyy')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(900)
  check((await card.count()) === 0, 'unknown tag shows no card')

  // Toggle off
  await setDoc(page, 'long hair, smile')
  const toggle = page.locator('[data-tag-info-toggle]').first()
  await toggle.click()
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(900)
  check((await card.count()) === 0, 'toggle off disables the card')
  check(
    (await page.evaluate(() => localStorage.getItem('87studio-tag-info'))) ===
      '0',
    'toggle persisted',
  )
  await toggle.click()
  check(
    (await page.evaluate(() => localStorage.getItem('87studio-tag-info'))) ===
      '1',
    'toggle re-enabled',
  )

  // 3. Tag Search window
  await setDoc(page, '1girl')
  await page.keyboard.press('Control+Shift+F')
  const win = page.locator('[data-tag-search-window]')
  await win.waitFor({ timeout: 5000 })
  check(true, 'Ctrl+Shift+F opens Tag Search while typing')
  const box0 = await win.boundingBox()
  check(
    Math.abs(box0.width - 440) < 3 && Math.abs(box0.height - 560) < 3,
    `default size ~440x560 (${box0.width}x${box0.height})`,
  )
  check(
    Math.abs(box0.x + box0.width - (1440 - 16)) < 3 &&
      Math.abs(box0.y + box0.height - (900 - 16)) < 3,
    'default position bottom-right',
  )
  await page.waitForTimeout(500)
  check(
    (await page.evaluate(() =>
      document.activeElement?.hasAttribute('data-tag-search-input'),
    )) === true,
    'search input focused',
  )
  await shot(page, 'tag-assist-1440-search-default')

  const input = win.locator('[data-tag-search-input]')
  await input.fill('smile')
  await firstRowIs(page, 'smile')
  await page.waitForTimeout(400)
  const firstRow = await win
    .locator('[data-tag-row]')
    .first()
    .getAttribute('data-tag-row')
  check(firstRow === 'smile', `exact match pinned first (${firstRow})`)
  check(
    (await win.locator('[data-tag-detail]').innerText()).includes('smile'),
    'detail pane shows selection',
  )

  // page behind stays interactive: editor still focusable/typable
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('End')
  await page.keyboard.insertText(', blush')
  check(
    (await docText(page)).includes('blush'),
    'page behind is interactive (no backdrop)',
  )

  // add to last focused editor
  await input.fill('smile')
  await firstRowIs(page, 'smile')
  await win.locator('[data-tag-add]').click()
  await page.waitForTimeout(200)
  const afterAdd = await docText(page)
  check(
    /, smile$/.test(afterAdd.trim()),
    `Add inserts into last focused editor ("${afterAdd}")`,
  )
  check((await win.count()) === 1, 'window stays open after adding')
  // Enter adds too
  await input.fill('solo')
  await firstRowIs(page, 'solo')
  await page.waitForTimeout(300)
  await input.press('Enter')
  await page.waitForTimeout(200)
  check(
    /solo$/.test((await docText(page)).trim()),
    'Enter adds the selected tag',
  )

  // category tabs
  await input.fill('skirt')
  await page.waitForTimeout(600)
  await win.locator('[data-tab="clothing"]').click()
  await page.waitForTimeout(700)
  const clothingRows = await win
    .locator('[data-tag-row]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-tag-row')))
  check(
    clothingRows.length > 5 && clothingRows.every((n) => /skirt/.test(n)),
    `clothing tab filters (${clothingRows.length} rows)`,
  )
  check(
    (await win.locator('[data-tab="cloth_bottom"]').count()) === 1,
    'fine sub-category chips shown under a top tab',
  )
  await win.locator('[data-tab="cloth_bottom"]').click()
  await page.waitForTimeout(600)
  check(
    (await win.locator('[data-tag-row]').count()) > 5,
    'fine sub-category tab works',
  )
  await win.locator('[data-tab="character"]').click()
  await input.fill('hatsune')
  await page.waitForTimeout(700)
  check(
    (await win.locator('[data-tag-row]').count()) > 0,
    'character tab searches characters',
  )
  await shot(page, 'tag-assist-1440-search-tabs')
  await win.locator('[data-tab="all"]').click()
  await input.fill('')
  await page.waitForTimeout(600)
  check(
    (await win.locator('[data-tag-row]').count()) > 20,
    'empty query lists popular tags',
  )

  // drag by title bar
  const tb = await win.locator('[data-tag-search-titlebar]').boundingBox()
  await page.mouse.move(tb.x + 100, tb.y + 10)
  await page.mouse.down()
  await page.mouse.move(tb.x - 200, tb.y - 150, { steps: 8 })
  await page.mouse.up()
  const box1 = await win.boundingBox()
  check(
    Math.abs(box1.x - (box0.x - 300)) < 4 &&
      Math.abs(box1.y - (box0.y - 160)) < 4,
    `drag moves window (${box1.x},${box1.y})`,
  )
  // resize
  const rh = await win.locator('[data-tag-search-resize]').boundingBox()
  await page.mouse.move(rh.x + 8, rh.y + 8)
  await page.mouse.down()
  await page.mouse.move(rh.x + 108, rh.y + 58, { steps: 6 })
  await page.mouse.up()
  const box2 = await win.boundingBox()
  check(
    Math.abs(box2.width - (box1.width + 100)) < 4 &&
      Math.abs(box2.height - (box1.height + 50)) < 4,
    `resize works (${box2.width}x${box2.height})`,
  )
  await shot(page, 'tag-assist-1440-search-dragged')
  // clamp: drag far outside
  const tb2 = await win.locator('[data-tag-search-titlebar]').boundingBox()
  await page.mouse.move(tb2.x + 100, tb2.y + 10)
  await page.mouse.down()
  await page.mouse.move(-500, -500, { steps: 6 })
  await page.mouse.up()
  const box3 = await win.boundingBox()
  check(
    box3.x >= -0.5 && box3.y >= -0.5,
    `drag is clamped inside viewport (${box3.x},${box3.y})`,
  )
  await page.mouse.move(box3.x + 100, box3.y + 10)
  await page.mouse.down()
  await page.mouse.move(1900, 1500, { steps: 6 })
  await page.mouse.up()
  const box4 = await win.boundingBox()
  check(
    box4.x + box4.width <= 1440.5 && box4.y + box4.height <= 900.5,
    'drag clamped at bottom-right',
  )
  // persistence
  const stored = await page.evaluate(() =>
    localStorage.getItem('87studio-tag-search-window'),
  )
  check(
    !!stored && JSON.parse(stored).w === box4.width,
    'rect persisted in localStorage',
  )
  await page.reload({ waitUntil: 'networkidle' })
  await editorOf(page)
  await page.keyboard.press('Control+Shift+F')
  await win.waitFor({ timeout: 5000 })
  const box5 = await win.boundingBox()
  check(
    Math.abs(box5.x - box4.x) < 2 && Math.abs(box5.width - box4.width) < 2,
    'position/size restored after reload',
  )
  // viewport shrink re-clamps
  await page.setViewportSize({ width: 800, height: 600 })
  await page.waitForTimeout(300)
  const box6 = await win.boundingBox()
  check(
    box6.x + box6.width <= 800.5 && box6.y + box6.height <= 600.5,
    're-clamped on window resize',
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  // reset by double-click
  await win.locator('[data-tag-search-titlebar]').dblclick()
  await page.waitForTimeout(200)
  const box7 = await win.boundingBox()
  check(
    Math.abs(box7.x - box0.x) < 3 &&
      Math.abs(box7.y - box0.y) < 3 &&
      Math.abs(box7.width - 440) < 3,
    'double-click title resets to default',
  )
  check(
    (await page.evaluate(() =>
      localStorage.getItem('87studio-tag-search-window'),
    )) === null,
    'reset clears stored rect',
  )
  // Esc closes
  await input.press('Escape')
  await page.waitForTimeout(150)
  check((await win.count()) === 0, 'Esc closes the window')
  // header button opens
  await page.locator('[data-tag-search-open]').first().click()
  await win.waitFor({ timeout: 5000 })
  check(true, 'header search button opens the window')
  await win.locator('[data-tag-search-close]').click()

  // 4. Expanded editor dialog hosts the window
  const expand = page
    .locator('button[title]')
    .filter({ has: page.locator('svg') })
  const expandBtn = page.getByTitle(/expand/i).first()
  if (await expandBtn.count()) {
    await expandBtn.click()
    const dlgSearch = page
      .locator('[data-slot="dialog-content"] [data-tag-search-open]')
      .first()
    await dlgSearch.waitFor({ timeout: 8000 })
    await dlgSearch.click()
    const dwin = page.locator(
      '[data-slot="dialog-content"] [data-tag-search-window]',
    )
    await dwin.waitFor({ timeout: 5000 })
    check(true, 'expanded dialog: window opens inside the dialog')
    const dinput = dwin.locator('[data-tag-search-input]')
    await dinput.fill('blue eyes')
    await page.waitForSelector('[data-slot="dialog-content"] [data-tag-row]', {
      timeout: 10000,
    })
    await firstRowIs(page, 'blue_eyes')
    const dbox = await dwin.boundingBox()
    check(
      Math.abs(dbox.x + dbox.width - (1440 - 16)) < 4 &&
        Math.abs(dbox.y + dbox.height - (900 - 16)) < 4,
      `expanded dialog: window at its viewport position (${dbox.x},${dbox.y})`,
    )
    const vis = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y)
        return !!el?.closest('[data-tag-search-window]')
      },
      [dbox.x + dbox.width / 2, dbox.y + dbox.height / 2],
    )
    check(vis, 'expanded dialog: window is on top and clickable')
    await shot(page, 'tag-assist-1440-expanded-dialog')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  } else {
    console.log('  (no expand button found, skipping dialog check)')
  }
  void expand
  await ctx.close()
}

// ── mobile ───────────────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    hasTouch: true,
    isMobile: true,
  })
  const page = await ctx.newPage()
  attach(page)
  await page.goto(`${BASE}/generate`, { waitUntil: 'networkidle' })
  const ed = await editorOf(page)
  await ed.click()
  await page.keyboard.insertText('long ha')
  await page.waitForSelector('.cm-tooltip-autocomplete li', { timeout: 10000 })
  await page.waitForTimeout(500)
  await shot(page, 'tag-assist-390-autocomplete')
  await page.keyboard.press('Escape')
  await page.locator('[data-tag-search-open]').first().click()
  const sheet = page.locator('[data-tag-search-sheet]')
  await sheet.waitFor({ timeout: 5000 })
  const sb = await sheet.boundingBox()
  check(
    sb.width >= 389 && sb.height > 400 && sb.height < 600,
    `mobile: bottom sheet ~60vh (${sb.width}x${sb.height})`,
  )
  await sheet.locator('[data-tag-search-input]').fill('blue')
  await page.waitForSelector('[data-tag-row]', { timeout: 10000 })
  await page.waitForTimeout(500)
  await sheet.locator('[data-tab="clothing"]').click()
  await page.waitForTimeout(600)
  await shot(page, 'tag-assist-390-sheet-tabs')
  await sheet.locator('[data-tag-row]').first().click()
  await page.waitForTimeout(400)
  await sheet.locator('[data-tag-add]').click()
  await page.waitForTimeout(300)
  check(
    !!(await docText(page)).trim(),
    'mobile: Add inserts into the editor behind the sheet',
  )
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'mobile: no horizontal page scroll',
  )
  await ctx.close()
}

await browser.close()
console.log(
  `\n${failures === 0 && consoleErrors === 0 ? 'ALL PASS' : `FAILURES: ${failures}, console errors: ${consoleErrors}`}`,
)
process.exit(failures === 0 && consoleErrors === 0 ? 0 : 1)
