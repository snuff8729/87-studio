// Tag assist smoke: autocomplete rows + info panel, caret tag card, floating
// Tag Search window (shortcut, drag/resize/persist/reset, add to last editor,
// category tabs), mobile sheet, expanded-editor dialog.
//
// Needs a server whose data dir holds the real danbooru.db (copy it into the
// throwaway dir) and a studio.db with onboarding_completed=true. Writes
// nothing except localStorage in the browser context.
//
// Korean tag data (NAIA2.0): the English/mobile sections run WITHOUT it (rule
// based fallback categories). Before the Korean section the script copies the
// built naia-ko-v1.db (env KO_DB, default <SMOKE_OUT>/../naia-ko-upload/) into
// the data dir; the running server picks it up lazily.
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

// the sections before the Korean one expect the rule-based fallback: drop a
// Korean db left by an earlier run (use a fresh server per run)
try {
  fs.rmSync(path.join(DATA, 'naia-ko-v1.db'), { force: true })
} catch {
  /* held open by a running server */
}

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

// SMOKE_ONLY=ko runs just the Korean tag data section
const ONLY_KO = process.env.SMOKE_ONLY === 'ko'

// ── desktop ──────────────────────────────────────────────────────────────────
if (!ONLY_KO) {
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
  await page.locator('.cm-content').first().focus()
  await page.keyboard.press('Escape')
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

  // 2b. Caret card regressions (user report: "shows, then at some point stops")
  {
    const errsBefore = consoleErrors
    const cardTitle = async () =>
      (await page
        .locator('.cm-tag-card .cm-tag-info-title')
        .first()
        .innerText()
        .catch(() => null)) ?? null
    const waitCard = async (title, ms = 5000) => {
      try {
        await page.waitForFunction(
          (t) =>
            [...document.querySelectorAll('.cm-tag-card .cm-tag-info-title')]
              .map((n) => n.textContent)
              .includes(t),
          title,
          { timeout: ms },
        )
        return true
      } catch {
        return false
      }
    }
    // Click the middle of a word inside editor `idx`
    const clickWord = async (idx, w) => {
      const box = await page
        .locator('.cm-content')
        .nth(idx)
        .evaluate((c, w) => {
          const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT)
          let n
          while ((n = walker.nextNode())) {
            const i = n.data.indexOf(w)
            if (i >= 0) {
              const r = document.createRange()
              const m = i + Math.floor(w.length / 2)
              r.setStart(n, m)
              r.setEnd(n, m + 1)
              const b = r.getBoundingClientRect()
              return { x: b.x + 1, y: b.y + b.height / 2 }
            }
          }
          return null
        }, w)
      if (!box) throw new Error(`word not found: ${w}`)
      await page.mouse.click(box.x, box.y)
    }
    const setDocN = async (idx, text) => {
      const e = page.locator('.cm-content').nth(idx)
      await page.keyboard.press('Escape')
      await e.focus()
      await page.keyboard.press('Control+A')
      await page.keyboard.press('Delete')
      if (text) await page.keyboard.insertText(text)
      await page.keyboard.press('Escape')
    }
    await page.evaluate(() => localStorage.removeItem('87studio-tag-card-pos'))

    // R1: blur used to throw inside CodeMirror's update() and kill the plugin
    await setDocN(0, 'long hair, smile')
    await setDocN(1, 'bad hands, blurry')
    await clickWord(0, 'long hair')
    check(await waitCard('long hair'), 'R1: card shows (editor 1)')
    await page.locator('.cm-content').nth(1).focus()
    await page.waitForTimeout(400)
    check(
      (await page.locator('.cm-tag-card').count()) === 0,
      'R1: card hides when the editor loses focus',
    )
    await page.locator('.cm-content').nth(0).focus()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('ArrowRight')
    check(
      await waitCard('long hair'),
      'R1: card works again in the editor that lost focus (plugin not dead)',
    )
    await page.locator('.cm-content').nth(1).focus()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('ArrowRight')
    check(await waitCard('bad hands'), 'R1: card shows in the second editor')
    check(
      consoleErrors === errsBefore,
      'R1: no CodeMirror plugin crash in console',
    )

    // R2: Esc, then click the same spot again
    await setDocN(0, 'long hair, smile')
    await clickWord(0, 'smile')
    check(await waitCard('smile'), 'R2: card shows on click')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    check((await page.locator('.cm-tag-card').count()) === 0, 'R2: Esc hides')
    await clickWord(0, 'smile')
    check(
      await waitCard('smile'),
      'R2: clicking the same spot after Esc shows the card again',
    )

    // R3: tags on later lines (newline is a separator)
    await setDocN(0, 'solo, hat\nlong hair\n\nsmile')
    await clickWord(0, 'hat')
    check(await waitCard('hat'), 'R3: tag at end of line 1 (before newline)')
    await page.keyboard.press('Escape')
    await clickWord(0, 'long hair')
    check(await waitCard('long hair'), 'R3: tag alone on line 2')
    await page.keyboard.press('Escape')
    await clickWord(0, 'smile')
    check(await waitCard('smile'), 'R3: tag after a blank line')

    // R4: syntax variants
    await setDocN(
      0,
      '1.2::long hair::, {blue eyes}, [smile], (red hair), long_hair, Long Hair, solo',
    )
    for (const [w, want] of [
      ['red hair', 'red hair'],
      ['blue eyes', 'blue eyes'],
      ['smile', 'smile'],
      ['long_hair', 'long hair'],
      ['Long Hair', 'long hair'],
    ]) {
      await clickWord(0, w)
      check(await waitCard(want), `R4: syntax ${w} -> ${want}`)
    }
    await setDocN(0, '@{slot:pose}, @{bundle:b}, smile')
    await clickWord(0, 'smile')
    check(await waitCard('smile'), 'R4: tag next to @{...} references')

    // R5: toggle off/on, then click the same spot
    await setDocN(0, 'long hair, smile')
    const toggle = page.locator('[data-tag-info-toggle]').first()
    await clickWord(0, 'long hair')
    check(await waitCard('long hair'), 'R5: card shows before toggling')
    await toggle.click()
    check(
      (await toggle.getAttribute('data-state')) === 'off',
      'R5: toggle reports off',
    )
    check(
      /off/i.test((await toggle.getAttribute('title')) ?? ''),
      'R5: off tooltip says "Tag info card: off"',
    )
    check(
      (await page.locator('.cm-tag-card').count()) === 0,
      'R5: toggling off removes the card',
    )
    await page.waitForTimeout(400)
    await shot(page, 'tag-assist-1440-toggle-off')
    await toggle.click()
    await clickWord(0, 'long hair')
    check(
      await waitCard('long hair'),
      'R5: after off->on, clicking the same spot shows the card',
    )

    // R6: a failed lookup is not cached forever
    await setDocN(0, 'long hair, smile, blue eyes')
    await page.route('**/_serverFn/**', (r) => r.abort())
    await clickWord(0, 'blue eyes')
    await page.waitForTimeout(900)
    check(
      (await page.locator('.cm-tag-card').count()) === 0,
      'R6: no card while the request fails',
    )
    await page.unroute('**/_serverFn/**')
    await clickWord(0, 'smile')
    await clickWord(0, 'blue eyes')
    check(
      await waitCard('blue eyes'),
      'R6: same tag works after the failure (failure not cached)',
    )

    // R7: window blur / refocus brings the card back
    await clickWord(0, 'long hair')
    check(await waitCard('long hair'), 'R7: card shows')
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForTimeout(700)
    check(
      (await page.locator('.cm-tag-card').count()) >= 1,
      'R7: card present after window blur/focus',
    )
  }

  // 2c. Remote sections (TAG_REMOTE_MOCK) + alternatives
  {
    await page.evaluate(() => localStorage.removeItem('87studio-tag-card-pos'))
    const e = page.locator('.cm-content').first()
    await page.keyboard.press('Escape')
    await e.focus()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.insertText('long hair, smile, solo')
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('ArrowRight')
    const c = page.locator('.cm-tag-card')
    await c.waitFor({ timeout: 6000 })
    for (const kind of ['related', 'together', 'ratings']) {
      await c
        .locator(`[data-tag-remote="${kind}"][data-state="ok"]`)
        .waitFor({ timeout: 8000 })
      check(true, `remote section ${kind} loaded`)
    }
    check(
      (await c.locator('[data-tag-remote="related"] .cm-tag-chip').count()) >=
        3,
      'Recommended has chips',
    )
    check(
      (await c.locator('[data-tag-remote="together"] .cm-tag-chip').count()) >=
        3,
      'Used together has chips',
    )
    check(
      (await c.locator('.cm-tag-rating').count()) === 4,
      'Rating counts has 4 cells (G/S/Q/E)',
    )
    const ratingText = await c.locator('.cm-tag-ratings').innerText()
    check(
      /General/.test(ratingText) &&
        /Sensitive/.test(ratingText) &&
        /Questionable/.test(ratingText) &&
        /Explicit/.test(ratingText),
      'rating labels present',
    )
    const alt = c.locator('[data-tag-section="alternatives"]')
    check(
      (await alt.count()) === 1 && /very long hair/.test(await alt.innerText()),
      'Alternatives lists "very long hair" for long hair',
    )
    await shot(page, 'tag-assist-1440-card-sections')
    // remote chip click inserts
    const rchip = c.locator('[data-tag-remote="related"] .cm-tag-chip').first()
    const rname = (await rchip.innerText()).trim()
    await rchip.click()
    await page.waitForTimeout(200)
    check(
      (await docText(page)).startsWith(`long hair, ${rname}, smile`),
      `Recommended chip inserts after the token (${rname})`,
    )

    // Failure of one section + retry ("solo" Recommended fails on a fresh server)
    await page.keyboard.press('Control+End')
    await page.keyboard.press('ArrowLeft')
    const c2 = page.locator('.cm-tag-card')
    await c2.waitFor({ timeout: 6000 })
    const err = c2.locator('[data-tag-remote="related"][data-state="error"]')
    const sawError = await err
      .waitFor({ timeout: 4000 })
      .then(() => true)
      .catch(() => false)
    check(
      sawError,
      'failed section shows "Couldn\'t load" (solo / fresh server)',
    )
    if (sawError) {
      check(
        /Couldn't load/.test(await err.innerText()) &&
          (await c2
            .locator('[data-tag-remote="together"][data-state="ok"]')
            .count()) === 1,
        'only the failed section errors; other sections loaded',
      )
      await err.locator('button').click()
      await c2
        .locator('[data-tag-remote="related"][data-state="ok"]')
        .waitFor({ timeout: 6000 })
      check(true, 'retry button reloads the section')
    }
  }

  // 2d. Draggable / pinned card
  {
    await page.evaluate(() => localStorage.removeItem('87studio-tag-card-pos'))
    const e = page.locator('.cm-content').first()
    await page.keyboard.press('Escape')
    await e.focus()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.insertText('long hair, smile, 1girl')
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('ArrowRight')
    const card = page.locator('.cm-tag-card')
    await card.waitFor({ timeout: 6000 })
    const head = card.locator('[data-tag-card-head]')
    const hb = await head.boundingBox()
    const cb = await card.boundingBox()
    await page.mouse.move(hb.x + 20, hb.y + 6)
    await page.mouse.down()
    await page.mouse.move(hb.x - 120, hb.y + 160, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(250)
    const pinned = page.locator('[data-tag-card-pinned] .cm-tag-card')
    check((await pinned.count()) === 1, 'dragging the header pins the card')
    check(
      (await page.locator('.cm-tag-card:not([data-pinned])').count()) === 0,
      'follow-mode tooltip card is gone while pinned',
    )
    const stored = await page.evaluate(() =>
      localStorage.getItem('87studio-tag-card-pos'),
    )
    check(!!stored, `position persisted (${stored})`)
    const pb = await page.locator('[data-tag-card-pinned]').boundingBox()
    check(
      Math.abs(pb.x - Math.max(4, cb.x - 140)) < 6 &&
        Math.abs(pb.y - (cb.y + 154)) < 6,
      `card moved with the pointer (${pb.x | 0},${pb.y | 0})`,
    )
    check(
      (await pinned.locator('[data-tag-card-pin]').count()) === 1,
      'pin indicator shown',
    )
    // content follows the caret while the position stays
    await e.focus()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(
      () =>
        document.querySelector('[data-tag-card-pinned] .cm-tag-info-title')
          ?.textContent === '1girl',
      null,
      { timeout: 6000 },
    )
    const pb2 = await page.locator('[data-tag-card-pinned]').boundingBox()
    check(
      Math.abs(pb2.x - pb.x) < 1 && Math.abs(pb2.y - pb.y) < 1,
      'pinned card keeps its place while content follows the caret (1girl)',
    )
    await shot(page, 'tag-assist-1440-card-pinned')

    // survives a reload
    await page.reload({ waitUntil: 'networkidle' })
    const e2 = await editorOf(page)
    await e2.focus()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    await page.keyboard.insertText('long hair, smile')
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('ArrowRight')
    await page
      .locator('[data-tag-card-pinned] .cm-tag-card')
      .waitFor({ timeout: 8000 })
    const pb3 = await page.locator('[data-tag-card-pinned]').boundingBox()
    check(
      Math.abs(pb3.x - pb.x) < 2 && Math.abs(pb3.y - pb.y) < 2,
      'pinned position restored after reload',
    )
    // clamped into the viewport
    const h3 = await page
      .locator('[data-tag-card-pinned] [data-tag-card-head]')
      .boundingBox()
    await page.mouse.move(h3.x + 20, h3.y + 6)
    await page.mouse.down()
    await page.mouse.move(-400, -400, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    const pb4 = await page.locator('[data-tag-card-pinned]').boundingBox()
    check(
      pb4.x >= 3 && pb4.y >= 3,
      `dragging off-screen is clamped (${pb4.x | 0},${pb4.y | 0})`,
    )
    await page.mouse.move(h3.x, h3.y)
    const h4 = await page
      .locator('[data-tag-card-pinned] [data-tag-card-head]')
      .boundingBox()
    await page.mouse.move(h4.x + 20, h4.y + 6)
    await page.mouse.down()
    await page.mouse.move(5000, 5000, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    const pb5 = await page.locator('[data-tag-card-pinned]').boundingBox()
    check(
      pb5.x + pb5.width <= 1440 && pb5.y + pb5.height <= 900,
      'dragging past the bottom-right is clamped',
    )
    // double-click header = unpin
    await page.locator('[data-tag-card-pinned] [data-tag-card-head]').dblclick()
    await page.waitForTimeout(500)
    check(
      (await page.locator('[data-tag-card-pinned]').count()) === 0 &&
        (await page.evaluate(() =>
          localStorage.getItem('87studio-tag-card-pos'),
        )) === null,
      'double-click header unpins (stored position cleared)',
    )
    await page.locator('.cm-tag-card:not([data-pinned])').first().waitFor({
      timeout: 6000,
    })
    check(true, 'after unpin the card follows the caret again')
    await page.keyboard.press('Escape')
  }

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

  // detail pane: Danbooru-backed sections + alternatives
  {
    const detail = win.locator('[data-tag-detail]')
    for (const kind of ['related', 'together', 'ratings']) {
      await detail
        .locator(`[data-tag-section="${kind}"][data-remote-state="ok"]`)
        .waitFor({ timeout: 8000 })
      check(true, `Tag Search detail: ${kind} section loaded`)
    }
    await input.fill('long hair')
    await firstRowIs(page, 'long_hair')
    await detail
      .locator('[data-tag-section="ratings"][data-remote-state="ok"]')
      .waitFor({ timeout: 8000 })
    check(
      /very long hair/.test(
        await detail
          .locator('div', { hasText: 'Alternatives' })
          .first()
          .innerText(),
      ),
      'Tag Search detail: Alternatives lists very long hair',
    )
    await detail
      .locator('.overflow-y-auto')
      .first()
      .evaluate((n) => n.scrollTo(0, n.scrollHeight))
    await page.waitForTimeout(200)
    await shot(page, 'tag-assist-1440-search-detail-sections')
    await input.fill('smile')
    await firstRowIs(page, 'smile')
  }

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
  await win.locator('[data-tab="fashion"]').click()
  await page.waitForTimeout(700)
  const clothingRows = await win
    .locator('[data-tag-row]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-tag-row')))
  check(
    clothingRows.length > 5 && clothingRows.every((n) => /skirt/.test(n)),
    `fashion tab filters (${clothingRows.length} rows)`,
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

// ── Korean tag data (NAIA2.0) ────────────────────────────────────────────────
{
  const KO_DB =
    process.env.KO_DB ?? path.join(OUT, '..', 'naia-ko-upload', 'naia-ko-v1.db')
  check(fs.existsSync(KO_DB), `Korean tag db built (${KO_DB})`)
  const target = path.join(DATA, 'naia-ko-v1.db')
  fs.copyFileSync(KO_DB, target + '.tmp')
  fs.renameSync(target + '.tmp', target)
  const GROUPS = [
    '의상/패션',
    '신체/외형',
    '포즈/동작',
    '표정/감정',
    '배경/장소',
    '사물/오브젝트',
    '인물/종족',
    '상황/연출',
    '컨셉/스타일',
    '표현/연출',
    '성적 요소',
    '기타',
  ]

  for (const [name, viewport, mobile] of [
    ['1440', { width: 1440, height: 900 }, false],
    ['390', { width: 390, height: 844 }, true],
  ]) {
    const ctx = await browser.newContext({
      viewport,
      locale: 'ko-KR',
      ...(mobile ? { hasTouch: true, isMobile: true } : {}),
    })
    const page = await ctx.newPage()
    attach(page)
    await page.goto(`${BASE}/generate`, { waitUntil: 'networkidle' })
    await editorOf(page)
    const rows = page.locator('.cm-tooltip-autocomplete li')

    // Korean keyword autocomplete: hint shown, English tag inserted
    await setDoc(page, '줄무늬')
    await rows.first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(500)
    const first = await rows.first().innerText()
    check(
      /striped/.test(first),
      `${name}: "줄무늬" offers striped first (${first.replace(/\n/g, ' ')})`,
    )
    const hint = await rows
      .first()
      .locator('.cm-tag-alias')
      .innerText()
      .catch(() => '')
    check(/줄무늬/.test(hint), `${name}: row shows the Korean keyword hint`)
    const badge = await rows.first().locator('.cm-tag-badge').innerText()
    check(
      badge === '무늬',
      `${name}: override-only tag shows its group token, not a rule label (${badge})`,
    )
    await shot(page, `tag-ko-${name}-autocomplete`)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    check(
      (await docText(page)).trim() === 'striped',
      `${name}: Enter inserts the English tag`,
    )

    // spaced keyword
    await setDoc(page, '긴 머리')
    await rows.first().waitFor({ timeout: 10000 })
    await page.waitForTimeout(400)
    check(
      /long hair/.test(await rows.first().innerText()),
      `${name}: "긴 머리" finds long hair`,
    )
    await page.keyboard.press('Escape')

    // Caret card: Korean NAIA description + source label
    await setDoc(page, 'long hair, smile')
    await page.keyboard.press('Home')
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    const card = page.locator('.cm-tag-card')
    await card.waitFor({ timeout: 8000 })
    const desc = await card.locator('.cm-tag-desc').innerText()
    check(
      /[가-힣]/.test(desc),
      `${name}: card description is Korean (${desc.slice(0, 30)})`,
    )
    check(
      (await card.locator('.cm-tag-source').count()) === 0,
      `${name}: no source label on the card`,
    )
    await shot(page, `tag-ko-${name}-card`)
    await page.keyboard.press('Escape')

    // Tag Search
    if (mobile) await page.locator('[data-tag-search-open]').first().click()
    else await page.keyboard.press('Control+Shift+F')
    const win = page.locator(
      mobile ? '[data-tag-search-sheet]' : '[data-tag-search-window]',
    )
    await win.waitFor({ timeout: 5000 })
    const input = win.locator('[data-tag-search-input]')
    await input.fill('줄무늬')
    await firstRowIs(page, 'striped')
    await page.waitForTimeout(300)
    const names = await win
      .locator('[data-tag-row]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-tag-row')))
    check(
      names[0] === 'striped',
      `${name}: Tag Search "줄무늬" -> striped first (${names.slice(0, 4)})`,
    )
    check(
      (await win.locator('[data-tag-via]').first().innerText()).includes(
        '줄무늬',
      ),
      `${name}: Tag Search row shows keyword hint`,
    )
    await win.locator('[data-tag-row]').first().click()
    await page.waitForTimeout(800)
    check(
      (await win.locator('[data-tag-source]').count()) === 0,
      `${name}: detail pane shows no source label`,
    )
    await shot(page, `tag-ko-${name}-search`)

    // NAIA group tabs + Korean small categories
    await input.fill('')
    const labels = await win
      .locator('[data-tag-tabs] [data-tab]')
      .evaluateAll((els) => els.map((e) => e.textContent))
    check(
      GROUPS.every((l) => labels.includes(l)),
      `${name}: tabs show the 12 NAIA groups`,
    )
    await win.locator('[data-tab="fashion"]').click()
    await page.waitForTimeout(900)
    check(
      (await win.locator('[data-tag-row]').count()) > 10,
      `${name}: fashion group lists tags`,
    )
    const subs = await win.locator('[data-tab^="ko:"]').count()
    check(subs >= 3, `${name}: Korean small-category chips shown (${subs})`)
    await win.locator('[data-tab^="ko:"]').nth(1).click()
    await page.waitForTimeout(900)
    check(
      (await win.locator('[data-tag-row]').count()) > 0,
      `${name}: small-category chip filters`,
    )
    await shot(page, `tag-ko-${name}-groups`)
    await ctx.close()
  }

  // English locale: wiki description, no NAIA label, group label only
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
    })
    const page = await ctx.newPage()
    attach(page)
    await page.goto(`${BASE}/generate`, { waitUntil: 'networkidle' })
    await editorOf(page)
    await setDoc(page, 'long hair, smile')
    await page.keyboard.press('Home')
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    const card = page.locator('.cm-tag-card')
    await card.waitFor({ timeout: 8000 })
    check(
      (await card.locator('.cm-tag-source').count()) === 0,
      'en: no NAIA label on the card',
    )
    check(
      !/[가-힣]/.test(await card.locator('.cm-tag-desc').innerText()),
      'en: card keeps the English wiki description',
    )
    check(
      /Body/.test(await card.locator('.cm-tag-badge').nth(1).innerText()),
      'en: fine badge shows the NAIA group label',
    )
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+Shift+F')
    const win = page.locator('[data-tag-search-window]')
    await win.waitFor({ timeout: 5000 })
    check(
      (await win.locator('[data-tab="fashion"]').innerText()) === 'Fashion',
      'en: group tab label is English',
    )
    await win.locator('[data-tab="fashion"]').click()
    await page.waitForTimeout(700)
    check(
      (await win.locator('[data-tab^="ko:"]').count()) === 0,
      'en: no Korean-only sub chips',
    )
    await ctx.close()
  }

  // Settings
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'ko-KR',
    })
    const page = await ctx.newPage()
    attach(page)
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    const st = page.locator('[data-ko-tags-status]')
    await st.waitFor({ timeout: 10000 })
    await page
      .waitForFunction(
        () =>
          document
            .querySelector('[data-ko-tags-status]')
            ?.getAttribute('data-ko-tags-status') === 'ready',
        null,
        { timeout: 15000 },
      )
      .catch(() => {})
    check(
      (await st.getAttribute('data-ko-tags-status')) === 'ready',
      'settings: Korean tag data status ready',
    )
    await page.locator('[data-ko-tags-card]').scrollIntoViewIfNeeded()
    await shot(page, 'tag-ko-1440-settings')
    await ctx.close()
  }
}

// ── mobile ───────────────────────────────────────────────────────────────────
if (!ONLY_KO) {
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
  await sheet.locator('[data-tab="fashion"]').click()
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
  // card: no drag on mobile
  await page.goto(`${BASE}/generate`, { waitUntil: 'networkidle' })
  await editorOf(page)
  await page.locator('.cm-content').first().focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText('long hair, smile')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowRight')
  const mcard = page.locator('.cm-tag-card')
  await mcard.waitFor({ timeout: 8000 })
  await mcard
    .locator('[data-tag-remote="ratings"][data-state="ok"]')
    .waitFor({ timeout: 8000 })
  const mh = await mcard.locator('[data-tag-card-head]').boundingBox()
  await page.mouse.move(mh.x + 20, mh.y + 6)
  await page.mouse.down()
  await page.mouse.move(mh.x + 20, mh.y + 120, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  check(
    (await page.locator('[data-tag-card-pinned]').count()) === 0 &&
      (await page.evaluate(() =>
        localStorage.getItem('87studio-tag-card-pos'),
      )) === null,
    'mobile: dragging the card header does not pin it',
  )
  await shot(page, 'tag-assist-390-card-sections')
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
