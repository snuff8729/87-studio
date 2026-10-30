// Workspace smoke check (scene rail / board / palette / mobile sheet).
//
// Usage (dev server must be running, e.g. on :3100):
//   runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3100 --strictPort
//   PW_CORE=<path to playwright-core> runtime/node/node.exe scripts/smoke/workspace.mjs
//
// Env:
//   PW_CORE     playwright-core module path (default: the session scratchpad install)
//   CHROME      Chrome executable (default: C:/Program Files/Google/Chrome/Application/chrome.exe)
//   SMOKE_BASE  app URL (default: http://127.0.0.1:3100)
//   SMOKE_OUT   screenshot dir (default: <os tmp>/87studio-smoke)
//
// Needs project 1 in the local DB. getWorkspaceData is intercepted on
// client-side navigation and 5 mock packs (125 scenes) are appended to the
// real scenes (128 total when project 1 has 3). Every write server fn is
// aborted; Generate is never clicked. Exit code 1 on any failure or console
// error.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PW_CORE =
  process.env.PW_CORE ??
  'C:/Users/User/AppData/Local/Temp/claude/C--Users-User-project-snuff-87-studio/ebff346b-7e74-48c9-a979-5cbd5b9c3f0b/scratchpad/pw/node_modules/playwright-core/index.mjs'
const { chromium } = await import(
  fs.existsSync(PW_CORE) ? pathToFileURL(PW_CORE).href : PW_CORE
)
const BASE = process.env.SMOKE_BASE ?? 'http://127.0.0.1:3100'
const OUT = process.env.SMOKE_OUT ?? path.join(os.tmpdir(), '87studio-smoke')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
let failures = 0
let consoleErrors = 0
const check = (cond, msg) => {
  if (!cond) failures++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
}
const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file })
  console.log(`  shot ${file}`)
}
const settle = (page, ms = 400) => page.waitForTimeout(ms)
const norm = (s) => s.replace(/\s+/g, ' ').trim()

// ── server-fn interception ──
const fnName = (u) => {
  const m = u.match(/_serverFn\/([^?/]+)/)
  if (!m) return ''
  try {
    return JSON.parse(Buffer.from(m[1], 'base64url').toString()).export.replace(
      /_createServerFn_handler$/,
      '',
    )
  } catch {
    return ''
  }
}
const WRITE =
  /^(create|update|delete|bulk|add|rename|duplicate|assign|upsert|set|remove|cancel|pause|resume|reorder|toggle|upload|import|convert|record)/i

// Minimal seroval encoder for plain JSON values
let nextId = 50000
function enc(v) {
  if (v === null) return { t: 2, s: 0 }
  if (typeof v === 'number') return { t: 0, s: v }
  if (typeof v === 'string') return { t: 1, s: v }
  if (Array.isArray(v)) {
    const node = { t: 9, i: nextId++, a: [], o: 0 }
    node.a = v.map(enc)
    return node
  }
  const keys = Object.keys(v)
  const node = { t: 10, i: nextId++, p: { k: keys, v: [] }, o: 0 }
  node.p.v = keys.map((k) => enc(v[k]))
  return node
}
const MOCK_ID = 100000
function mockPacks() {
  let sid = MOCK_ID
  return ['Emotions', 'Poses', 'Gestures', 'Outfits', 'Backgrounds'].map(
    (name, pi) => ({
      id: 900 + pi,
      projectId: 1,
      scenePackId: null,
      name,
      createdAt: '2026-10-30 00:00:00',
      scenes: Array.from({ length: 25 }, (_, j) => ({
        id: ++sid,
        projectScenePackId: 900 + pi,
        sourceSceneId: null,
        name: `${name} ${String(j + 1).padStart(2, '0')}`,
        placeholders: '{}',
        thumbnailImageId: null,
        sortOrder: j,
        createdAt: '2026-10-30 00:00:00',
        updatedAt: '2026-10-30 00:00:00',
        recentImageCount: (j + 1) % 3 === 0 ? 0 : (j + 1) % 7,
        thumbnailPath: null,
      })),
    }),
  )
}
function withMockScenes(body) {
  const root = JSON.parse(body)
  const res = root.p.v[0]
  const packs = res.p.v[res.p.k.indexOf('scenePacks')]
  packs.a = [...packs.a, ...enc(mockPacks()).a]
  return JSON.stringify(root)
}

async function newPage(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('87studio-locale', 'en')
      localStorage.removeItem('87studio-scene-rail:1')
    } catch {}
  })
  const page = await ctx.newPage()
  page.blocked = []
  page.on('console', (m) => {
    if (m.type() !== 'error' && !/hydrat/i.test(m.text())) return
    if (/ERR_FAILED|Failed to fetch|net::/.test(m.text())) return // our aborts
    consoleErrors++
    console.log(`  [console.${m.type()}] ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', (e) => {
    if (/Failed to fetch/.test(e.message)) return
    consoleErrors++
    console.log(`  [pageerror] ${e.message.slice(0, 300)}`)
  })
  await page.route('**/_serverFn/**', async (route) => {
    const url = route.request().url()
    const name = fnName(url)
    if (WRITE.test(name)) {
      page.blocked.push(name)
      return route.abort()
    }
    if (name === 'getWorkspaceData') {
      const resp = await route.fetch()
      return route.fulfill({
        response: resp,
        body: withMockScenes(await resp.text()),
      })
    }
    // Scene-level reads of mock scenes are served as scene 1
    if (/%22s%22%3A1\d{5}/.test(url)) {
      return route.continue({
        url: url.replace(/%22s%22%3A1\d{5}/g, '%22s%22%3A1'),
      })
    }
    return route.continue()
  })
  return { ctx, page }
}

/** Dashboard → client-side navigation, so the loader goes through fetch. */
async function openWorkspace(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.locator('a[href="/workspace/1"]').first().click()
  await page.waitForSelector('[role="tab"]', { timeout: 15000 })
  await settle(page, 1000)
}
const param = (page, key) => new URL(page.url()).searchParams.get(key)
const railInfo = (page) =>
  page.evaluate(() => {
    const header = [
      ...document.querySelectorAll('#center div[data-onboarding="scene-rail"]'),
    ].find((el) => el.getClientRects().length > 0)
    const center = document.getElementById('center')
    if (!header || !center) return null
    return {
      w: Math.round(header.parentElement.getBoundingClientRect().width),
      center: Math.round(center.getBoundingClientRect().width),
      text: header.textContent,
    }
  })
const rows = (page) =>
  page.locator('#center [role="listbox"] [data-onboarding="scene-item"]')
const chipTexts = async (page) =>
  (
    await page
      .locator('#center [role="radio"]')
      .filter({ visible: true })
      .allInnerTexts()
  ).map(norm)

// ───────── Desktop 1440 ─────────
{
  console.log('== desktop 1440x900')
  const { ctx, page } = await newPage(1440, 900)
  await openWorkspace(page)
  const total = 125 + (await page.evaluate(() => 0)) // real scenes added below
  const tabs = await page
    .locator('[role="tab"]')
    .filter({ visible: true })
    .allInnerTexts()
  check(
    tabs.map((t) => norm(t).replace(/\d+$/, '')).join('|') ===
      'Prompt|Chars|Refs|Params',
    `left tabs = Prompt/Chars/Refs/Params (${tabs.map(norm).join('|')})`,
  )
  const first = await rows(page).first().getAttribute('data-scene-id')
  check(param(page, 'scene') === first, `auto-selects first scene (${first})`)
  let rail = await railInfo(page)
  const count = Number(rail?.text.match(/(\d+)/)?.[1] ?? 0)
  check(count >= total, `rail header shows ${count} scenes`)
  check(
    rail?.w === (rail?.center < 720 ? 56 : 216),
    `rail width follows rule (center ${rail?.center} → ${rail?.w})`,
  )
  const rendered = await rows(page).count()
  check(rendered < 60, `virtualized (${rendered}/${count} rows in DOM)`)

  // Search + filter chips
  const search = page.locator('#center input[aria-label="Search scenes"]')
  await search.fill('  GESTURES 1')
  await settle(page)
  const hits = (await rows(page).allInnerTexts()).map(norm)
  check(
    hits.length === 10 && hits.every((t) => /Gestures 1\d/.test(t)),
    `search is case-insensitive + trimmed (${hits.length} hits)`,
  )
  await search.fill('')
  await settle(page)
  await rows(page)
    .nth(1)
    .getByRole('button', { name: 'Increase count' })
    .click()
  await settle(page, 200)
  check(
    (await chipTexts(page))[1] === 'Reserved 1',
    `Reserved chip counts the reservation (${(await chipTexts(page)).join(', ')})`,
  )
  await page.locator('#center [role="radio"]', { hasText: 'Reserved' }).click()
  await settle(page)
  check((await rows(page).count()) === 1, 'Reserved filter → 1 row')
  await page.locator('#center [role="radio"]', { hasText: 'All' }).click()
  await settle(page)
  await shot(page, 'desktop-rail')

  // Explicit compact / expand
  await page.getByRole('button', { name: 'Compact scene list' }).click()
  await settle(page)
  rail = await railInfo(page)
  check(
    rail?.w === 56 &&
      (await page.evaluate(() =>
        localStorage.getItem('87studio-scene-rail:1'),
      )) === 'compact',
    'explicit compact → 56px, persisted',
  )
  await page.getByRole('button', { name: 'Expand scene list' }).click()
  await settle(page)
  check((await railInfo(page))?.w === 216, 'explicit expand → 216px')

  // Auto-compact: explicit choice wins, "auto" re-enables the width rule
  await page.setViewportSize({ width: 1024, height: 768 })
  await settle(page, 600)
  rail = await railInfo(page)
  check(
    rail?.w === 216,
    `explicit expand wins at narrow center (${rail?.center}px)`,
  )
  await page.getByRole('button', { name: 'More scene options' }).click()
  await page
    .getByRole('menuitemcheckbox', { name: /Compact automatically/ })
    .click()
  await settle(page, 600)
  rail = await railInfo(page)
  check(
    rail?.w === (rail?.center < 720 ? 56 : 216),
    `auto width: center ${rail?.center} → ${rail?.w}`,
  )
  const a = rail?.w
  await settle(page, 600)
  check((await railInfo(page))?.w === a, 'no width flicker after resize')
  await page.setViewportSize({ width: 1440, height: 900 })
  await settle(page, 600)
  check((await railInfo(page))?.w === 216, 'auto width expands again at 1440')

  // Ctrl+K from inside the CodeMirror prompt editor
  await page.getByRole('tab', { name: /^Prompt/ }).click()
  const cm = page.locator('#left [data-onboarding="prompt-editor"] .cm-content')
  const before = await cm.first().innerText()
  await cm.first().click()
  await page.keyboard.press('Control+k')
  await settle(page)
  check(
    (await page.locator('[cmdk-input]').count()) === 1,
    'Ctrl+K opens the palette',
  )
  await page.keyboard.type('outfits 07')
  await settle(page, 300)
  await shot(page, 'desktop-palette')
  await page.keyboard.press('Enter')
  await settle(page, 600)
  const target = String(MOCK_ID + 3 * 25 + 7)
  check(
    param(page, 'scene') === target &&
      (await page.locator('[cmdk-input]').count()) === 0,
    `palette Enter selects "Outfits 07" (scene=${param(page, 'scene')})`,
  )
  check((await cm.first().innerText()) === before, 'prompt untouched by Ctrl+K')

  // Board toggle
  await page
    .locator('#center')
    .getByRole('button', { name: 'Board view' })
    .first()
    .click()
  await settle(page, 600)
  check(
    param(page, 'view') === 'board' &&
      (await page.locator('#center [role="listbox"]').count()) === 0,
    'board toggle → ?view=board, rail hidden',
  )
  check(
    (await page.locator('#center section > button[aria-expanded]').count()) >=
      6,
    'board grouped by pack',
  )
  await shot(page, 'desktop-board')
  await page.locator(`#center [data-scene-id="${MOCK_ID + 30}"]`).click()
  await settle(page, 600)
  check(
    param(page, 'view') === null &&
      param(page, 'scene') === String(MOCK_ID + 30),
    'card click → scene mode with that scene',
  )
  await page.goBack()
  await settle(page, 600)
  check(param(page, 'view') === 'board', 'Back → board')

  check(
    !page.blocked.some((n) => /Generation/.test(n)),
    'no generation request',
  )
  await ctx.close()
}

// ───────── Mobile 390 ─────────
{
  console.log('== mobile 390x844')
  const { ctx, page } = await newPage(390, 844)
  await openWorkspace(page)
  await page.getByRole('tab', { name: 'Result' }).click()
  await settle(page)
  const bar = page.getByRole('button', { name: 'Open scene list' })
  check(await bar.isVisible(), 'Result pane shows the "Scenes ▾" bar')
  await bar.click()
  await settle(page, 500)
  const sheet = page.locator('[data-slot="sheet-content"]')
  check(await sheet.isVisible(), 'bar opens the scenes sheet')
  await shot(page, 'mobile-sheet')
  await sheet.locator(`[data-scene-id="${MOCK_ID + 3}"]`).click()
  await settle(page, 600)
  check(
    !(await sheet.isVisible()) && param(page, 'scene') === String(MOCK_ID + 3),
    'choosing a scene closes the sheet',
  )
  check(
    /Emotions 03/.test(await bar.innerText()),
    'bar shows the current scene',
  )
  await bar.click()
  await settle(page, 500)
  await sheet.getByRole('button', { name: 'Board view' }).click()
  await settle(page, 600)
  check(param(page, 'view') === 'board', 'board reachable from the sheet')
  await ctx.close()
}

console.log(`\nconsole errors: ${consoleErrors}\nfailures: ${failures}`)
await browser.close()
process.exit(failures || consoleErrors ? 1 : 0)
