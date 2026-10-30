// Natural-language tag search smoke (mock embedder; no model download).
//
// Needs a dev server started with SEMANTIC_MOCK=1 and
// SEMANTIC_INDEX_URL=http://127.0.0.1:<indexPort>/ on a throwaway data dir that
// holds the real danbooru.db (copied in) and a studio.db with
// onboarding_completed=true. This script builds a tiny mock index with
// scripts/build-tag-index.mjs --mock and serves it itself (first request
// fails once to exercise Error + Retry; the bin is streamed slowly so the
// download phase is observable).
//
// Usage (repo root):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-mock-sem
//   (copy danbooru.db into demo-mock-sem/data, set onboarding_completed)
//   NAI_MOCK=1 SEMANTIC_MOCK=1 SEMANTIC_MOCK_DELAY_MS=1500 \
//     SEMANTIC_INDEX_URL=http://127.0.0.1:3182/ STUDIO_DATA_DIR=<repo>/demo-mock-sem/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3181 --strictPort
//   runtime/node/node.exe scripts/smoke/tag-semantic.mjs http://127.0.0.1:3181 demo-mock-sem/data 3182
//
// Args / env: argv[2] server URL, argv[3] data dir, argv[4] index file server
// port; PW_CORE, CHROME, SMOKE_OUT as in tag-assist.mjs.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const PW_CORE =
  process.env.PW_CORE ??
  'C:/Users/User/AppData/Local/Temp/claude/C--Users-User-project-snuff-87-studio/ebff346b-7e74-48c9-a979-5cbd5b9c3f0b/scratchpad/pw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(
  fs.existsSync(PW_CORE) ? pathToFileURL(PW_CORE).href : PW_CORE
)
const BASE = (process.argv[2] ?? 'http://127.0.0.1:3181').replace(/\/$/, '')
const DATA = path.resolve(process.argv[3] ?? 'demo-mock-sem/data')
const INDEX_PORT = Number(process.argv[4] ?? 3182)
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

// ── mock index + file server ─────────────────────────────────────────────────
const indexDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-index-'))
execFileSync(
  process.execPath,
  [
    'scripts/build-tag-index.mjs',
    path.join(DATA, 'danbooru.db'),
    '--mock',
    '--n',
    '400',
    '--out',
    indexDir,
  ],
  { stdio: 'inherit' },
)
let failNext = true
const requests = []
const server = http.createServer((req, res) => {
  const file = path.join(indexDir, decodeURIComponent(req.url.slice(1)))
  requests.push(req.url)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.statusCode = 404
    return res.end()
  }
  if (failNext && file.endsWith('.json')) {
    failNext = false
    res.statusCode = 500
    return res.end('boom')
  }
  const data = fs.readFileSync(file)
  res.setHeader('content-length', data.length)
  if (!file.endsWith('.bin')) return res.end(data)
  // stream slowly: 8 chunks x 120ms
  const step = Math.ceil(data.length / 8)
  let off = 0
  const tick = () => {
    if (off >= data.length) return res.end()
    res.write(data.subarray(off, off + step))
    off += step
    setTimeout(tick, 120)
  }
  tick()
})
await new Promise((r) => server.listen(INDEX_PORT, '127.0.0.1', r))

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
    // the injected index failure and the poll it causes are expected
    if (/Failed to load resource|favicon|net::ERR|500/.test(text)) return
    consoleErrors++
    console.log(`  [console.error] ${text.slice(0, 300)}`)
  })
  page.on('pageerror', (e) => {
    consoleErrors++
    console.log(`  [pageerror] ${String(e).slice(0, 300)}`)
  })
}

const phaseOf = (page) =>
  page
    .locator('[data-semantic-status],[data-semantic-toggle]')
    .first()
    .getAttribute('data-semantic-phase')
const waitPhase = (page, phase, timeout = 20000) =>
  page.waitForFunction(
    (p) =>
      document
        .querySelector('[data-semantic-status],[data-semantic-toggle]')
        ?.getAttribute('data-semantic-phase') === p,
    phase,
    { timeout },
  )
/** Samples the phase attribute until `target` is reached; returns phases seen. */
async function trackPhases(page, target, timeout = 25000) {
  const seen = new Set()
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const p = await phaseOf(page).catch(() => null)
    if (p) seen.add(p)
    if (p === target) break
    await page.waitForTimeout(80)
  }
  return seen
}
async function openTagSearch(page) {
  await page.locator('[data-tag-search-open]').first().click()
  const win = page.locator('[data-tag-search-window]')
  await win.waitFor({ timeout: 5000 })
  return win
}

try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  })
  const page = await ctx.newPage()
  attach(page)

  // 1. Settings card, initially off
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  const card = page.locator('[data-semantic-card]')
  await card.waitFor({ timeout: 15000 })
  check(await card.isVisible(), 'settings: Tag search card present')
  check((await phaseOf(page)) === 'off', 'settings: status starts off')
  check(
    (await card.locator('[data-semantic-switch]').getAttribute('data-state')) ===
      'unchecked',
    'settings: switch unchecked',
  )
  check(
    (await card.locator('[data-semantic-delete]').isDisabled()) === true,
    'settings: delete disabled before anything is downloaded',
  )
  await card.scrollIntoViewIfNeeded()
  await shot(page, 'sem-settings-1440-off')

  // 2. Turn on: first index request fails -> Error + Retry
  await card.locator('[data-semantic-switch]').click()
  await waitPhase(page, 'error', 15000)
  check(
    (await card.locator('[data-semantic-retry]').count()) === 1,
    'settings: error state shows Retry',
  )
  check(
    /Failed/.test(await card.locator('[data-semantic-status-text]').innerText()),
    'settings: error message shown',
  )
  await shot(page, 'sem-settings-1440-error')

  // 3. Retry -> downloading index -> model -> ready
  await card.locator('[data-semantic-retry]').click()
  const seen = await trackPhases(page, 'ready')
  console.log('  phases seen:', [...seen].join(' > '))
  check(seen.has('downloadingIndex'), 'status passes through downloadingIndex')
  check(seen.has('downloadingModel'), 'status passes through downloadingModel')
  check(seen.has('ready'), 'status reaches ready')
  check(
    /Ready/.test(await card.locator('[data-semantic-status-text]').innerText()),
    'settings: ready text',
  )
  check(
    /400 tags/.test(await card.locator('[data-semantic-files]').innerText()),
    'settings: index files line shows 400 tags',
  )
  check(
    fs.existsSync(path.join(DATA, 'models', 'tag-index-mock-50000-256.bin')) &&
      fs.existsSync(path.join(DATA, 'models', 'tag-index-mock-50000-256.json')),
    'index stored under data/models/',
  )
  await shot(page, 'sem-settings-1440-ready')

  // 4. Tag Search mirrors the switch and shows a Meaning section
  await page.goto(`${BASE}/generate`, { waitUntil: 'networkidle' })
  await page.locator('.cm-content').first().waitFor({ timeout: 30000 })
  let win = await openTagSearch(page)
  const sw = win.locator('[data-semantic-switch]')
  await sw.waitFor({ timeout: 10000 })
  await page
    .waitForFunction(
      () =>
        document
          .querySelector('[data-semantic-switch]')
          ?.getAttribute('data-state') === 'checked',
      null,
      { timeout: 8000 },
    )
    .catch(() => {})
  check(
    (await sw.getAttribute('data-state')) === 'checked',
    'Tag Search: toggle mirrors the setting (on)',
  )
  await win.locator('[data-tag-search-input]').fill('long hair smile')
  await page
    .locator('[data-semantic-section="meaning"]')
    .waitFor({ timeout: 10000 })
  check(true, 'Tag Search: "By meaning" section appears when on')
  const names = await win
    .locator('[data-tag-row]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-tag-row')))
  check(
    names.slice(0, 8).some((n) => /hair|smile/.test(n)),
    `semantic hits relevant to the query (${names.slice(0, 5).join(', ')})`,
  )
  check(
    (await win.locator('[data-semantic-score]').count()) >= 1,
    'semantic rows show a similarity bar',
  )
  await shot(page, 'sem-tagsearch-1440-results')

  // 5. Toggle off in the window: unloads, section disappears, settings mirror
  await sw.click()
  await waitPhase(page, 'off', 10000)
  await win.locator('[data-tag-search-input]').fill('long')
  await page.waitForSelector('[data-tag-row]', { timeout: 10000 })
  await page.waitForTimeout(400)
  check(
    (await page.locator('[data-semantic-section]').count()) === 0,
    'toggle off: Meaning section gone',
  )
  check(
    (await win.locator('[data-tag-row]').count()) >= 1,
    'toggle off: normal name results still shown',
  )
  await shot(page, 'sem-tagsearch-1440-off')

  // 6. Searching with the toggle off never loads the model
  await win.locator('[data-tag-search-input]').fill('sitting on a bench')
  await page.waitForTimeout(1500)
  check((await phaseOf(page)) === 'off', 'searching with toggle off keeps status off')
  check(
    (await page.locator('[data-semantic-section]').count()) === 0,
    'searching with toggle off: no semantic section',
  )
  const reqBefore = requests.length
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await card.waitFor({ timeout: 15000 })
  check(
    (await card.locator('[data-semantic-switch]').getAttribute('data-state')) ===
      'unchecked',
    'settings mirrors the window (off)',
  )
  check(requests.length === reqBefore, 'no index/model fetches while off')

  // 7. Turn on from the window, settings mirrors; then delete files
  await page.goto(`${BASE}/generate`, { waitUntil: 'networkidle' })
  await page.locator('.cm-content').first().waitFor({ timeout: 30000 })
  win = await openTagSearch(page)
  await win.locator('[data-semantic-switch]').click()
  await waitPhase(page, 'ready', 25000)
  check(true, 'turning on from the window reaches ready (index cached, no re-download)')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await card.waitFor({ timeout: 15000 })
  await waitPhase(page, 'ready', 15000)
  check(
    (await card.locator('[data-semantic-switch]').getAttribute('data-state')) ===
      'checked',
    'settings mirrors the window (on)',
  )
  await card.locator('[data-semantic-delete]').click()
  await page.getByRole('button', { name: 'Delete downloaded files' }).last().click()
  await waitPhase(page, 'off', 10000)
  await page.waitForTimeout(500)
  check(
    !fs.existsSync(path.join(DATA, 'models')),
    'delete files: data/models removed and switched off',
  )
  check(
    /Nothing downloaded/.test(await card.locator('[data-semantic-files]').innerText()),
    'delete files: files line reset',
  )
  await ctx.close()

  // 8. Mobile 390
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
    hasTouch: true,
    isMobile: true,
  })
  const m = await mctx.newPage()
  attach(m)
  await m.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  const mcard = m.locator('[data-semantic-card]')
  await mcard.waitFor({ timeout: 15000 })
  await mcard.locator('[data-semantic-switch]').click()
  await waitPhase(m, 'ready', 30000)
  await mcard.scrollIntoViewIfNeeded()
  await shot(m, 'sem-settings-390-ready')
  check(
    await m.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'mobile settings: no horizontal page scroll',
  )
  await m.goto(`${BASE}/generate`, { waitUntil: 'networkidle' })
  await m.locator('[data-tag-search-open]').first().click()
  const sheet = m.locator('[data-tag-search-sheet]')
  await sheet.waitFor({ timeout: 5000 })
  await sheet.locator('[data-tag-search-input]').fill('long hair smile')
  await m.locator('[data-semantic-section="meaning"]').waitFor({ timeout: 10000 })
  await m.waitForTimeout(400)
  await shot(m, 'sem-tagsearch-390-results')
  check(
    await m.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'mobile Tag Search: no horizontal page scroll',
  )
  // leave the throwaway server switched off
  await sheet.locator('[data-semantic-switch]').click()
  await waitPhase(m, 'off', 10000)
  await mctx.close()
} finally {
  await browser.close()
  server.close()
  fs.rmSync(indexDir, { recursive: true, force: true })
}

console.log(
  `\n${failures === 0 && consoleErrors === 0 ? 'ALL PASS' : `FAILURES: ${failures}, console errors: ${consoleErrors}`}`,
)
process.exit(failures === 0 && consoleErrors === 0 ? 0 : 1)
