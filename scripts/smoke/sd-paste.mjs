// SD -> NAI paste conversion smoke against a NAI_MOCK server (no DB writes).
//   1. paste SD text into the Quick Generate prompt editor -> converted + toast
//   2. toast "Undo" restores the raw paste
//   3. paste again, Ctrl+Z restores the raw paste (history is split in two steps)
//   4. NAI-only text is pasted untouched, no toast
//   5. Settings toggle off (localStorage 87studio-sd-paste-convert=0) -> raw paste
//
// Usage (repo root, throwaway data):
//   runtime/node/node.exe scripts/demo/seed.mjs --out demo-paste
//   NAI_MOCK=1 STUDIO_DATA_DIR=<repo>/demo-paste/data \
//     runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3150 --strictPort
//   PW_CORE=<playwright-core> runtime/node/node.exe scripts/smoke/sd-paste.mjs http://127.0.0.1:3150
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
const BASE = (
  process.argv[2] ??
  process.env.SMOKE_BASE ??
  'http://localhost:3001'
).replace(/\/$/, '')
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

const RAW =
  'masterpiece, (red hair, blue eyes:1.3), ((smile)), ganyu \\(genshin impact\\), <lora:x:0.8>'
const CONVERTED =
  'masterpiece, 1.3::red hair, blue eyes::, 1.21::smile::, ganyu (genshin impact)'

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ??
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('87studio-locale', 'en')
  } catch {}
})
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() !== 'error' || /Failed to load resource/.test(m.text())) return
  consoleErrors++
  console.log(`  [console.error] ${m.text().slice(0, 300)}`)
})
page.on('pageerror', (e) => {
  consoleErrors++
  console.log(`  [pageerror] ${e.message.slice(0, 300)}`)
})

const cm = () => page.locator('.cm-content').first()
const docText = async () => (await cm().innerText()).replace(/\n+$/, '')
const paste = (text) =>
  cm().evaluate((el, t) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', t)
    el.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, text)
const clearDoc = async () => {
  await cm().click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
}
const toastLoc = () =>
  page.locator('[data-sonner-toast]').filter({
    hasText: 'Converted SD syntax to NAI',
  })

try {
  await page.goto(BASE + '/generate', { waitUntil: 'networkidle' })
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
    await sleep(500)
  }
  await page.getByRole('tab', { name: /^Prompt/ }).click()
  await cm().waitFor({ timeout: 15000 })
  await clearDoc()

  // 1
  await paste(RAW)
  await sleep(300)
  check((await docText()) === CONVERTED, `converted on paste: ${await docText()}`)
  check(
    await toastLoc()
      .waitFor({ timeout: 3000 })
      .then(() => true)
      .catch(() => false),
    'toast shown',
  )
  await page.screenshot({ path: process.env.SMOKE_SHOT ?? path.join(OUT, 'sd-paste.png') })

  // 2
  await toastLoc().getByRole('button', { name: 'Undo' }).click()
  await sleep(300)
  check((await docText()) === RAW, 'toast Undo restores the raw paste')

  // 3
  await clearDoc()
  await paste(RAW)
  await sleep(300)
  check((await docText()) === CONVERTED, 'converted again')
  await cm().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Control+Z')
  await sleep(300)
  check((await docText()) === RAW, 'Ctrl+Z restores the raw paste')

  // 4
  await clearDoc()
  await paste('1.2::a::, {b}, [c]')
  await sleep(300)
  check((await docText()) === '1.2::a::, {b}, [c]', 'NAI text untouched')

  // 5
  await page.evaluate(() => localStorage.setItem('87studio-sd-paste-convert', '0'))
  await clearDoc()
  await paste(RAW)
  await sleep(300)
  check((await docText()) === RAW, 'toggle off: raw paste kept')
  await page.evaluate(() => localStorage.removeItem('87studio-sd-paste-convert'))
} catch (e) {
  check(false, `exception: ${e.message.slice(0, 900)}`)
}

check(consoleErrors === 0, `no console/page errors (${consoleErrors})`)
await browser.close()
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
