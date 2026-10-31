// Data manager smoke (Settings > Data): guidance panels, install / progress /
// update / re-download / checksum failure / delete for the Danbooru DB and the
// Korean data, driven against a local HTTP server that stands in for
// HuggingFace (DATA_BASE_URL).
//
// Needs a NAI_MOCK server on a throwaway data dir WITHOUT danbooru.db and with
// onboarding_completed (this script sets it). Real files are served from
// FIXTURES (a folder with danbooru.db and naia-ko-v1.db; copies, never the
// real data dir).
//
// Usage (repo root):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-mock-data
//   NAI_MOCK=1 DATA_BASE_URL=http://127.0.0.1:3199/ STUDIO_DATA_DIR=<repo>/demo-mock-data/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3198 --strictPort
//   FIXTURES=<folder> runtime/node/node.exe scripts/smoke/data.mjs http://127.0.0.1:3198 demo-mock-data/data
//
// Env: FIXTURES, FIXTURE_PORT (default 3199), PW_CORE, CHROME, SMOKE_OUT.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
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
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3198').replace(/\/$/, '')
const DATA = path.resolve(process.argv[3] ?? 'demo-mock-data/data')
const FIXTURES = process.env.FIXTURES
const FIXTURE_PORT = Number(process.env.FIXTURE_PORT ?? 3199)
const OUT = process.env.SMOKE_OUT ?? path.join(os.tmpdir(), '87studio-smoke')
fs.mkdirSync(OUT, { recursive: true })
if (!FIXTURES)
  throw new Error(
    'FIXTURES (folder with danbooru.db, naia-ko-v1.db) is required',
  )

let failures = 0
const check = (cond, msg) => {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
  return !!cond
}
const exists = (...p) => fs.existsSync(path.join(DATA, ...p))

// ── fixture server ───────────────────────────────────────────────────────────
const sha = (file) =>
  new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    fs.createReadStream(file)
      .on('data', (c) => h.update(c))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')))
  })
const danFile = path.join(FIXTURES, 'danbooru.db')
const koFile = path.join(FIXTURES, 'naia-ko-v1.db')
const danInfo = { size: fs.statSync(danFile).size, sha256: await sha(danFile) }
const koInfo = { size: fs.statSync(koFile).size, sha256: await sha(koFile) }

// name -> source file served under that name
const served = new Map([
  ['danbooru.db', danFile],
  ['naia-ko-v1.db', koFile],
  ['naia-ko-v2.db', koFile],
  ['naia-ko-v3.db', koFile],
])
let manifest = makeManifest({ ko: { version: '1', name: 'naia-ko-v1.db' } })
function makeManifest({ ko, koSha }) {
  return {
    schema: 1,
    files: {
      danbooru: {
        version: '1',
        files: [{ name: 'danbooru.db', ...danInfo }],
      },
      ko: {
        version: ko.version,
        requires: ['danbooru'],
        files: [
          { name: ko.name, size: koInfo.size, sha256: koSha ?? koInfo.sha256 },
        ],
      },
    },
  }
}
const requests = []
const fixtureServer = http.createServer((req, res) => {
  const name = decodeURIComponent((req.url ?? '/').slice(1).split('?')[0])
  requests.push(name)
  if (name === 'data-manifest.json') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(manifest))
    return
  }
  const file = served.get(name)
  if (!file) {
    res.writeHead(404)
    res.end()
    return
  }
  const size = fs.statSync(file).size
  res.writeHead(200, { 'content-length': size })
  const stream = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })
  const throttle = name === 'danbooru.db'
  stream.on('data', (chunk) => {
    if (!throttle) return void res.write(chunk)
    stream.pause()
    res.write(chunk, () => setTimeout(() => stream.resume(), 120))
  })
  stream.on('end', () => res.end())
  res.on('close', () => stream.destroy())
})
await new Promise((r) => fixtureServer.listen(FIXTURE_PORT, '127.0.0.1', r))

// ── setup ────────────────────────────────────────────────────────────────────
const sdb = new Database(path.join(DATA, 'studio.db'))
sdb
  .prepare(
    "INSERT INTO settings(key, value) VALUES('onboarding_completed','true') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
  .run()
sdb.close()
check(!exists('danbooru.db'), 'precondition: data dir has no danbooru.db')

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
let consoleErrors = 0

async function newPage(w, h, locale) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  await ctx.addInitScript((loc) => {
    try {
      localStorage.setItem('87studio-locale', loc)
    } catch {
      /* ignore */
    }
  }, locale)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !/favicon|Failed to load resource/.test(m.text())
    ) {
      consoleErrors++
      console.log('  console error:', m.text().slice(0, 200))
    }
  })
  return { ctx, page }
}
const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}
const row = (page, key) => page.locator(`[data-dataset="${key}"]`)
async function openSettingsData(page) {
  await page.goto(`${BASE}/settings#settings-data`, {
    waitUntil: 'networkidle',
  })
  await page.locator('[data-data-card]').waitFor({ timeout: 15000 })
  await row(page, 'danbooru').waitFor()
}
async function waitState(page, key, state, timeout = 90000) {
  await page
    .locator(`[data-dataset="${key}"][data-state="${state}"]`)
    .waitFor({ timeout })
}
async function openTagSearch(page) {
  await page.keyboard.press('Control+Shift+F')
  await page
    .locator('[data-tag-search-input], [data-needs-tag-data]')
    .first()
    .waitFor({ timeout: 10000 })
  await page.waitForTimeout(1200) // the installed check resolves after the panel opens
}

// ── desktop, English ─────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage(1440, 900, 'en')
  console.log('== guidance without data (en 1440)')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const hint = page.locator('[data-data-hint]')
  await hint.waitFor({ timeout: 15000 })
  check(await hint.isVisible(), 'dashboard shows the tag-data hint')
  await shot(page, 'data-dashboard-hint-1440')
  await page.locator('[data-data-hint-dismiss]').click()
  check((await hint.count()) === 0, 'hint dismisses')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  check((await hint.count()) === 0, 'dismissal is remembered after reload')

  await openTagSearch(page)
  check(
    await page.locator('[data-needs-tag-data]').first().isVisible(),
    'Tag Search shows the needs-data panel',
  )
  await shot(page, 'data-tagsearch-needs-1440')
  await page.keyboard.press('Escape')

  console.log('== Settings > Data (nothing installed)')
  await openSettingsData(page)
  for (const k of ['danbooru', 'ko', 'semantic']) {
    check(
      (await row(page, k).getAttribute('data-state')) === 'notInstalled',
      `${k}: not installed`,
    )
  }
  check(
    await row(page, 'danbooru').locator('[data-dataset-install]').isEnabled(),
    'danbooru: install enabled',
  )
  for (const k of ['ko', 'semantic']) {
    check(
      await row(page, k).locator('[data-dataset-needs]').isVisible(),
      `${k}: shows "Danbooru tag database is needed first"`,
    )
    check(
      await row(page, k).locator('[data-dataset-install]').isDisabled(),
      `${k}: install disabled`,
    )
  }
  check(
    await page.locator('[data-semantic-switch]').first().isDisabled(),
    'natural-language switch disabled without the DB',
  )
  await shot(page, 'data-settings-empty-1440')

  console.log('== install Danbooru DB')
  await row(page, 'danbooru').locator('[data-dataset-install]').click()
  await waitState(page, 'danbooru', 'downloading', 15000)
  await page.waitForFunction(
    () =>
      /\d+%/.test(
        document.querySelector(
          '[data-dataset="danbooru"] [data-dataset-state-text]',
        )?.textContent ?? '',
      ),
    null,
    { timeout: 20000 },
  )
  check(true, 'danbooru: progress percentage shown while downloading')
  await shot(page, 'data-settings-downloading-1440')
  // survives a reload (state lives in the server)
  await page.reload({ waitUntil: 'networkidle' })
  await row(page, 'danbooru').waitFor()
  check(
    (await row(page, 'danbooru').getAttribute('data-state')) === 'downloading',
    'download state survives a page reload',
  )
  await waitState(page, 'danbooru', 'installed')
  check(exists('danbooru.db'), 'danbooru.db written')
  check(!exists('danbooru.db.tmp'), 'no .tmp left behind')
  check(
    fs.readFileSync(path.join(DATA, 'danbooru.db.version'), 'utf8').trim() ===
      '1',
    'danbooru.db.version = 1',
  )
  check(
    !(await row(page, 'ko').locator('[data-dataset-install]').isDisabled()),
    'ko: install enabled once the DB exists',
  )

  console.log('== autocomplete + Tag Search work')
  await page.goto(`${BASE}/generate`, { waitUntil: 'networkidle' })
  const cm = page.locator('.cm-content').first()
  await cm.waitFor({ timeout: 15000 })
  await cm.click()
  await page.keyboard.type('long_hai', { delay: 40 })
  await page
    .locator('.cm-tooltip-autocomplete li')
    .first()
    .waitFor({ timeout: 10000 })
  const opts = await page
    .locator('.cm-tooltip-autocomplete li')
    .allTextContents()
  check(
    opts.some((o) => o.includes('long hair') || o.includes('long_hair')),
    `autocomplete offers long_hair (${opts.length} rows)`,
  )
  await page.keyboard.press('Escape')
  await openTagSearch(page)
  check(
    (await page.locator('[data-needs-tag-data]').count()) === 0,
    'Tag Search no longer shows the needs-data panel',
  )
  await ctx.close()
}

// ── Korean locale ────────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage(1440, 900, 'ko')
  console.log('== Korean data (ko 1440)')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await openTagSearch(page)
  const koHint = page.locator('[data-ko-hint]')
  await koHint.waitFor({ timeout: 10000 })
  check(await koHint.isVisible(), 'Korean hint shown in Tag Search (ko locale)')
  await shot(page, 'data-tagsearch-ko-hint-1440')
  await page.locator('[data-ko-hint-install]').click()
  await koHint.waitFor({ state: 'detached', timeout: 60000 })
  check(
    exists('naia-ko-v1.db'),
    'naia-ko-v1.db installed (hint goes away once installed)',
  )
  const input = page.locator('[data-tag-search-input]')
  await input.fill('긴 머리')
  await page.waitForTimeout(1200)
  const names = await page.locator('[data-tag-results]').innerText()
  check(/long.hair/.test(names), 'Korean search finds long_hair')
  await page.keyboard.press('Escape')

  console.log('== update available')
  await openSettingsData(page)
  check(
    (await row(page, 'ko').getAttribute('data-state')) === 'installed',
    'ko: installed (latest)',
  )
  manifest = makeManifest({ ko: { version: '2', name: 'naia-ko-v2.db' } })
  await page.locator('[data-data-check]').click()
  await waitState(page, 'ko', 'updateAvailable', 15000)
  check(true, 'ko: update available after "check for updates"')
  check(
    (await page.locator('[data-data-checked]').innerText()).includes(
      '마지막 확인',
    ),
    'last-checked line shown',
  )
  check(
    (await page.locator('[data-nav-dot]').count()) > 0,
    'sidebar Settings item shows the update dot',
  )
  await shot(page, 'data-settings-update-1440')
  await row(page, 'ko').locator('[data-dataset-update]').click()
  await waitState(page, 'ko', 'installed', 60000)
  check(
    exists('naia-ko-v2.db') && !exists('naia-ko-v1.db'),
    'v2 installed, v1 removed',
  )
  check(
    (await row(page, 'ko').innerText()).includes('v2'),
    'ko row shows installed v2',
  )
  check(
    (await page.locator('[data-nav-dot]').count()) === 0,
    'update dot gone after updating',
  )

  console.log('== re-download')
  const before = fs.statSync(path.join(DATA, 'naia-ko-v2.db')).mtimeMs
  const fetched = requests.filter((r) => r === 'naia-ko-v2.db').length
  await row(page, 'ko').locator('[data-dataset-redownload]').click()
  await page.waitForTimeout(1500)
  await waitState(page, 'ko', 'installed')
  check(
    requests.filter((r) => r === 'naia-ko-v2.db').length === fetched + 1,
    're-download fetched the file again',
  )
  check(
    fs.statSync(path.join(DATA, 'naia-ko-v2.db')).mtimeMs >= before,
    're-downloaded file replaced',
  )

  console.log('== checksum failure keeps the old file')
  manifest = makeManifest({
    ko: { version: '3', name: 'naia-ko-v3.db' },
    koSha: 'f'.repeat(64),
  })
  await page.locator('[data-data-check]').click()
  await waitState(page, 'ko', 'updateAvailable', 15000)
  await row(page, 'ko').locator('[data-dataset-update]').click()
  await waitState(page, 'ko', 'error', 30000)
  const errText = await row(page, 'ko').innerText()
  check(
    /체크섬|Checksum/i.test(errText),
    `error state shows the failure (${errText.split('\n').find((l) => /Checksum|오류/.test(l))})`,
  )
  check(exists('naia-ko-v2.db'), 'old Korean file kept')
  check(
    !exists('naia-ko-v3.db') && !exists('naia-ko-v3.db.tmp'),
    'no v3 / tmp left',
  )
  await shot(page, 'data-settings-error-1440')
  // the failed update left the old data usable
  manifest = makeManifest({ ko: { version: '2', name: 'naia-ko-v2.db' } })
  await page.locator('[data-data-check]').click()
  await waitState(page, 'ko', 'installed', 15000)

  console.log('== delete Korean data')
  await row(page, 'ko').locator('[data-dataset-delete]').click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /삭제/ })
    .click()
  await waitState(page, 'ko', 'notInstalled', 15000)
  check(!exists('naia-ko-v2.db'), 'Korean file removed')

  console.log('== delete Danbooru DB (confirm warns)')
  await row(page, 'danbooru').locator('[data-dataset-delete]').click()
  const dlg = page.getByRole('alertdialog')
  await dlg.waitFor()
  const dlgText = await dlg.innerText()
  check(
    /자동완성/.test(dlgText) &&
      /한국어/.test(dlgText) &&
      /자연어/.test(dlgText),
    'confirm dialog warns about tag assist, Korean data and natural-language search',
  )
  await shot(page, 'data-settings-delete-confirm-1440')
  await dlg.getByRole('button', { name: /삭제/ }).click()
  await waitState(page, 'danbooru', 'notInstalled', 15000)
  check(
    !exists('danbooru.db') && !exists('danbooru.db.version'),
    'danbooru files removed',
  )
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await openTagSearch(page)
  check(
    await page.locator('[data-needs-tag-data]').first().isVisible(),
    'needs-data panel is back in Tag Search',
  )
  await ctx.close()
}

// ── mobile screenshots ───────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage(390, 844, 'ko')
  console.log('== mobile (ko 390)')
  await page.goto(`${BASE}/settings#settings-data`, {
    waitUntil: 'networkidle',
  })
  await row(page, 'danbooru').waitFor({ timeout: 15000 })
  await row(page, 'danbooru').scrollIntoViewIfNeeded()
  await shot(page, 'data-settings-390')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )
  check(!overflow, 'no horizontal page scroll at 390')
  await page.goto(`${BASE}/tags`, { waitUntil: 'networkidle' })
  await page.evaluate(() =>
    localStorage.removeItem('87studio-data-hint-dismissed'),
  )
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.locator('[data-data-hint]').waitFor({ timeout: 10000 })
  await shot(page, 'data-dashboard-hint-390')
  await ctx.close()
}

await browser.close()
fixtureServer.close()
console.log(`console errors: ${consoleErrors}`)
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
