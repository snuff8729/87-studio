// Workspace smoke check (scene rail / board / palette / add-scene popover /
// filter menu / selection grid / characters / mobile sheet) + Quick Generate
// characters and the expanded prompt dialog.
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
// real scenes (128 total when project 1 has 3); two mock characters are added
// when the project has none. Every write server fn is
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
function mockCharacters() {
  return ['Mock Alice', 'Mock Bob'].map((name, i) => ({
    id: 777001 + i,
    projectId: 1,
    slotIndex: i,
    name,
    charPrompt: i === 0 ? '1girl, @{slot:outfit}' : '',
    charNegative: '',
    createdAt: '2026-10-30 00:00:00',
    updatedAt: '2026-10-30 00:00:00',
  }))
}
function withMockScenes(body) {
  const root = JSON.parse(body)
  const res = root.p.v[0]
  const packs = res.p.v[res.p.k.indexOf('scenePacks')]
  packs.a = [...packs.a, ...enc(mockPacks()).a]
  const chars = res.p.v[res.p.k.indexOf('characters')]
  if (chars && chars.a.length === 0) chars.a = enc(mockCharacters()).a
  return JSON.stringify(root)
}

async function newPage(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('87studio-locale', 'en')
      if (!sessionStorage.getItem('smoke-init')) {
        sessionStorage.setItem('smoke-init', '1')
        localStorage.removeItem('87studio-scene-rail:1')
      }
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
/** Elements that are actually laid out (inactive tab panels have no boxes). */
const shown = (page, selector) =>
  page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].filter(
        (el) => el.getClientRects().length > 0,
      ).length,
    selector,
  )
const rows = (page) =>
  page.locator('#center [role="listbox"] [data-onboarding="scene-item"]')

// ───────── Desktop 1440 ─────────
{
  console.log('== desktop 1440x900')
  const { ctx, page } = await newPage(1440, 900)
  await openWorkspace(page)
  const total = 125
  const tabs = await page
    .locator('[role="tab"]')
    .filter({ visible: true })
    .allInnerTexts()
  check(
    tabs.map((t) => norm(t).replace(/\s*\d+$/, '')).join('|') ===
      'Prompt|Chars|Refs|Params',
    `left tabs = Prompt/Chars/Refs/Params (${tabs.map(norm).join('|')})`,
  )
  const first = await rows(page).first().getAttribute('data-scene-id')
  const firstName = norm(await rows(page).first().innerText()).replace(
    /\s*\d+$/,
    '',
  )
  check(param(page, 'scene') === first, `auto-selects first scene (${first})`)
  let rail = await railInfo(page)
  const count = Number(rail?.text.match(/(\d+)/)?.[1] ?? 0)
  check(count >= total, `rail header shows ${count} scenes`)
  check(rail?.w === 216, `rail defaults to expanded (${rail?.w}px)`)
  const titleFits = await page.evaluate(() => {
    const h = [
      ...document.querySelectorAll('#center div[data-onboarding="scene-rail"]'),
    ].find((el) => el.getClientRects().length > 0)
    const t = h.firstElementChild
    return { fits: t.scrollWidth <= t.clientWidth, text: t.textContent }
  })
  check(
    titleFits.fits,
    `rail title is not truncated at 216px ("${titleFits.text}")`,
  )
  await shot(page, 'desktop-rail-216')
  const rendered = await rows(page).count()
  check(rendered < 60, `virtualized (${rendered}/${count} rows in DOM)`)

  // ── Search + filter inside the search field ──
  const search = page.locator('#center input[aria-label="Search scenes"]')
  const filterBtn = page.locator('#center [data-scene-filter]').first()
  check(
    (await page.locator('#center [role="radio"]').count()) === 0,
    'no filter chip row',
  )
  check(
    (await filterBtn.innerText()).trim() === '' &&
      (await filterBtn.locator('svg').count()) === 1,
    'filter = All → icon-only button',
  )
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
  await filterBtn.click()
  await settle(page, 200)
  const menuItems = (
    await page.locator('[role="menuitemradio"]').allInnerTexts()
  ).map(norm)
  check(
    menuItems.length === 3 &&
      /^All \d+$/.test(menuItems[0]) &&
      menuItems[1] === 'Reserved 1' &&
      /^No images \d+$/.test(menuItems[2]),
    `filter menu lists All / Reserved / No images with counts (${menuItems.join(', ')})`,
  )
  await shot(page, 'desktop-filter-menu')
  await page.locator('[role="menuitemradio"]', { hasText: 'Reserved' }).click()
  await settle(page)
  check((await rows(page).count()) === 1, 'Reserved filter → 1 row')
  check(
    norm(await filterBtn.innerText()) === 'Reserved',
    'active filter shows a label chip',
  )
  await shot(page, 'desktop-filter-active')
  await filterBtn.click()
  await page.locator('[role="menuitemradio"]', { hasText: /^All/ }).click()
  await settle(page)
  check(
    (await filterBtn.innerText()).trim() === '',
    'back to All → icon-only again',
  )

  // ── Rail width: manual toggle only ──
  await page.getByRole('button', { name: 'Compact scene list' }).click()
  await settle(page)
  rail = await railInfo(page)
  check(
    rail?.w === 56 &&
      (await page.evaluate(() =>
        localStorage.getItem('87studio-scene-rail:1'),
      )) === 'compact',
    'toggle → compact 56px, persisted',
  )
  await openWorkspace(page)
  check((await railInfo(page))?.w === 56, 'compact choice survives a reload')
  await page.getByRole('button', { name: 'Expand scene list' }).click()
  await settle(page)
  check((await railInfo(page))?.w === 216, 'toggle → expanded 216px')
  await page.setViewportSize({ width: 900, height: 768 })
  await settle(page, 700)
  rail = await railInfo(page)
  check(
    rail?.w === 216 && rail.center < 720,
    `no auto-compact at a narrow center (${rail?.center}px → ${rail?.w}px)`,
  )
  await page.getByRole('button', { name: 'More scene options' }).click()
  check(
    (await page.getByText('Compact automatically').count()) === 0,
    'no "compact automatically" menu item',
  )
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 900 })
  await settle(page, 600)

  // ── Add scene popover ──
  const addBtn = page
    .locator('#center [data-onboarding="add-scene-btn"]')
    .first()
  await addBtn.click()
  await settle(page, 300)
  const pop = page.locator('[data-slot="popover-content"]')
  check(await pop.isVisible(), 'rail ＋ opens the add-scene popover')
  check(
    (await pop.getByText('New scene').count()) === 1 &&
      (await pop
        .locator('input')
        .first()
        .evaluate((el) => el === document.activeElement)),
    'popover has a title and an autofocused name input',
  )
  check(
    (await pop.locator('[data-slot="select-trigger"]').count()) === 1,
    'pack select is present',
  )
  const copyLabel = pop.locator('label', { hasText: 'Copy values from' })
  check(
    (await copyLabel.count()) === 1 &&
      (await copyLabel
        .locator('button[role="checkbox"]')
        .getAttribute('aria-checked')) === 'true',
    'copy-values checkbox defaults on with a selected scene',
  )
  const nameInput = pop.locator('input').first()
  // the real first scene's exact name (row title)
  const realName = await rows(page).first().getAttribute('title')
  await nameInput.fill(realName)
  await settle(page, 200)
  check(
    (await pop.getByRole('alert').count()) === 1 &&
      (await pop
        .getByRole('button', { name: 'Add', exact: true })
        .isDisabled()),
    `duplicate name → inline error, Add disabled ("${realName}")`,
  )
  await shot(page, 'desktop-add-scene-popover')
  await nameInput.fill('Smoke Scene')
  await settle(page, 200)
  check(
    (await pop.getByRole('alert').count()) === 0,
    'unique name clears the error',
  )
  await nameInput.press('Enter')
  await settle(page, 600)
  check(
    page.blocked.includes('addProjectScene'),
    'Enter submits (addProjectScene request, blocked by the smoke)',
  )
  await page.keyboard.press('Escape')
  await settle(page, 200)
  check((await pop.count()) === 0, 'Esc closes the popover')

  // ── Selection mode: header, no wrap at 216px, selection grid ──
  await page.getByRole('button', { name: 'More scene options' }).click()
  await page.getByRole('menuitem', { name: 'Select', exact: true }).click()
  await settle(page, 500)
  const headers = page.locator('#center [data-selection-header]')
  check(
    (await headers.count()) === 2,
    'rail + selection grid both show the header',
  )
  const railHeader = headers.first()
  const oneLine = await railHeader.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const kids = [...el.children].map((c) => c.getBoundingClientRect())
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      overflow: el.scrollWidth > el.clientWidth + 1,
      sameRow: kids.every((k) => Math.abs(k.top - kids[0].top) < 12),
      text: el.textContent,
    }
  })
  check(
    oneLine.w >= 215 &&
      oneLine.w <= 216 &&
      oneLine.h === 40 &&
      !oneLine.overflow &&
      oneLine.sameRow,
    `selection header is one line at 216px (${oneLine.w}x${oneLine.h}, overflow=${oneLine.overflow})`,
  )
  const actionBtns = railHeader.locator('button')
  const disabledAt0 = await actionBtns.evaluateAll(
    (bs) => bs.filter((b) => b.disabled).length,
  )
  check(
    disabledAt0 === 3,
    `set count / export / more disabled at 0 (${disabledAt0})`,
  )
  check(
    (await page.locator('#center [data-scene-board]').count()) === 1,
    'selection grid replaces the scene view',
  )
  check(
    (await page.locator('#center [data-scene-board] [data-scene-id]').count()) >
      20,
    'grid shows pack cards',
  )
  await shot(page, 'desktop-select-grid')
  // check two cards in the grid → rail rows in sync
  const cards = page.locator('#center [data-scene-board] [data-scene-id]')
  await cards.nth(0).click()
  await cards.nth(2).click()
  await settle(page, 300)
  check(
    /2 selected/.test(await railHeader.innerText()) &&
      /2 selected/.test(await headers.nth(1).innerText()),
    'both headers show "2 selected"',
  )
  check(
    (await page
      .locator('#center [role="listbox"] [aria-selected="true"]')
      .count()) === 2,
    'rail rows are checked in sync',
  )
  const afterCheck = await railHeader.evaluate((el) => ({
    h: el.getBoundingClientRect().height,
    overflow: el.scrollWidth > el.clientWidth + 1,
  }))
  check(
    afterCheck.h === 40 && !afterCheck.overflow,
    'header stays one line with a selection',
  )
  const enabledAt2 = await actionBtns.evaluateAll(
    (bs) => bs.filter((b) => !b.disabled).length,
  )
  check(
    enabledAt2 === 5,
    `actions enabled with a selection (${enabledAt2} enabled buttons)`,
  )
  await railHeader
    .getByRole('button', { name: 'Set image count for selected scenes' })
    .click()
  await settle(page, 300)
  await shot(page, 'desktop-select-setcount')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await settle(page, 300)
  await railHeader
    .getByRole('button', { name: 'More selection actions' })
    .click()
  await settle(page, 200)
  const moreItems = (
    await page.locator('[role="menuitem"]').allInnerTexts()
  ).map(norm)
  check(
    moreItems.length === 3 &&
      moreItems.some((t) => /Save as Template/.test(t)) &&
      moreItems.some((t) => /Reset/.test(t)) &&
      moreItems.some((t) => /Delete/.test(t)),
    `⋯ menu = template / reset / delete (${moreItems.join(' | ')})`,
  )
  await page.keyboard.press('Escape')
  // search in the rail narrows the grid
  await search.fill('gestures 1')
  await settle(page, 400)
  check(
    (await cards.count()) === 10,
    `grid respects the rail search (${await cards.count()} cards)`,
  )
  await search.fill('')
  await settle(page, 300)
  // select all toggle
  await railHeader.getByRole('checkbox').click()
  await settle(page, 300)
  check(
    new RegExp(`${count} selected`).test(await railHeader.innerText()),
    'select-all checks every visible scene',
  )
  // exit → board → select there: the header replaces the board toolbar
  await railHeader.getByRole('button', { name: 'Exit selection' }).click()
  await settle(page, 400)
  check(
    (await page.locator('#center [data-scene-board]').count()) === 0 &&
      (await page.locator('#center [data-onboarding="scene-rail"]').count()) >
        0,
    'leaving select mode returns to the scene view',
  )
  await page
    .locator('#center')
    .getByRole('button', { name: 'Board view' })
    .first()
    .click()
  await settle(page, 600)
  await page
    .locator('#center')
    .getByRole('button', { name: 'Select', exact: true })
    .click()
  await settle(page, 400)
  const boardHeader = page.locator('#center [data-selection-header]')
  check(
    param(page, 'view') === 'board' &&
      (await boardHeader.count()) === 1 &&
      (await page.locator('#center').getByText('Close board').count()) === 0,
    'board: selection header replaces the toolbar',
  )
  await boardHeader.getByRole('checkbox').click()
  await settle(page, 300)
  check(
    new RegExp(count + ' selected').test(await boardHeader.innerText()),
    'board select-all',
  )
  await shot(page, 'desktop-board-select')
  await page.goBack() // scene mode again, select still on and shared
  await settle(page, 600)
  check(
    param(page, 'view') === null &&
      new RegExp(count + ' selected').test(
        await page
          .locator('#center [data-selection-header]')
          .first()
          .innerText(),
      ),
    'switching modes keeps the selection',
  )
  await page
    .locator('#center [data-selection-header]')
    .first()
    .getByRole('button', { name: 'Exit selection' })
    .click()
  await settle(page, 400)

  // ── Compact rail while selecting: exit + count badge only ──
  await page.getByRole('button', { name: 'Compact scene list' }).click()
  await settle(page, 300)
  await page
    .locator('#center')
    .getByRole('button', { name: 'Board view' })
    .first()
    .click()
  await settle(page, 500)
  await page
    .locator('#center')
    .getByRole('button', { name: 'Select', exact: true })
    .click()
  await settle(page, 300)
  await page.goBack() // back to the scene view, select mode still on
  await settle(page, 700)
  const compactHeader = page.locator('#center [data-selection-header]').first()
  const ch = await compactHeader.evaluate((el) => ({
    w: Math.round(el.parentElement.getBoundingClientRect().width),
    buttons: el.querySelectorAll('button').length,
    text: el.textContent.trim(),
  }))
  check(
    ch.w === 56 && ch.buttons === 1 && /^[0-9]+$/.test(ch.text),
    `compact rail while selecting: ✕ + count badge only (${ch.w}px, ${ch.buttons} button, "${ch.text}")`,
  )
  await shot(page, 'desktop-compact-select')
  await compactHeader.getByRole('button', { name: 'Exit selection' }).click()
  await settle(page, 400)
  await page.getByRole('button', { name: 'Expand scene list' }).click()
  await settle(page, 400)

  // ── Ctrl+K from inside the CodeMirror prompt editor ──
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
  await page.keyboard.press('Enter')
  await settle(page, 600)
  const target = String(MOCK_ID + 3 * 25 + 7)
  check(
    param(page, 'scene') === target &&
      (await page.locator('[cmdk-input]').count()) === 0,
    `palette Enter selects "Outfits 07" (scene=${param(page, 'scene')})`,
  )
  check((await cm.first().innerText()) === before, 'prompt untouched by Ctrl+K')

  // ── Tag gallery on every prompt input (workspace) ──
  check(
    (await shown(page, '#left button[title="Tag Gallery"]')) === 2,
    'Prompt tab: tag gallery on prompt + negative',
  )

  // ── Prompt preview scrolls into view ──
  const previewBtn = page.getByRole('button', { name: /Prompt Preview/ })
  if ((await previewBtn.count()) > 0) {
    await previewBtn.first().scrollIntoViewIfNeeded()
    await previewBtn.first().click()
    await settle(page, 1200)
    const visible = await previewBtn.first().evaluate((btn) => {
      const section = btn.parentElement
      let el = section.parentElement
      while (
        el &&
        !(
          el.scrollHeight > el.clientHeight &&
          /auto|scroll/.test(getComputedStyle(el).overflowY)
        )
      ) {
        el = el.parentElement
      }
      const r = section.getBoundingClientRect()
      const c = el
        ? el.getBoundingClientRect()
        : { top: 0, bottom: innerHeight }
      return {
        top: r.top - c.top,
        bottom: r.bottom - c.bottom,
        tall: r.height > c.bottom - c.top,
      }
    })
    check(
      visible.tall
        ? visible.top >= -2
        : visible.bottom <= 2 && visible.top >= -2,
      `prompt preview scrolled into view (top ${Math.round(visible.top)}, bottom ${Math.round(visible.bottom)})`,
    )
    await shot(page, 'desktop-prompt-preview')
  } else {
    console.log('  (no Prompt Preview section for this scene)')
  }

  // ── Workspace Chars tab (mock characters) ──
  await page.getByRole('tab', { name: /^Chars/ }).click()
  await settle(page, 400)
  const chips = page.locator('#left [data-character-chip]')
  check(
    (await chips.count()) >= 1,
    `Chars tab shows chips (${await chips.count()})`,
  )
  check(
    (await page.locator('#left [data-character-add]').count()) === 1,
    'Chars tab has the ＋ Add chip',
  )
  check(
    (await shown(page, '#left button[title="Tag Gallery"]')) >= 1,
    'Chars tab: tag gallery on the character prompt',
  )
  await shot(page, 'desktop-workspace-chars')
  await page.locator('#left [data-character-menu]').click()
  await settle(page, 200)
  const charMenu = (
    await page.locator('[role="menuitem"]').allInnerTexts()
  ).map(norm)
  check(
    charMenu.join('|') === 'Rename|Duplicate|Move left|Move right|Delete',
    `character ⋯ menu (${charMenu.join('|')})`,
  )
  await page.keyboard.press('Escape')

  check(
    !page.blocked.some((n) => /Generation/.test(n)),
    'no generation request',
  )
  await ctx.close()
}

// ───────── Mobile 390 (workspace) ─────────
{
  console.log('== mobile 390x844 workspace')
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
  // add-scene popover from the sheet header
  await sheet.locator('[data-onboarding="add-scene-btn"]').click()
  await settle(page, 300)
  const pop = page.locator('[data-slot="popover-content"]')
  const popBox = await pop.boundingBox()
  check(
    (await pop.isVisible()) &&
      popBox &&
      popBox.x >= 0 &&
      popBox.x + popBox.width <= 390,
    `sheet ＋ opens the popover inside the viewport (x ${Math.round(popBox?.x ?? -1)}, w ${Math.round(popBox?.width ?? 0)})`,
  )
  await shot(page, 'mobile-add-scene-popover')
  await page.keyboard.press('Escape')
  await settle(page, 300)
  // selection header inside the sheet
  await sheet.getByRole('button', { name: 'More scene options' }).click()
  await page.getByRole('menuitem', { name: 'Select', exact: true }).click()
  await settle(page, 400)
  const sh = sheet.locator('[data-selection-header]')
  const shInfo = await sh.evaluate((el) => ({
    h: Math.round(el.getBoundingClientRect().height),
    overflow: el.scrollWidth > el.clientWidth + 1,
  }))
  check(
    shInfo.h === 40 && !shInfo.overflow,
    'sheet selection header is one line',
  )
  await shot(page, 'mobile-sheet-select')
  await sh.getByRole('button', { name: 'Exit selection' }).click()
  await settle(page, 300)
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
  // board toolbar fits
  const toolbarW = await page
    .locator('[data-scene-board] > div')
    .first()
    .evaluate((el) => ({
      sw: el.scrollWidth,
      cw: el.clientWidth,
    }))
  check(
    toolbarW.sw <= toolbarW.cw + 1,
    `board toolbar has no horizontal overflow (${toolbarW.sw}/${toolbarW.cw})`,
  )
  await shot(page, 'mobile-board')
  await ctx.close()
}

// ───────── Quick Generate: characters + expanded dialog ─────────
async function quickGenerate(width, height, label) {
  console.log(`== quick generate ${width}x${height}`)
  const { ctx, page } = await newPage(width, height)
  await page.goto(BASE + '/generate', { waitUntil: 'networkidle' })
  await page.waitForSelector('[role="tab"]', { timeout: 15000 })
  await settle(page, 800)

  // Expanded editor fills its height with a one-line prompt
  const editor = page.locator('.cm-content').first()
  await editor.click()
  await page.keyboard.type('1girl')
  await page.locator('button[title="Expand editor"]').first().click()
  await settle(page, 700)
  const dlg = page.getByRole('dialog')
  const m = await dlg.evaluate((d) => {
    const body = d.querySelector('[data-expanded-editor-body]')
    const ed = body.querySelector('.cm-editor')
    const b = body.getBoundingClientRect()
    const e = ed.getBoundingClientRect()
    return {
      body: Math.round(b.height),
      editor: Math.round(e.height),
      bodyTop: b.top,
      bodyBottom: b.bottom,
    }
  })
  check(
    m.editor >= m.body - 2 && m.body > 200,
    `expanded editor fills the dialog body (${m.editor}/${m.body}px)`,
  )
  // click in the lower empty area focuses the editor
  await page.mouse.click(width / 2, m.bodyBottom - 20)
  await settle(page, 200)
  check(
    await page.evaluate(() =>
      document.activeElement?.classList.contains('cm-content'),
    ),
    'clicking the empty area focuses the editor',
  )
  await shot(page, `${label}-expanded-dialog`)
  // tag gallery inside the dialog
  await dlg.locator('button[title="Tag Gallery"]').click()
  await settle(page, 800)
  check(
    (await dlg.locator('.absolute.inset-0.z-10').count()) === 1,
    'expanded dialog header opens the tag gallery',
  )
  await shot(page, `${label}-expanded-taggallery`)
  await page.mouse.click(width / 2, 4) // backdrop (outside gallery frame)
  await page.keyboard.press('Escape')
  await settle(page, 300)
  await page.keyboard.press('Escape')
  await settle(page, 400)

  // prompt + negative tag gallery buttons
  check(
    (await shown(page, 'button[title="Tag Gallery"]')) === 2,
    'Prompt tab: tag gallery on prompt + negative',
  )

  // Characters
  await page.getByRole('tab', { name: /^Chars/ }).click()
  await settle(page, 300)
  check(
    (await page.getByText('No characters yet').count()) === 1,
    'empty state with hint',
  )
  await page.locator('[data-character-add]').click()
  await settle(page, 400)
  const chipTexts = async () =>
    (await page.locator('[data-character-chip]').allInnerTexts()).map(norm)
  check(
    (await chipTexts()).join('|') === 'Character 1',
    `Add creates "Character 1" immediately (${(await chipTexts()).join('|')})`,
  )
  check(
    await page.evaluate(
      () =>
        document.activeElement?.tagName === 'INPUT' &&
        document.activeElement.value === 'Character 1',
    ),
    'new character name field is focused',
  )
  await page.keyboard.type('Alice')
  await settle(page, 200)
  check((await chipTexts())[0] === 'Alice', 'typing renames the chip')
  check(
    (await page.getByText('(empty)').count()) === 1,
    'negative is collapsed with "(empty)"',
  )
  check(
    (await page
      .locator('[data-characters-editor] button[title="Tag Gallery"]')
      .count()) === 1,
    'character prompt has the tag gallery button',
  )
  await page.getByRole('button', { name: /Negative/ }).click()
  await settle(page, 300)
  check(
    (await page
      .locator('[data-characters-editor] button[title="Tag Gallery"]')
      .count()) === 2,
    'character negative has the tag gallery button',
  )
  await shot(page, `${label}-chars`)
  // duplicate / move / delete
  await page.locator('[data-character-menu]').click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await settle(page, 400)
  check(
    (await chipTexts()).join('|') === 'Alice|Alice copy',
    `Duplicate adds and selects the copy (${(await chipTexts()).join('|')})`,
  )
  await page.locator('[data-character-menu]').click()
  await page.getByRole('menuitem', { name: 'Move left' }).click()
  await settle(page, 300)
  check(
    (await chipTexts()).join('|') === 'Alice copy|Alice',
    `Move left reorders (${(await chipTexts()).join('|')})`,
  )
  await page.locator('[data-character-menu]').click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await settle(page, 300)
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete' })
    .click()
  await settle(page, 400)
  check(
    (await chipTexts()).join('|') === 'Alice',
    `Delete (confirmed) removes it (${(await chipTexts()).join('|')})`,
  )
  const noOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  )
  check(noOverflow, 'no horizontal page overflow')
  await ctx.close()
}
await quickGenerate(1440, 900, 'qg-desktop')
await quickGenerate(390, 844, 'qg-mobile')

console.log(`\nconsole errors: ${consoleErrors}\nfailures: ${failures}`)
await browser.close()
process.exit(failures || consoleErrors ? 1 : 0)
