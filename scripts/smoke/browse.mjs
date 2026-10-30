// Browse pages smoke check: dashboard, gallery (+ image detail), bundles,
// tags and queue at 1440 and 390 — page frame (title / count / actions in the
// app header, no in-page title), gallery filter chips and size slider, select
// mode header, dashboard running strip, queue now-generating card,
// bundles/tags master-detail (mobile list -> detail).
//
// Usage (dev server must be running, e.g. on :3100):
//   runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3100 --strictPort
//   PW_CORE=<path to playwright-core> runtime/node/node.exe scripts/smoke/browse.mjs
//
// Env:
//   PW_CORE     playwright-core module path (default: the session scratchpad install)
//   CHROME      Chrome executable (default: C:/Program Files/Google/Chrome/Application/chrome.exe)
//   SMOKE_BASE  app URL (default: http://127.0.0.1:3100)
//   SMOKE_OUT   screenshot dir (default: <os tmp>/87studio-smoke)
//
// Phase 5 adds settings, metadata (real PNG with an NAI tEXt chunk, set via
// the file input and a synthetic drop) and the gallery win-rate filter, bulk
// tag and add-to-bookmark popovers.
//
// Every read server fn the pages use is answered with mock data (12 projects,
// 300 gallery images, a running queue, 10 bundles, 10 tag bookmarks), so the
// local DB is never read for these pages. Pages are entered by client-side
// navigation from /settings so loaders go through fetch (SSR output cannot be
// intercepted). Every write server fn is aborted; Generate is never clicked.
// Exit code 1 on any failure or console error.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
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

// ── server-fn name / args decoding ──
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
function decode(node) {
  switch (node.t) {
    case 0:
    case 1:
      return node.s
    case 2:
      return [null, undefined, true, false][node.s]
    case 9:
      return node.a.map(decode)
    case 10:
      return Object.fromEntries(
        node.p.k.map((k, i) => [k, decode(node.p.v[i])]),
      )
    default:
      return undefined
  }
}
// POST server fns carry the serialized args in the request body
function bodyArgs(request) {
  try {
    return decode(JSON.parse(request.postData() ?? '').t).data
  } catch {
    return undefined
  }
}
function argsOf(url) {
  const payload = new URL(url).searchParams.get('payload')
  if (!payload) return undefined
  const root = JSON.parse(payload)
  return decode(root.t).data
}

// Minimal seroval encoder for plain JSON values
let nextId = 50000
function enc(v) {
  if (v === undefined) return { t: 2, s: 1 }
  if (v === null) return { t: 2, s: 0 }
  if (v === true) return { t: 2, s: 2 }
  if (v === false) return { t: 2, s: 3 }
  if (typeof v === 'number') return { t: 0, s: v }
  if (typeof v === 'string') return { t: 1, s: v }
  if (Array.isArray(v)) {
    return { t: 9, i: nextId++, a: v.map(enc), o: 0 }
  }
  const keys = Object.keys(v)
  return {
    t: 10,
    i: nextId++,
    p: { k: keys, v: keys.map((k) => enc(v[k])) },
    o: 0,
  }
}
const envelope = (result) =>
  JSON.stringify({
    t: 10,
    i: 0,
    p: {
      k: ['result', 'error', 'context'],
      v: [
        enc(result),
        { t: 2, s: 1 },
        { t: 11, i: nextId++, p: { k: [], v: [] }, o: 0 },
      ],
    },
    o: 0,
  })

const WRITE =
  /^(create|update|delete|bulk|add|rename|duplicate|assign|upsert|set|remove|cancel|pause|resume|reorder|toggle|upload|import|convert|record|retry|cleanup)/i

// ── mock data ──
const TS = '2026-10-30 12:00:00'
const PROJECTS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `Project ${String(i + 1).padStart(2, '0')}`,
  description: null,
  generalPrompt: '',
  negativePrompt: '',
  parameters: '{}',
  thumbnailImageId: null,
  createdAt: TS,
  updatedAt: TS,
  thumbnailPath: i % 4 === 3 ? null : `data/thumbnails/${i + 1}/cover.png`,
  imageCount: i * 7,
  sceneCount: 3 + i,
  lastActivityAt: i % 4 === 3 ? null : TS,
}))
const IMAGES = Array.from({ length: 300 }, (_, i) => ({
  id: 1000 - i,
  jobId: 1,
  projectId: (i % 12) + 1,
  projectSceneId: (i % 5) + 1,
  sourceSceneId: null,
  filePath: `data/images/1/mock_${i}.png`,
  thumbnailPath: `data/thumbnails/1/mock_${i}.png`,
  seed: 1000 + i,
  metadata: '{}',
  isFavorite: i % 5 === 0 ? 1 : 0,
  rating: i % 4 === 0 ? (i % 5) + 1 : null,
  memo: null,
  tournamentWins: i % 3 === 0 ? 3 : 0,
  tournamentLosses: i % 3 === 0 ? 1 : i % 7 === 0 ? 2 : 0,
  createdAt: TS,
}))
const BUNDLES = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  name: `bundle_${i + 1}`,
  description: `Bundle ${i + 1}`,
  content: `1girl, smile, bundle ${i + 1}`,
  thumbnailImageId: null,
  createdAt: TS,
  updatedAt: TS,
  imageCount: i % 3,
  thumbnailPath: null,
  tags:
    i % 2 === 0
      ? [
          { id: 1, name: 'outfit' },
          { id: 2, name: 'pose' },
        ]
      : [],
}))
const BOOKMARKS = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  name: `mock_tag_${i + 1}`,
  memo: null,
  thumbnailImageId: null,
  createdAt: TS,
  updatedAt: TS,
  thumbnailPath: null,
  imageCount: i % 3,
  tags: i % 2 === 0 ? [{ id: 1, name: 'favorite' }] : [],
}))
const batch = (id, status, extra = {}) => ({
  id,
  projectId: 1,
  label: `Batch ${id}`,
  queueOrder: id,
  status,
  createdAt: TS,
  jobCount: 2,
  totalImages: 20,
  completedImages: status === 'running' ? 8 : status === 'pending' ? 0 : 20,
  ...extra,
})
const jobs = (batchId) =>
  [1, 2].map((n) => ({
    id: batchId * 10 + n,
    batchId,
    queueOrder: n,
    projectId: 1,
    projectSceneId: n,
    sourceSceneId: null,
    totalCount: 10,
    completedCount: n === 1 ? 8 : 0,
    status: n === 1 ? 'running' : 'pending',
    errorMessage: null,
    createdAt: TS,
    projectName: 'Project 01',
    sceneName: `Scene ${n}`,
  }))

function handlers(opts) {
  const queueSummary = opts.queue
    ? {
        processing: true,
        queueLength: 3,
        queueStopped: null,
        stoppedJobId: null,
        globalStats: {
          totalPendingImages: 52,
          totalImages: 60,
          completedImages: 8,
          avgImageDurationMs: 7000,
          etaMs: 364000,
          sessionTiming: null,
        },
      }
    : {
        processing: false,
        queueLength: 0,
        queueStopped: null,
        stoppedJobId: null,
        globalStats: {
          totalPendingImages: 0,
          totalImages: 0,
          completedImages: 0,
          avgImageDurationMs: null,
          etaMs: null,
          sessionTiming: null,
        },
      }
  return {
    listProjects: () => PROJECTS,
    fetchQueueSummary: () => queueSummary,
    listQueueBatches: () =>
      opts.queue
        ? [batch(1, 'running'), batch(2, 'pending'), batch(3, 'pending')]
        : [],
    listRecentBatches: () =>
      opts.queue
        ? [
            batch(11, 'completed'),
            batch(12, 'completed'),
            batch(13, 'failed', { completedImages: 12 }),
            batch(14, 'cancelled', { completedImages: 3 }),
          ]
        : [],
    getBatchJobs: (id) => jobs(id),
    listImages: (a = {}) => {
      let list = IMAGES
      if (a.isFavorite) list = list.filter((x) => x.isFavorite)
      if (a.projectId) list = list.filter((x) => x.projectId === a.projectId)
      if (a.minRating) list = list.filter((x) => (x.rating ?? 0) >= a.minRating)
      if (a.minWinRate)
        list = list.filter((x) => {
          const n = x.tournamentWins + x.tournamentLosses
          return n > 0 && (x.tournamentWins / n) * 100 >= a.minWinRate
        })
      const page = a.page ?? 1
      const limit = a.limit ?? 40
      return list.slice((page - 1) * limit, page * limit)
    },
    getImageTagCounts: (a) => [
      { tagId: 1, count: a.imageIds.length },
      ...(a.imageIds.length > 1 ? [{ tagId: 2, count: 1 }] : []),
    ],
    getSetting: (key) =>
      (opts.onboardingStep1
        ? { nai_api_key: '', generation_delay: '1500', onboarding_step: '1' }
        : {
            nai_api_key: 'sk-mock-key-0000',
            generation_delay: '1500',
            onboarding_completed: 'true',
          })[key] ?? null,
    // Only for the onboarding check: records the write instead of aborting it
    ...(opts.settingWrites && {
      setSetting: (a) => {
        opts.settingWrites.push(a)
        return { success: true }
      },
    }),
    listImagesByPromptTag: (a) => ({
      total: 37,
      images: IMAGES.slice(0, 24).map(({ id, thumbnailPath, filePath }) => ({
        id,
        thumbnailPath,
        filePath,
      })),
    }),
    getStorageStats: () => ({
      totalFiles: 640,
      totalSize: 123456789,
      imageFiles: 320,
      thumbnailFiles: 320,
      dbRecords: 318,
      orphanFiles: 4,
      orphanSize: 2048,
    }),
    listTags: () => [
      { id: 1, name: 'keeper' },
      { id: 2, name: 'wip' },
    ],
    listProjectsForFilter: () => PROJECTS.map(({ id, name }) => ({ id, name })),
    listScenesForFilter: () =>
      Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `Scene ${i + 1}`,
      })),
    getImageDetailPage: (a) => {
      const base = IMAGES.find((x) => x.id === a.imageId) ?? IMAGES[0]
      return {
        ...base,
        tags: [],
        projectName: 'Project 01',
        projectSceneName: 'Scene 1',
        prevId: base.id + 1,
        nextId: base.id - 1,
        bundles: [],
      }
    },
    listBundles: () => BUNDLES,
    listBundleNames: () =>
      BUNDLES.map(({ id, name, content }) => ({ id, name, content })),
    getBundle: (id) => {
      const b = BUNDLES.find((x) => x.id === id) ?? BUNDLES[0]
      const { tags, thumbnailPath, ...rest } = b
      return { ...rest, imageCount: 6, thumbnailImageId: IMAGES[0].id }
    },
    listBundleImages: () => IMAGES.slice(0, 6),
    listBundleTags: () => [
      { id: 1, name: 'outfit' },
      { id: 2, name: 'pose' },
    ],
    listTagBookmarks: () => BOOKMARKS,
    getTagBookmark: (id) => {
      const b = BOOKMARKS.find((x) => x.id === id) ?? BOOKMARKS[0]
      const { thumbnailPath, imageCount, ...rest } = b
      return { ...rest, images: [] }
    },
    listBookmarkTags: () => [{ id: 1, name: 'favorite' }],
    searchDanbooruTags: () => [],
    getDanbooruTagDetail: (name) => ({
      name,
      category: 0,
      categoryLabel: 'general',
      postCount: 1234,
      isDeprecated: false,
      otherNames: [],
      aliases: [],
      implications: [],
      impliedBy: [],
      wikiBody: '',
      groupMembers: {},
    }),
  }
}

const svg = (seed) => {
  const hue = (seed * 47) % 360
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="hsl(${hue} 45% 32%)"/><circle cx="150" cy="130" r="55" fill="hsl(${hue} 55% 52%)"/></svg>`
}

async function newPage(width, height, opts = { queue: true }) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('87studio-locale', 'en')
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
  const mocks = handlers(opts)
  await page.route('**/_serverFn/**', async (route) => {
    const url = route.request().url()
    const name = fnName(url)
    const mock = mocks[name]
    if (WRITE.test(name) && !mock) {
      page.blocked.push(name)
      return route.abort()
    }
    if (mock) {
      return route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-tss-serialized': 'true',
        },
        body: envelope(mock(argsOf(url) ?? bodyArgs(route.request()))),
      })
    }
    return route.continue()
  })
  await page.route(/\/api\/(thumbnails|images|tag-images)\//, (route) => {
    const seed = [...route.request().url()].reduce(
      (a, c) => a + c.charCodeAt(0),
      0,
    )
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: svg(seed),
    })
  })
  return { ctx, page }
}

/** Entered by client-side navigation from /settings so loaders use fetch. */
async function navTo(page, to) {
  if (!page.url().startsWith(BASE)) {
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle' })
  }
  const link = page.locator(`a[href="${to}"]`).first()
  if (!(await link.isVisible())) {
    await page.locator('[data-sidebar="trigger"]').first().click()
    await settle(page, 400)
  }
  await page.locator(`a[href="${to}"]`).first().click()
  await settle(page, 1200)
}

const headerInfo = (page) =>
  page.evaluate(() => {
    const h = document.querySelector('[data-app-header]')
    if (!h) return null
    const actions = h.querySelector('[data-header-actions]')
    const count = h.querySelector('[data-header-count]')
    const r = h.getBoundingClientRect()
    return {
      height: Math.round(r.height),
      overflowX: h.scrollWidth > h.clientWidth + 1,
      title: h.querySelector('nav')?.textContent?.trim() ?? '',
      count: count?.textContent?.trim() ?? null,
      actionsRight: actions
        ? Math.round(actions.getBoundingClientRect().right)
        : null,
      actionsChildren: actions ? actions.children.length : 0,
      viewport: window.innerWidth,
    }
  })
const noPageOverflow = (page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  )
const hasH1 = (page) =>
  page.evaluate(() => document.querySelectorAll('h1').length)

async function frameChecks(page, label, { title, count, actions = true }) {
  const info = await headerInfo(page)
  check(!!info, `${label}: app header present`)
  if (!info) return
  check(info.height === 48, `${label}: header stays h-12 (${info.height}px)`)
  check(!info.overflowX, `${label}: header content does not overflow`)
  check(info.title.includes(title), `${label}: header title "${info.title}"`)
  if (count !== undefined) {
    check(
      info.count !== null &&
        (count instanceof RegExp
          ? count.test(info.count)
          : info.count === String(count)),
      `${label}: header count ${info.count}`,
    )
  }
  if (actions) {
    check(info.actionsChildren > 0, `${label}: header has actions`)
    check(
      info.actionsRight !== null && info.actionsRight <= info.viewport,
      `${label}: actions inside viewport (${info.actionsRight}/${info.viewport})`,
    )
  }
  check((await hasH1(page)) === 0, `${label}: no in-page title (h1)`)
  check(await noPageOverflow(page), `${label}: no horizontal page overflow`)
}

const param = (page, key) => new URL(page.url()).searchParams.get(key)

// ───────── Dashboard ─────────
async function dashboard(w, h, tag) {
  console.log(`== dashboard ${w}x${h}`)
  const { ctx, page } = await newPage(w, h, { queue: true })
  await navTo(page, '/')
  await frameChecks(page, `dashboard ${tag}`, { title: 'Projects', count: 12 })
  const cards = await page.locator('[data-project-card]').count()
  check(cards === 12, `dashboard ${tag}: 12 project cards (${cards})`)
  check(
    (await page.locator('[data-new-project-card]').count()) === 1,
    `dashboard ${tag}: dashed new-project card`,
  )
  const gridW = await page
    .locator('[data-project-grid]')
    .evaluate((el) => Math.round(el.getBoundingClientRect().width))
  if (w >= 1024)
    check(gridW > 900, `dashboard ${tag}: grid is full width (${gridW}px)`)
  else check(gridW > w - 48, `dashboard ${tag}: grid fills width (${gridW}px)`)
  check(
    (await page.locator('[data-running-strip]').count()) === 1,
    `dashboard ${tag}: running strip shown while queue is active`,
  )
  check(
    (await page.locator('[data-running-strip]').innerText()).includes('8/60'),
    `dashboard ${tag}: running strip shows done/total`,
  )
  check(
    (await page.locator('[data-running-strip]').innerText()).includes(
      'Project 01 · Scene 1',
    ),
    `dashboard ${tag}: running strip shows project · scene`,
  )
  const btn = await page
    .locator('[data-onboarding="new-project-btn"]')
    .evaluate((el) => {
      const c = getComputedStyle(el)
      return {
        h: Math.round(el.getBoundingClientRect().height),
        fs: c.fontSize,
      }
    })
  check(
    btn.h === 32 && btn.fs === '13px',
    `dashboard ${tag}: header action is compact (${btn.h}px / ${btn.fs})`,
  )
  const cover = await page.locator('[data-project-card] img').count()
  check(
    cover === 9,
    `dashboard ${tag}: covers for projects with a thumbnail (${cover}/9)`,
  )
  const meta = norm(
    await page.locator('[data-project-card]').nth(1).innerText(),
  )
  check(
    /\d+ scenes/.test(meta) && /\d+ images|No images/.test(meta),
    `dashboard ${tag}: card meta "${meta}"`,
  )
  await shot(page, `dashboard-${tag}`)
  // search filters client-side
  await page.locator('[data-project-search]').fill('Project 03')
  await settle(page, 200)
  check(
    (await page.locator('[data-project-card]').count()) === 1,
    `dashboard ${tag}: header search filters by name`,
  )
  await page.locator('[data-project-search]').fill('')
  // new project dialog opens from the header button
  await page.locator('[data-onboarding="new-project-btn"]').click()
  await settle(page, 300)
  check(
    (await page
      .locator('[data-onboarding="create-project-dialog"]')
      .count()) === 1,
    `dashboard ${tag}: New project opens the dialog`,
  )
  await page.keyboard.press('Escape')
  check(page.blocked.length === 0, `dashboard ${tag}: no writes sent`)
  await ctx.close()

  // idle queue: no strip
  const idle = await newPage(w, h, { queue: false })
  await navTo(idle.page, '/')
  check(
    (await idle.page.locator('[data-running-strip]').count()) === 0,
    `dashboard ${tag}: no running strip when the queue is idle`,
  )
  await idle.ctx.close()
}

// ───────── Gallery ─────────
const firstRowCols = (page) =>
  page.evaluate(() => {
    const grid = document.querySelector('[data-gallery-grid]')
    const row = grid?.querySelector(
      'div > div > div[style*="translateY"] > div',
    )
    return row ? row.children.length : 0
  })

async function gallery(w, h, tag) {
  console.log(`== gallery ${w}x${h}`)
  const { ctx, page } = await newPage(w, h)
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('87studio-grid-gallery')
    } catch {}
  })
  await navTo(page, '/gallery')
  await frameChecks(page, `gallery ${tag}`, {
    title: 'Gallery',
    count: /^\d+\+?$/,
  })
  check(
    (await page.locator('[data-gallery-select]').count()) === 1 &&
      (await page.locator('[data-gallery-export]').count()) === 1,
    `gallery ${tag}: Select and Export in the header`,
  )
  check(
    (await page.locator('[data-favorite-badge]').count()) > 0,
    `gallery ${tag}: favorites carry a star badge`,
  )
  await shot(page, `gallery-${tag}`)

  // ── filter chips ──
  await page.locator('[data-add-filter]').click()
  await page.locator('[data-filter-option="favorite"]').click()
  await settle(page, 800)
  check(
    param(page, 'favorite') === 'true',
    `gallery ${tag}: adding Favorites sets ?favorite`,
  )
  check(
    (await page.locator('[data-filter-chip="favorite"]').count()) === 1,
    `gallery ${tag}: favorite chip shown`,
  )
  await page.locator('[data-add-filter]').click()
  await page.locator('[data-filter-menu="project"]').click()
  await page.locator('[data-filter-option="project-3"]').click()
  await settle(page, 800)
  check(
    param(page, 'project') === '3',
    `gallery ${tag}: choosing a project sets ?project=3`,
  )
  check(
    norm(await page.locator('[data-filter-chip="project"]').innerText()) ===
      'Project 03',
    `gallery ${tag}: project chip shows its name`,
  )
  await shot(page, `gallery-chips-${tag}`)
  await page.locator('[data-filter-chip="project"] button').click()
  await settle(page, 800)
  check(
    param(page, 'project') === null,
    `gallery ${tag}: removing the project chip clears ?project`,
  )
  check(param(page, 'favorite') === 'true', `gallery ${tag}: other chips stay`)
  await page.locator('[data-filter-chip="favorite"] button').click()
  await settle(page, 800)
  check(
    param(page, 'favorite') === null &&
      (await page.locator('[data-filter-chip]').count()) === 0,
    `gallery ${tag}: removing the last chip clears the filters`,
  )

  // ── card size slider ──
  const before = await firstRowCols(page)
  const thumb = page.locator('[data-gallery-size] [role="slider"]').first()
  await thumb.focus()
  await page.keyboard.press('ArrowRight')
  await settle(page, 600)
  const after = await firstRowCols(page)
  check(
    after < before,
    `gallery ${tag}: size slider changes the columns (${before} -> ${after})`,
  )
  const stored = await page.evaluate(() =>
    localStorage.getItem('87studio-grid-gallery'),
  )
  check(stored === 'lg', `gallery ${tag}: card size persisted (${stored})`)
  await page.keyboard.press('ArrowLeft')
  await settle(page, 400)

  // ── infinite scroll ──
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await settle(page, 1200)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await settle(page, 1200)
  const grown = Number((await headerInfo(page)).count.replace('+', ''))
  check(grown > 40, `gallery ${tag}: infinite scroll loads more (${grown})`)
  await page.evaluate(() => window.scrollTo(0, 0))
  await settle(page, 300)

  // ── select mode ──
  await page.locator('[data-gallery-select]').click()
  await settle(page, 300)
  const sel = await page.evaluate(() => {
    const h = document.querySelector('[data-app-header]')
    const bar = h?.querySelector('[data-selection-header]')
    return {
      inHeader: !!bar,
      text: bar?.textContent?.trim() ?? '',
      floating: !!document.querySelector('.fixed.bottom-4'),
      crumbVisible:
        !!h?.querySelector('nav') &&
        h.querySelector('nav').getClientRects().length > 0,
    }
  })
  check(
    sel.inHeader,
    `gallery ${tag}: selection header replaces the header actions`,
  )
  check(
    /^0 selected/.test(norm(sel.text)),
    `gallery ${tag}: "0 selected" (${norm(sel.text)})`,
  )
  check(!sel.crumbVisible, `gallery ${tag}: breadcrumb hidden while selecting`)
  check(
    !(await headerInfo(page)).overflowX,
    `gallery ${tag}: selection header fits`,
  )
  const cell = page
    .locator('[data-gallery-grid] .shrink-0[style*="width"]')
    .first()
  await cell.click()
  await page
    .locator('[data-gallery-grid] .shrink-0[style*="width"]')
    .nth(1)
    .click()
  await settle(page, 200)
  check(
    /^2 selected/.test(
      norm(await page.locator('[data-selection-header]').innerText()),
    ),
    `gallery ${tag}: clicking cards selects them (${norm(await page.locator('[data-selection-header]').innerText())})`,
  )
  await shot(page, `gallery-select-${tag}`)
  await page.locator('[data-selection-header] [role="checkbox"]').click()
  await settle(page, 200)
  check(
    /^\d+ selected/.test(
      norm(await page.locator('[data-selection-header]').innerText()),
    ) &&
      Number(
        norm(await page.locator('[data-selection-header]').innerText()).match(
          /^(\d+)/,
        )[1],
      ) >= 40,
    `gallery ${tag}: select all`,
  )
  check(
    !(await page.evaluate(() => !!document.querySelector('.fixed.bottom-4'))),
    `gallery ${tag}: no floating bulk bar`,
  )
  await page.locator('[data-add-filter]').click()
  await page.locator('[data-filter-option="favorite"]').click()
  await settle(page, 1000)
  check(
    /^0 selected/.test(
      norm(await page.locator('[data-selection-header]').innerText()),
    ),
    `gallery ${tag}: changing a filter clears the selection`,
  )
  await page.locator('[data-selection-header] button').first().click()
  await settle(page, 300)
  check(
    (await page.locator('[data-selection-header]').count()) === 0 &&
      (await page.locator('[data-gallery-select]').count()) === 1,
    `gallery ${tag}: exit restores the header actions`,
  )

  // ── image detail adopts the frame ──
  await page.locator('[data-gallery-grid] a[href^="/gallery/"]').first().click()
  await settle(page, 1500)
  check(
    /\/gallery\/\d+/.test(page.url()),
    `gallery ${tag}: opens image detail (${new URL(page.url()).pathname})`,
  )
  const d = await page.evaluate(() => {
    const h = document.querySelector('[data-app-header]')
    const o = document.querySelector('[data-image-detail]')
    return {
      crumb: h?.querySelector('nav')?.textContent?.trim() ?? '',
      hasFav: !!h?.querySelector('[data-detail-favorite]'),
      hBottom: Math.round(h?.getBoundingClientRect().bottom ?? -1),
      oTop: Math.round(o?.getBoundingClientRect().top ?? -2),
      oLeft: Math.round(o?.getBoundingClientRect().left ?? -2),
      hLeft: Math.round(h?.getBoundingClientRect().left ?? -1),
      headerOverflow: h ? h.scrollWidth > h.clientWidth + 1 : true,
    }
  })
  check(
    /Gallery.*#\d+/.test(d.crumb),
    `gallery ${tag}: detail breadcrumb "${d.crumb}"`,
  )
  check(d.hasFav, `gallery ${tag}: detail actions live in the header`)
  check(
    Math.abs(d.oTop - d.hBottom) <= 1,
    `gallery ${tag}: detail starts below the header (${d.oTop}/${d.hBottom})`,
  )
  check(
    Math.abs(d.oLeft - d.hLeft) <= 1,
    `gallery ${tag}: detail starts right of the sidebar (${d.oLeft}/${d.hLeft})`,
  )
  check(!d.headerOverflow, `gallery ${tag}: detail header fits`)
  if (w >= 768) {
    await page.goBack()
    await page.waitForSelector('[data-gallery-select]')
    await page.locator('[data-sidebar="trigger"]').first().click()
    await settle(page, 600)
    await page
      .locator('[data-gallery-grid] a[href^="/gallery/"]')
      .first()
      .click()
    await settle(page, 1200)
    const c = await page.evaluate(() => ({
      o: Math.round(
        document.querySelector('[data-image-detail]')?.getBoundingClientRect()
          .left ?? -2,
      ),
      h: Math.round(
        document.querySelector('[data-app-header]')?.getBoundingClientRect()
          .left ?? -1,
      ),
    }))
    check(
      c.o === c.h && c.h < 100,
      `gallery ${tag}: detail follows the collapsed sidebar (${c.o}/${c.h})`,
    )
  }
  await shot(page, `gallery-detail-${tag}`)
  check(page.blocked.length === 0, `gallery ${tag}: no writes sent`)
  await ctx.close()
}

// ───────── Bundles / Tags (master-detail) ─────────
async function masterDetail(
  w,
  h,
  tag,
  { to, name, count, newAttr, storageKey },
) {
  console.log(`== ${name} ${w}x${h}`)
  const { ctx, page } = await newPage(w, h)
  await navTo(page, to)
  await frameChecks(page, `${name} ${tag}`, {
    title: name,
    count,
    actions: false,
  })
  const mobile = w < 768
  const rowsSel = '[data-list-row]'
  check(
    (await page.locator(rowsSel).count()) === 10,
    `${name} ${tag}: 10 list rows`,
  )
  check(
    (await page.locator(newAttr).count()) === 1,
    `${name} ${tag}: New button at the top of the list`,
  )
  const mode = await page
    .locator('[data-master-detail]')
    .getAttribute('data-master-detail')
  check(
    mode === (mobile ? 'mobile' : 'desktop'),
    `${name} ${tag}: ${mode} layout`,
  )
  await shot(page, `${name}-${tag}`)
  if (mobile) {
    check(
      (await page.locator('[data-master-detail-back]').count()) === 0,
      `${name} ${tag}: list only before selecting`,
    )
    await page.locator(rowsSel).nth(1).click()
    await settle(page, 1000)
    check(
      (await page.locator('[data-master-detail-back]').count()) === 1 &&
        (await page.locator(rowsSel).count()) === 0,
      `${name} ${tag}: selecting opens the detail with a back button`,
    )
    await shot(page, `${name}-detail-${tag}`)
    check(
      await noPageOverflow(page),
      `${name} ${tag}: detail has no horizontal overflow`,
    )
    await page.locator('[data-master-detail-back]').click()
    await settle(page, 400)
    check(
      (await page.locator(rowsSel).count()) === 10,
      `${name} ${tag}: back returns to the list`,
    )
    await page.locator(rowsSel).nth(2).click()
    await settle(page, 600)
    await page.goBack()
    await settle(page, 800)
    check(
      (await page.locator(rowsSel).count()) === 10 &&
        (await page.locator('[data-master-detail-back]').count()) === 0,
      `${name} ${tag}: phone Back from a detail returns to the list`,
    )
  } else {
    await page.locator(rowsSel).nth(1).click()
    await settle(page, 1200)
    check(
      (await page.locator('[data-list-row][data-active]').count()) === 1,
      `${name} ${tag}: row selection highlights`,
    )
    await shot(page, `${name}-detail-${tag}`)
    const handle = page.locator('[data-slot="resizable-handle"]').first()
    const hb = await handle.boundingBox()
    const listBefore = await page
      .locator('[data-slot="resizable-panel"]')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().width))
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + 120, hb.y + hb.height / 2, { steps: 6 })
    await page.mouse.up()
    await settle(page, 400)
    const listAfter = await page
      .locator('[data-slot="resizable-panel"]')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().width))
    check(
      listAfter > listBefore + 40,
      `${name} ${tag}: list pane is resizable (${listBefore} -> ${listAfter})`,
    )
    const saved = await page.evaluate(
      (k) => localStorage.getItem(k),
      storageKey,
    )
    check(!!saved, `${name} ${tag}: pane layout persisted (${saved})`)
  }
  check(page.blocked.length === 0, `${name} ${tag}: no writes sent`)
  await ctx.close()
}

// ───────── Queue ─────────
async function queue(w, h, tag) {
  console.log(`== queue ${w}x${h}`)
  const { ctx, page } = await newPage(w, h, { queue: true })
  await navTo(page, '/queue')
  await frameChecks(page, `queue ${tag}`, { title: 'Queue', count: 3 })
  const card = page.locator('[data-now-generating]')
  check((await card.count()) === 1, `queue ${tag}: now-generating card`)
  const txt = norm(await card.innerText())
  check(
    /Project 01 · Scene 1/.test(txt) && /8\/20/.test(txt),
    `queue ${tag}: card shows project · scene and progress ("${txt}")`,
  )
  check(
    (await card.locator('img').count()) === 1,
    `queue ${tag}: card shows the latest image preview`,
  )
  const cw = await card.evaluate((el) =>
    Math.round(el.getBoundingClientRect().width),
  )
  if (w >= 1024) check(cw > 900, `queue ${tag}: full width (${cw}px)`)
  const pending = norm(
    await page.locator('[data-pending-batches] h2').innerText(),
  )
  check(
    /\(2\)/.test(pending),
    `queue ${tag}: pending batches list (${pending})`,
  )
  const hist = page.locator('[data-queue-history]')
  check((await hist.count()) === 1, `queue ${tag}: history section`)
  check(
    (await hist.locator('button[aria-expanded="false"]').count()) === 1 &&
      (await hist.locator('div.rounded-lg.border').count()) === 0,
    `queue ${tag}: history collapsed by default`,
  )
  check(
    /\(4\)/.test(norm(await hist.innerText())),
    `queue ${tag}: history shows its count`,
  )
  await page.locator('[data-now-generating-expand]').click()
  await settle(page, 600)
  check(
    (await card.innerText()).includes('Scene 2'),
    `queue ${tag}: running batch expands to its job list`,
  )
  await shot(page, `queue-${tag}`)
  await hist.locator('button').first().click()
  await settle(page, 300)
  check(
    (await hist.locator('div.rounded-lg.border').count()) === 4,
    `queue ${tag}: expanding history lists the batches`,
  )
  await shot(page, `queue-history-${tag}`)
  check(page.blocked.length === 0, `queue ${tag}: no writes sent`)
  await ctx.close()

  const idle = await newPage(w, h, { queue: false })
  await navTo(idle.page, '/queue')
  check(
    (await idle.page.getByText('No pending tasks').count()) === 1,
    `queue ${tag}: empty state when idle`,
  )
  await idle.ctx.close()
}

// ───────── Phase 5: settings, metadata, gallery tools ─────────

/** A real (CRC-valid) PNG with an NAI-style tEXt "Comment" chunk. */
function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
function makeNaiPng(w, h, comment) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const stride = w * 3 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = y * stride + 1 + x * 3
      raw[o] = (x * 255) / w
      raw[o + 1] = (y * 255) / h
      raw[o + 2] = 160
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', Buffer.from(`Comment\0${JSON.stringify(comment)}`)),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}
const NAI_SAMPLE = {
  prompt: '1girl, solo, smile, masterpiece',
  uc: 'lowres, bad anatomy',
  steps: 28,
  scale: 5,
  seed: 1234567890,
  sampler: 'k_euler_ancestral',
  width: 416,
  height: 608,
  v4_prompt: {
    caption: {
      base_caption: '1girl, solo',
      char_captions: [
        { char_caption: 'girl, red hair', centers: [{ x: 0.5, y: 0.5 }] },
        { char_caption: 'boy, black hair', centers: [{ x: 0.2, y: 0.5 }] },
      ],
    },
  },
  v4_negative_prompt: {
    caption: {
      base_caption: 'lowres',
      char_captions: [{ char_caption: 'bad hands', centers: [] }],
    },
  },
}

async function settingsPage(w, h, tag) {
  console.log(`== settings ${w}x${h}`)
  const { ctx, page } = await newPage(w, h)
  await page.goto(BASE + '/metadata', { waitUntil: 'networkidle' })
  await navTo(page, '/settings')
  await settle(page, 800)
  await frameChecks(page, `settings ${tag}`, {
    title: 'Settings',
    actions: false,
  })
  const desktop = w >= 1024
  const nav = page.locator('[data-settings-nav]')
  const chips = page.locator('[data-settings-chips]')
  check(
    (await nav.isVisible()) === desktop &&
      (await chips.isVisible()) === !desktop,
    `settings ${tag}: ${desktop ? 'side nav' : 'chip row'} shown`,
  )
  const control = desktop ? nav : chips
  check(
    (await control.locator('button').count()) === 5,
    `settings ${tag}: 5 sections in the nav`,
  )
  check(
    (await page.locator('section[id^="settings-"]').count()) === 5,
    `settings ${tag}: 5 section cards`,
  )
  if (!desktop) {
    const top = await chips.evaluate((el) => el.getBoundingClientRect().top)
    await page.evaluate(() => window.scrollTo(0, 400))
    await settle(page, 200)
    const topAfter = await chips.evaluate(
      (el) => el.getBoundingClientRect().top,
    )
    check(
      Math.abs(topAfter - 48) <= 1 && top > 0,
      `settings ${tag}: chip row sticks under the header (${topAfter}px)`,
    )
    await page.evaluate(() => window.scrollTo(0, 0))
    await settle(page, 200)
  }
  // content stays within the 720px column
  const colW = await page.evaluate(
    () =>
      document.getElementById('settings-general').getBoundingClientRect().width,
  )
  check(
    colW <= 721,
    `settings ${tag}: cards max ~720px (${Math.round(colW)}px)`,
  )
  // API key
  const input = page.locator('#api-key')
  check(
    (await input.getAttribute('type')) === 'password',
    `settings ${tag}: API key masked`,
  )
  await page.locator('#settings-general button[aria-label]').first().click()
  check(
    (await input.getAttribute('type')) === 'text',
    `settings ${tag}: show/hide toggles the key`,
  )
  check(
    /Set/.test(await page.locator('[data-key-status]').innerText()),
    `settings ${tag}: key status badge "${norm(await page.locator('[data-key-status]').innerText())}"`,
  )
  // scroll-spy + click-to-scroll
  await control.locator('button', { hasText: 'Storage' }).click()
  await settle(page, 900)
  check(
    (await control
      .locator('button[aria-current="true"]')
      .innerText()
      .catch(() => '')) === 'Storage',
    `settings ${tag}: clicking Storage activates it`,
  )
  const stTop = await page.evaluate(
    () =>
      document.getElementById('settings-storage').getBoundingClientRect().top,
  )
  check(
    stTop < h && (await page.evaluate(() => window.scrollY)) > 0,
    `settings ${tag}: Storage scrolled into view (${Math.round(stTop)}px)`,
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await settle(page, 200)
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  )
  await settle(page, 400)
  check(
    (await control
      .locator('button[aria-current="true"]')
      .innerText()
      .catch(() => '')) === 'Help',
    `settings ${tag}: scroll-spy reaches Help at the bottom`,
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await settle(page, 300)
  // delay numeric input commits via setSetting (aborted)
  const delayInput = page.locator('#delay-input')
  check(
    (await delayInput.inputValue()) === '1500',
    `settings ${tag}: delay input shows saved value`,
  )
  await delayInput.fill('2500')
  await delayInput.blur()
  await settle(page, 400)
  check(
    page.blocked.includes('setSetting'),
    `settings ${tag}: delay edit sends setSetting (aborted)`,
  )
  // storage: scan, then cleanup asks for confirmation
  await page.locator('#settings-storage button', { hasText: /^Scan$/ }).click()
  await settle(page, 600)
  const cleanup = page.locator('#settings-storage button', {
    hasText: 'Clean up',
  })
  check(
    (await cleanup.count()) === 1,
    `settings ${tag}: orphan cleanup offered`,
  )
  await cleanup.scrollIntoViewIfNeeded()
  await cleanup.click()
  await settle(page, 400)
  check(
    (await page.getByRole('alertdialog').count()) === 1,
    `settings ${tag}: cleanup asks for confirmation`,
  )
  await shot(page, `settings-confirm-${tag}`)
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel' })
    .click()
  await settle(page, 300)
  await page.evaluate(() => window.scrollTo(0, 0))
  await settle(page, 200)
  await shot(page, `settings-${tag}`)
  check(
    await noPageOverflow(page),
    `settings ${tag}: no horizontal page overflow`,
  )
  check(
    !page.blocked.includes('cleanupOrphanFiles'),
    `settings ${tag}: cleanup not triggered`,
  )
  await ctx.close()
}

async function metadataPage(w, h, tag) {
  console.log(`== metadata ${w}x${h}`)
  const { ctx, page } = await newPage(w, h)
  await page.goto(BASE + '/metadata', { waitUntil: 'networkidle' })
  await settle(page, 600)
  await frameChecks(page, `metadata ${tag}`, {
    title: 'Metadata',
    actions: false,
  })
  const zone = page.locator('[data-metadata-dropzone]')
  const zr = await zone.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return {
      h: Math.round(r.height),
      w: Math.round(r.width),
      top: Math.round(r.top),
    }
  })
  check(
    zr.h >= h * 0.7 && zr.w >= w * 0.5,
    `metadata ${tag}: drop zone fills the content area (${zr.w}x${zr.h})`,
  )
  check(
    (await zone.innerText()).includes('Drop an NAI image or click to choose'),
    `metadata ${tag}: drop zone copy`,
  )
  await shot(page, `metadata-empty-${tag}`)
  const file = (name, extra = {}) => ({
    name,
    mimeType: 'image/png',
    buffer: makeNaiPng(416, 608, { ...NAI_SAMPLE, ...extra }),
  })
  await page.locator('input[type="file"]').setInputFiles(file('first.png'))
  await settle(page, 1500)
  const tabs = page.locator('[data-metadata-tabs] [role="tab"]')
  check(
    (await tabs.count()) === 4,
    `metadata ${tag}: Prompt / Characters / Parameters / Raw tabs (${await tabs.count()})`,
  )
  check(
    (await page.locator('[data-metadata-preview]').innerText()).includes(
      'first.png',
    ),
    `metadata ${tag}: file name shown`,
  )
  check(
    /KB/.test(await page.locator('[data-metadata-preview]').innerText()),
    `metadata ${tag}: file size shown`,
  )
  check(
    (await page
      .locator('[data-metadata-preview] [data-metadata-replace]')
      .count()) === 1,
    `metadata ${tag}: Replace button`,
  )
  const layout = await page.evaluate(() => {
    const p = document
      .querySelector('[data-metadata-preview]')
      .getBoundingClientRect()
    const t = document
      .querySelector('[data-metadata-tabs]')
      .getBoundingClientRect()
    const box = document
      .querySelector('[data-metadata-preview] > div')
      .getBoundingClientRect()
    return {
      sideBySide: t.left >= p.right - 1,
      stacked: t.top >= p.bottom - 1,
      imgBox: Math.round(box.height),
    }
  })
  check(
    w >= 1024 ? layout.sideBySide : layout.stacked,
    `metadata ${tag}: ${w >= 1024 ? 'two panes' : 'stacked, image on top'}`,
  )
  if (w < 1024) {
    check(
      layout.imgBox <= Math.round(h * 0.4) + 1,
      `metadata ${tag}: image max 40vh (${layout.imgBox}/${Math.round(h * 0.4)})`,
    )
  }
  check(
    (
      await page
        .locator('[data-metadata-tabs] [role="tabpanel"][data-state="active"]')
        .innerText()
    ).includes('1girl, solo, smile'),
    `metadata ${tag}: positive prompt shown`,
  )
  check(
    (await page.getByRole('button', { name: /^Copy: Positive/ }).count()) === 1,
    `metadata ${tag}: prompt copy button`,
  )
  await tabs.nth(1).click()
  await settle(page, 300)
  const chars = await page
    .locator('[data-metadata-tabs] [role="tabpanel"][data-state="active"]')
    .innerText()
  check(
    /girl, red hair/.test(chars) && /boy, black hair/.test(chars),
    `metadata ${tag}: per-character captions`,
  )
  check(
    (await page.getByRole('button', { name: /^Copy: Character/ }).count()) >= 2,
    `metadata ${tag}: per-character copy buttons`,
  )
  await tabs.nth(2).click()
  await settle(page, 300)
  const params = await page
    .locator('[data-metadata-tabs] [role="tabpanel"][data-state="active"]')
    .innerText()
  check(
    /Seed/.test(params) && /1234567890/.test(params) && /Steps/.test(params),
    `metadata ${tag}: parameters grid`,
  )
  check(
    (await page.getByRole('button', { name: 'Copy: Seed' }).count()) === 1,
    `metadata ${tag}: seed copy button`,
  )
  await tabs.nth(3).click()
  await settle(page, 300)
  check(
    /"steps": 28/.test(
      await page.locator('[data-metadata-tabs] pre').innerText(),
    ),
    `metadata ${tag}: raw JSON`,
  )
  await tabs.nth(0).click()
  await shot(page, `metadata-loaded-${tag}`)
  // header actions
  const hdr = await headerInfo(page)
  check(
    hdr.actionsChildren >= 2 &&
      !hdr.overflowX &&
      hdr.actionsRight <= hdr.viewport,
    `metadata ${tag}: header actions fit (${hdr.actionsChildren})`,
  )
  check(
    (await page
      .locator('[data-app-header] button[aria-label="Create Project"]')
      .count()) === 1,
    `metadata ${tag}: Create Project action`,
  )
  // dropping a new image anywhere replaces the current one
  const second = makeNaiPng(300, 300, {
    ...NAI_SAMPLE,
    prompt: 'second image prompt',
  })
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'second.png', { type: 'image/png' }))
    document.dispatchEvent(
      new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }),
    )
    document.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true }),
    )
  }, second.toString('base64'))
  await settle(page, 1500)
  check(
    (await page.locator('[data-metadata-preview]').innerText()).includes(
      'second.png',
    ) &&
      (
        await page
          .locator(
            '[data-metadata-tabs] [role="tabpanel"][data-state="active"]',
          )
          .innerText()
      ).includes('second image prompt'),
    `metadata ${tag}: drop replaces the loaded image`,
  )
  check(
    await noPageOverflow(page),
    `metadata ${tag}: no horizontal page overflow`,
  )
  check(page.blocked.length === 0, `metadata ${tag}: no writes sent`)
  await ctx.close()
}

async function galleryTools(w, h, tag) {
  console.log(`== gallery tools ${w}x${h}`)
  const { ctx, page } = await newPage(w, h)
  await navTo(page, '/gallery')
  // ── min win-rate filter ──
  await page.locator('[data-add-filter]').click()
  await page.locator('[data-filter-menu="winrate"]').click()
  await settle(page, 300)
  check(
    (await page.locator('[data-filter-option^="winrate-"]').count()) === 4,
    `gallery tools ${tag}: win-rate presets 50/60/70/80`,
  )
  await page.locator('[data-filter-option="winrate-60"]').click()
  await settle(page, 1200)
  check(
    param(page, 'minWinRate') === '60',
    `gallery tools ${tag}: minWinRate in the URL (${param(page, 'minWinRate')})`,
  )
  const chip = page.locator('[data-filter-chip="winrate"]')
  check(
    (await chip.count()) === 1 && /60%\+ win rate/.test(await chip.innerText()),
    `gallery tools ${tag}: win-rate chip`,
  )
  const gridImgs = await page
    .locator('[data-gallery-grid] a[href^="/gallery/"]')
    .count()
  check(
    gridImgs > 0 && gridImgs <= 100,
    `gallery tools ${tag}: list is filtered (${gridImgs})`,
  )
  await shot(page, `gallery-winrate-${tag}`)
  await chip.locator('button').click()
  await settle(page, 1000)
  check(
    param(page, 'minWinRate') === null &&
      (await page.locator('[data-filter-chip]').count()) === 0,
    `gallery tools ${tag}: removing the chip clears the filter`,
  )

  // ── select + bulk tag ──
  await page.locator('[data-gallery-select]').click()
  await settle(page, 300)
  const cells = page.locator('[data-gallery-grid] .shrink-0[style*="width"]')
  await cells.nth(0).click()
  await cells.nth(1).click()
  await settle(page, 200)
  const info = await headerInfo(page)
  check(
    !info.overflowX,
    `gallery tools ${tag}: selection header fits with Tag/Bookmark actions`,
  )
  await page.locator('[data-gallery-bulk-tag]').click()
  await settle(page, 600)
  const pop = page.locator('[data-bulk-tag-popover]')
  check((await pop.count()) === 1, `gallery tools ${tag}: tag popover opens`)
  const states = await pop
    .locator('[data-tag-option]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-tag-state')))
  check(
    states.join(',') === 'all,some',
    `gallery tools ${tag}: tag states reflect the selection (${states.join(',')})`,
  )
  await shot(page, `gallery-bulk-tag-${tag}`)
  await pop.locator('[data-tag-option="2"]').click()
  await settle(page, 400)
  check(
    page.blocked.includes('bulkUpdateImageTags'),
    `gallery tools ${tag}: toggling a tag calls bulkUpdateImageTags (aborted)`,
  )
  await pop.getByPlaceholder(/tag/i).fill('Brand New')
  await settle(page, 300)
  check(
    (await pop.locator('[data-tag-create]').count()) === 1 &&
      /brand new/.test(await pop.locator('[data-tag-create]').innerText()),
    `gallery tools ${tag}: new tag can be created`,
  )
  await page.keyboard.press('Escape')
  await settle(page, 300)

  // ── bulk add to tag bookmark ──
  await page.locator('[data-gallery-bulk-bookmark]').click()
  await settle(page, 600)
  const bp = page.locator('[data-bookmark-popover]')
  check(
    (await bp.locator('[data-bookmark-option]').count()) === 10,
    `gallery tools ${tag}: bookmark list (${await bp.locator('[data-bookmark-option]').count()})`,
  )
  await bp.getByPlaceholder(/bookmark/i).fill('zz-new-bookmark')
  await settle(page, 300)
  check(
    (await bp.locator('[data-bookmark-create]').count()) === 1,
    `gallery tools ${tag}: bookmark can be created from the search`,
  )
  await shot(page, `gallery-bulk-bookmark-${tag}`)
  await bp.getByPlaceholder(/bookmark/i).fill('')
  await bp.locator('[data-bookmark-option]').first().click()
  await settle(page, 400)
  check(
    page.blocked.includes('addBookmarkImagesFromGallery'),
    `gallery tools ${tag}: picking a bookmark calls addBookmarkImagesFromGallery (aborted)`,
  )
  await page.keyboard.press('Escape')
  await page.locator('[data-selection-header] button').first().click()
  await settle(page, 300)

  // ── image detail (route + overlay) ──
  await page.locator('[data-gallery-grid] a[href^="/gallery/"]').first().click()
  await settle(page, 1500)
  check(
    (await page.locator('[data-app-header] [data-detail-bookmark]').count()) ===
      1,
    `gallery tools ${tag}: detail has "Add to tag bookmark" in the header`,
  )
  await page.locator('[data-app-header] [data-detail-bookmark]').click()
  await settle(page, 600)
  check(
    (await page
      .locator('[data-bookmark-popover] [data-bookmark-option]')
      .count()) === 10,
    `gallery tools ${tag}: detail bookmark picker lists bookmarks`,
  )
  await shot(page, `gallery-detail-bookmark-${tag}`)
  await page.keyboard.press('Escape')
  await ctx.close()

  // overlay (global imageDetail param on a non-gallery page)
  const ov = await newPage(w, h)
  await navTo(ov.page, '/queue')
  await ov.page.evaluate(() => {
    const u = new URL(location.href)
    u.searchParams.set('imageDetail', '1000')
    history.pushState({}, '', u)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await settle(ov.page, 1500)
  const overlayBtn = ov.page.locator('[role="dialog"] [data-detail-bookmark]')
  check(
    (await overlayBtn.count()) === 1,
    `gallery tools ${tag}: overlay has "Add to tag bookmark"`,
  )
  if ((await overlayBtn.count()) === 1) {
    await overlayBtn.click()
    await settle(ov.page, 600)
    check(
      (await ov.page
        .locator('[data-bookmark-popover] [data-bookmark-option]')
        .count()) === 10,
      `gallery tools ${tag}: overlay bookmark picker lists bookmarks`,
    )
  }
  await ov.ctx.close()
}

async function bundleImagesTest(w, h, tag) {
  console.log(`== bundle images ${w}x${h}`)
  const { ctx, page } = await newPage(w, h)
  await navTo(page, '/bundles')
  await page.locator('[data-list-row]').first().click()
  await settle(page, 1200)
  const tiles = page.locator('[data-bundle-tile]')
  check(
    (await tiles.count()) === 6,
    `bundle images ${tag}: 6 tiles (${await tiles.count()})`,
  )
  check(
    (await page.locator('[data-bundle-thumb-mark]').count()) === 1,
    `bundle images ${tag}: current thumbnail is marked`,
  )
  check(
    (await page.locator('[data-bundle-size]').count()) === 1,
    `bundle images ${tag}: card size slider`,
  )
  await shot(page, `bundle-images-${tag}`)
  // click opens the detail overlay (and does not set the thumbnail)
  const second = await tiles.nth(1).getAttribute('data-bundle-tile')
  await tiles.nth(1).locator('button').first().click()
  await settle(page, 1500)
  check(
    param(page, 'imageDetail') === second &&
      param(page, 'detailBundle') !== null,
    `bundle images ${tag}: tile click opens the overlay (imageDetail=${param(page, 'imageDetail')})`,
  )
  check(
    (await page
      .locator('[role="dialog"] [data-detail-bundle-thumb]')
      .count()) === 1,
    `bundle images ${tag}: overlay has "Set Thumbnail" for the bundle`,
  )
  check(
    !page.blocked.includes('setBundleThumbnail'),
    `bundle images ${tag}: opening an image does not set the thumbnail`,
  )
  await shot(page, `bundle-overlay-${tag}`)
  await page.locator('[role="dialog"] [data-detail-bundle-thumb]').click()
  await settle(page, 400)
  check(
    page.blocked.includes('setBundleThumbnail'),
    `bundle images ${tag}: overlay action sets the thumbnail (aborted)`,
  )
  await page.keyboard.press('Escape')
  await settle(page, 800)
  check(
    param(page, 'imageDetail') === null,
    `bundle images ${tag}: Escape closes the overlay`,
  )
  // explicit hover action on the tile
  page.blocked.length = 0
  await tiles.nth(2).hover()
  await tiles.nth(2).locator('[data-bundle-set-thumb]').click()
  await settle(page, 400)
  check(
    page.blocked.includes('setBundleThumbnail'),
    `bundle images ${tag}: tile pin action sets the thumbnail (aborted)`,
  )
  // view in gallery → bundle chip
  const link = page.locator('[data-bundle-view-gallery]')
  check(
    /bundle=\d+/.test((await link.getAttribute('href')) ?? ''),
    `bundle images ${tag}: "View in gallery" link`,
  )
  await link.click()
  await settle(page, 1500)
  const chip = page.locator('[data-filter-chip="bundle"]')
  check(
    param(page, 'bundle') !== null &&
      (await chip.count()) === 1 &&
      /bundle_\d+/.test(await chip.innerText()),
    `bundle images ${tag}: gallery shows the bundle chip (${(await chip.count()) ? await chip.innerText() : '-'})`,
  )
  // Bundle filter from the + Filter menu
  await chip.locator('button').click()
  await settle(page, 800)
  await page.locator('[data-add-filter]').click()
  await page.locator('[data-filter-menu="bundle"]').click()
  await page.locator('[data-filter-option="bundle-2"]').click()
  await settle(page, 1000)
  check(
    param(page, 'bundle') === '2',
    `bundle images ${tag}: Bundle filter in the menu (bundle=${param(page, 'bundle')})`,
  )
  await ctx.close()
}

for (const [w, h, tag] of [
  [1440, 900, 'desktop'],
  [390, 844, 'mobile'],
]) {
  await dashboard(w, h, tag)
  await gallery(w, h, tag)
  await masterDetail(w, h, tag, {
    to: '/bundles',
    name: 'Bundles',
    count: 10,
    newAttr: '[data-new-bundle]',
    storageKey: '87studio-master-detail:bundles',
  })
  await masterDetail(w, h, tag, {
    to: '/tags',
    name: 'Tags',
    count: 10,
    newAttr: '[data-new-bookmark]',
    storageKey: '87studio-master-detail:tags',
  })
  await queue(w, h, tag)
  await settingsPage(w, h, tag)
  await metadataPage(w, h, tag)
  await galleryTools(w, h, tag)
  await bundleImagesTest(w, h, tag)
  await promptTagTest(w, h, tag)
  await onboardingKeyTest(w, h, tag)
}

// ───────── Tag bookmark: images using the tag; gallery prompt-tag filter ─────────
async function promptTagTest(w, h, tag) {
  console.log(`== prompt tag ${w}x${h}`)
  const { ctx, page } = await newPage(w, h)
  await navTo(page, '/tags')
  await page.locator('[data-list-row]').first().click()
  await settle(page, 1200)
  const section = page.locator('[data-prompt-tag-images]')
  check(
    (await section.count()) === 1,
    `prompt tag ${tag}: "Images with this tag" section`,
  )
  check(
    /37/.test(await page.locator('[data-prompt-tag-count]').innerText()),
    `prompt tag ${tag}: shows the total count`,
  )
  const tiles = page.locator('[data-prompt-tag-image]')
  check(
    (await tiles.count()) === 24,
    `prompt tag ${tag}: 24 thumbnails (${await tiles.count()})`,
  )
  const href =
    (await page.locator('[data-view-in-gallery]').getAttribute('href')) ?? ''
  check(
    /promptTag=mock_tag_1/.test(href),
    `prompt tag ${tag}: "View in gallery" link (${href})`,
  )
  await section.scrollIntoViewIfNeeded()
  await shot(page, `prompt-tag-section-${tag}`)
  const second = await tiles.nth(1).getAttribute('data-prompt-tag-image')
  await tiles.nth(1).click()
  await settle(page, 1500)
  check(
    param(page, 'imageDetail') === second &&
      param(page, 'detailTag') === 'mock_tag_1',
    `prompt tag ${tag}: thumbnail opens the overlay with detailTag (${param(page, 'detailTag')})`,
  )
  await page.keyboard.press('Escape')
  await settle(page, 800)

  // Gallery: link carries the filter, chip shows, Filter menu dialog sets it
  await page.locator('[data-view-in-gallery]').click()
  await settle(page, 1500)
  const chip = page.locator('[data-filter-chip="prompttag"]')
  check(
    param(page, 'promptTag') === 'mock_tag_1' && (await chip.count()) === 1,
    `prompt tag ${tag}: gallery shows the prompt-tag chip (${(await chip.count()) ? await chip.innerText() : '-'})`,
  )
  await chip.locator('button').click()
  await settle(page, 800)
  check(
    param(page, 'promptTag') === null,
    `prompt tag ${tag}: removing the chip clears the param`,
  )
  await page.locator('[data-add-filter]').click()
  await page.locator('[data-filter-option="prompttag"]').click()
  await page.locator('[data-prompt-tag-input]').fill('blue hair')
  await page.keyboard.press('Enter')
  await settle(page, 1000)
  check(
    param(page, 'promptTag') === 'blue_hair',
    `prompt tag ${tag}: Filter menu sets promptTag (${param(page, 'promptTag')})`,
  )
  await shot(page, `prompt-tag-gallery-${tag}`)
  await ctx.close()
}

// ───────── Onboarding step 1: saving the API key advances ─────────
async function onboardingKeyTest(w, h, tag) {
  console.log(`== onboarding api key ${w}x${h}`)
  const settingWrites = []
  const { ctx, page } = await newPage(w, h, {
    onboardingStep1: true,
    settingWrites,
  })
  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' })
  await settle(page, 1500)
  await page.locator('[data-onboarding="api-key-input"]').fill('sk-test-key')
  await page.getByRole('button', { name: 'Save', exact: true }).first().click()
  await settle(page, 1500)
  const stepWrites = settingWrites
    .filter((a) => a.key === 'onboarding_step')
    .map((a) => a.value)
  check(
    settingWrites.some((a) => a.key === 'nai_api_key'),
    `onboarding ${tag}: Save writes the API key`,
  )
  check(
    stepWrites.includes('2'),
    `onboarding ${tag}: Save advances step 1 -> 2 (step writes: ${stepWrites.join(',')})`,
  )
  await ctx.close()
}

console.log(`\nconsole errors: ${consoleErrors}\nfailures: ${failures}`)
await browser.close()
process.exit(failures || consoleErrors ? 1 : 0)
