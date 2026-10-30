// Demo data seeder. Recreates ./demo/ (git-ignored) with data/studio.db and
// generated placeholder PNGs. Never touches ./data/. No NAI API key is stored.
//
// Usage: runtime/node/node.exe scripts/demo/seed.mjs [--out <dir>]
//   --out  target dir (default ./demo; must be named demo* and live inside the repo).
//          The DB/files go to <dir>/data, i.e. run a server with
//          STUDIO_DATA_DIR=<dir>/data (or cwd=<dir>) to use them.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outArg = process.argv.indexOf('--out')
const DEMO =
  outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, 'demo')
if (
  !DEMO.startsWith(ROOT + path.sep) ||
  !path.basename(DEMO).startsWith('demo')
) {
  console.error('--out must be a demo* directory inside the repo: ' + DEMO)
  process.exit(1)
}
const DATA = path.join(DEMO, 'data')

// ── deterministic RNG ──
function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(8787)
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const chance = (p) => rnd() < p
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── time helpers (fixed anchor so output is deterministic) ──
const ANCHOR = Date.UTC(2026, 9, 28, 12, 0, 0)
const fmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const daysAgo = (d, jitterH = 0) =>
  ANCHOR - d * 86400000 + Math.floor(rnd() * jitterH * 3600000)

// ── reset dirs ──
fs.rmSync(DEMO, { recursive: true, force: true })
for (const d of ['images', 'thumbnails', 'references', 'downloads', 'logs', 'tag-images'])
  fs.mkdirSync(path.join(DATA, d), { recursive: true })

// ── DB + migrations ──
const db = new Database(path.join(DATA, 'studio.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
const migDir = path.join(ROOT, 'src/server/db/migrations')
for (const f of fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(migDir, f), 'utf8')
  for (const stmt of sql.split('--> statement-breakpoint')) {
    if (stmt.trim()) db.exec(stmt)
  }
}

const ins = (table, row) => {
  const keys = Object.keys(row)
  const r = db
    .prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...keys.map((k) => row[k]))
  return Number(r.lastInsertRowid)
}

// ── content pools ──
const EXPR = [
  ['웃음', 'smiling, happy, open mouth'], ['슬픔', 'sad, tears, downcast eyes'],
  ['화남', 'angry, furrowed brow, clenched teeth'], ['놀람', 'surprised, wide eyes, open mouth'],
  ['부끄러움', 'embarrassed, blush, looking away'], ['윙크', 'one eye closed, wink, smile'],
  ['졸림', 'sleepy, half-closed eyes, yawning'], ['자신감', 'confident, smirk, closed mouth'],
  ['울음', 'crying, streaming tears, sobbing'], ['당황', 'nervous, sweatdrop, awkward smile'],
  ['장난기', 'playful, tongue out, grin'], ['무표정', 'expressionless, blank stare'],
  ['걱정', 'worried, furrowed brow, hand on chest'], ['설렘', 'excited, sparkling eyes, blush'],
  ['질투', 'jealous, pout, puffed cheeks'], ['피곤', 'tired, dark circles, slumped'],
  ['감동', 'touched, teary eyes, soft smile'], ['지루함', 'bored, half-lidded, chin rest'],
  ['도발', 'teasing, half-smile, raised eyebrow'], ['수줍은 미소', 'shy smile, blush, looking down'],
  ['결의', 'determined, serious eyes, clenched fist'], ['공포', 'scared, trembling, wide eyes'],
  ['행복한 눈물', 'happy tears, laughing, closed eyes'], ['멍함', 'dazed, empty eyes, spacing out'],
].map(([name, expression]) => ({ name, ph: { expression, background: pick(['simple background', 'warm gradient', 'soft bokeh', 'pastel background']) } }))
const POSE = [
  ['서 있기', 'standing, arms at sides'], ['앉기', 'sitting, hands on lap'], ['손 흔들기', 'waving, raised hand'],
  ['브이', 'peace sign, v'], ['팔짱', 'crossed arms'], ['턱 괴기', 'chin rest, elbow on table'],
  ['달리기', 'running, dynamic pose'], ['점프', 'jumping, midair'], ['뒤돌아보기', 'looking back, from behind'],
  ['기지개', 'stretching, arms up'], ['무릎 꿇기', 'kneeling'], ['누워 있기', 'lying on back'],
  ['하트', 'heart hands'], ['경례', 'salute'], ['손 뻗기', 'reaching out, outstretched hand'],
  ['머리 만지기', 'hand in hair'], ['기대기', 'leaning on wall'], ['쪼그려 앉기', 'squatting'],
  ['춤추기', 'dancing, spinning'], ['포옹 자세', 'hugging own knees'], ['가리키기', 'pointing at viewer'],
  ['전투 자세', 'fighting stance, clenched fists'], ['앞으로 숙이기', 'leaning forward, hands on knees'], ['등 돌리기', 'back to viewer, shoulder glance'],
].map(([name, pose]) => ({ name, ph: { pose, background: pick(['white background', 'studio backdrop', 'classroom', 'city street']) } }))
const OUTFIT = [
  ['교복', 'school uniform, pleated skirt, ribbon'], ['메이드복', 'maid outfit, frilled apron, headdress'],
  ['수영복', 'swimsuit, bikini, sarong'], ['잠옷', 'pajamas, oversized shirt, sleepy'],
  ['기모노', 'kimono, obi, hair ornament'], ['후드티', 'hoodie, shorts, casual'],
  ['정장', 'business suit, tie, glasses'], ['원피스', 'sundress, straw hat'],
  ['겨울 코트', 'winter coat, scarf, gloves'], ['체육복', 'gym uniform, ponytail'],
  ['드레스', 'evening dress, jewelry'], ['마법사 로브', 'wizard robe, pointed hat, staff'],
  ['갑옷', 'knight armor, cape, sword'], ['사이버펑크', 'techwear, neon lights, visor'],
  ['앞치마', 'apron, chef hat, holding ladle'], ['한복', 'hanbok, hair ribbon'],
  ['스웨터', 'turtleneck sweater, long skirt'], ['트렌치코트', 'trench coat, beret'],
  ['간호복', 'nurse outfit, nurse cap'], ['캠핑룩', 'outdoor jacket, backpack, hiking boots'],
].map(([name, outfit]) => ({ name, ph: { outfit, background: pick(['indoors', 'outdoors', 'night sky', 'sunset']) } }))

const BG = ['cafe interior', 'rooftop', 'beach', 'library', 'forest', 'neon city', 'snowy street', 'flower field']
const MOODS = ['spring', 'summer', 'autumn', 'winter', 'festival', 'night', 'rainy', 'sunrise']

// ── bundles ──
const BUNDLES = [
  ['quality-boost', 'masterpiece, best quality, very aesthetic, absurdres', '품질 향상 기본 세트', ['quality', 'common']],
  ['soft-lighting', 'soft lighting, rim light, depth of field, bloom', '부드러운 조명', ['lighting']],
  ['anime-style', 'anime coloring, clean lineart, flat colors', '애니메 스타일', ['style']],
  ['watercolor', 'watercolor (medium), traditional media, soft edges', '수채화 스타일', ['style']],
  ['violet-hair', 'long hair, violet hair, hair between eyes, purple eyes', '바이올렛 캐릭터 외형', ['character']],
  ['silver-twintails', 'silver hair, twintails, blue eyes, ahoge', '은발 트윈테일', ['character']],
  ['neon-city', 'cyberpunk, neon lights, rain, reflection, night', '네온 도시 배경', ['background']],
  ['cozy-cafe', 'cafe, warm lighting, wooden furniture, coffee cup', '아늑한 카페', ['background']],
  ['negative-basic', 'lowres, bad anatomy, bad hands, text, error, worst quality, jpeg artifacts', '기본 네거티브', ['negative', 'common']],
  ['cat-ears', 'cat ears, cat tail, fang, :3', '고양이 귀 세트', ['character']],
  ['fantasy-adventurer', 'fantasy, adventurer, leather armor, cape, belt pouch', '판타지 모험가', ['character', 'background']],
  ['summer-sky', 'blue sky, cumulonimbus cloud, sunlight, lens flare', '여름 하늘', ['background', 'lighting']],
]
const bundleIds = {}
const bundleTagIds = {}
BUNDLES.forEach(([name, content, desc, tagNames], i) => {
  const ts = fmt(daysAgo(40 - i, 6))
  const id = ins('prompt_bundles', { name, description: desc, content, created_at: ts, updated_at: ts })
  bundleIds[name] = id
  for (const t of tagNames) {
    if (!bundleTagIds[t]) bundleTagIds[t] = ins('bundle_tags', { name: t })
    ins('bundle_tag_assignments', { bundle_id: id, tag_id: bundleTagIds[t] })
  }
})

// ── global scene packs ──
const globalPacks = []
for (const [name, desc, list] of [
  ['기본 감정', '기본적인 표정 프리셋 모음', EXPR],
  ['포즈', '자주 쓰는 포즈/제스처', POSE],
  ['의상', '의상 프리셋', OUTFIT],
]) {
  const ts = fmt(daysAgo(45, 4))
  const id = ins('scene_packs', { name, description: desc, created_at: ts, updated_at: ts })
  const scenes = list.map((s, i) => ({
    ...s,
    id: ins('scenes', {
      scene_pack_id: id, name: s.name, description: null,
      placeholders: JSON.stringify(s.ph), sort_order: i, created_at: ts, updated_at: ts,
    }),
  }))
  globalPacks.push({ id, name, scenes })
}
const [PK_EMO, PK_POSE, PK_OUT] = globalPacks

// ── projects ──
const NEG = '@{bundle:negative-basic}, nsfw'
const STD = { model: 'nai-diffusion-4-5-full', steps: 28, scale: 5, cfgRescale: 0.4, sampler: 'k_euler_ancestral', scheduler: 'karras', ucPreset: 0 }
const P = (w, h, extra = {}) => ({ ...STD, width: w, height: h, ...extra })
const PROJECTS = [
  {
    name: 'Violet — 마법사 소녀', desc: '보라색 머리 마법사 캐릭터 세트', size: [832, 1216], budget: 120,
    general: '@{bundle:quality-boost}, 1girl, solo, @{bundle:violet-hair}, @{slot:expression}, @{slot:pose}, @{slot:background}, @{bundle:soft-lighting}',
    chars: [['Violet', 'violet, wizard robe, witch hat, @{slot:expression}', 'extra fingers']],
    packs: [[PK_EMO, 24], [PK_POSE, 24]], params: P(832, 1216),
  },
  {
    name: 'Sunny Cafe Staff', desc: 'Cafe uniform duo for menu art', size: [1216, 832], budget: 70,
    general: '@{bundle:quality-boost}, 2girls, @{bundle:cozy-cafe}, @{slot:expression}, @{slot:background}, @{bundle:anime-style}',
    chars: [['Mina', 'girl, brown hair, short hair, apron, @{slot:expression}', ''], ['Hana', 'girl, blonde hair, ponytail, waitress, @{slot:expression}', 'beard']],
    packs: [[PK_EMO, 12]], params: P(1216, 832, { scale: 5.5 }),
  },
  {
    name: '겨울 교복 시리즈', desc: '겨울 시즌 교복 일러스트', size: [832, 1216], budget: 80,
    general: '@{bundle:quality-boost}, 1girl, solo, @{slot:outfit}, winter, snow, @{slot:expression}, @{bundle:soft-lighting}',
    chars: [['유나', 'yuna, black hair, bob cut, scarf, @{slot:expression}', '']],
    packs: [[PK_OUT, 20], [PK_EMO, 8]], params: P(832, 1216),
  },
  {
    name: 'Cyber Alley Duo', desc: 'Neon alley, two characters', size: [1216, 832], budget: 50,
    general: '@{bundle:quality-boost}, 2girls, @{bundle:neon-city}, @{slot:pose}, cinematic angle',
    chars: [['Rei', 'rei, short white hair, visor, techwear, @{slot:pose}', ''], ['Kai', 'kai, black hair, red eyes, jacket, @{slot:pose}', '']],
    packs: [[PK_POSE, 12]], params: P(1216, 832, { steps: 32 }),
  },
  {
    name: '고양이 귀 메이드', desc: '메이드 카페 마스코트', size: [1024, 1024], budget: 30,
    general: '@{bundle:quality-boost}, 1girl, @{bundle:cat-ears}, maid, @{slot:expression}, @{bundle:cozy-cafe}',
    chars: [['미케', 'mike, orange hair, cat ears, maid headdress, @{slot:expression}', 'dog ears']],
    packs: [[PK_EMO, 6]], params: P(1024, 1024),
  },
  {
    name: 'Knight & Mage Party', desc: 'Three-member adventuring party', size: [1216, 832], budget: 80,
    general: '@{bundle:quality-boost}, 3girls, @{bundle:fantasy-adventurer}, @{slot:pose}, @{slot:background}',
    chars: [['Knight', 'knight, silver armor, long sword, @{slot:pose}', ''], ['Mage', 'mage, blue robe, staff, @{slot:pose}', ''], ['Rogue', 'rogue, hood, dagger, green cloak, @{slot:pose}', '']],
    packs: [[PK_POSE, 16], [PK_OUT, 10]], params: P(1216, 832, { sampler: 'k_dpmpp_2m' }),
  },
  {
    name: '여름 해변 휴가', desc: '바다 배경 여름 시리즈', size: [832, 1216], budget: 70,
    general: '@{bundle:quality-boost}, 2girls, @{bundle:summer-sky}, beach, @{slot:outfit}, @{slot:expression}, @{bundle:watercolor}',
    chars: [['소라', 'sora, long black hair, @{slot:outfit}, @{slot:expression}', ''], ['Lia', 'lia, @{bundle:silver-twintails}, @{slot:outfit}', '']],
    packs: [[PK_OUT, 12], [PK_EMO, 12]], params: P(832, 1216),
  },
  {
    name: 'Emotion Sheet Master', desc: '표정 시트 대량 생성 (120 scenes)', size: [832, 1216], budget: 100,
    general: '@{bundle:quality-boost}, 1girl, solo, @{bundle:silver-twintails}, @{slot:expression}, @{slot:pose}, @{slot:outfit}, white background',
    chars: [],
    packs: [[PK_EMO, 24], [PK_POSE, 24], [PK_OUT, 20], ['custom', '표정 확장 A', 20], ['custom', '표정 확장 B', 16], ['custom', 'Seasonal Specials', 16]],
    params: P(832, 1216),
  },
]

const bundleContent = Object.fromEntries(BUNDLES.map((b) => [b[0], [b[1], bundleIds[b[0]]]]))
function resolve(text, ph, used) {
  const withBundles = text.replace(/@\{bundle:([^}]+)\}/g, (_, n) => {
    const b = bundleContent[n]
    if (!b) return ''
    used.add(b[1])
    return b[0]
  })
  return withBundles.replace(/@\{slot:([^}]+)\}/g, (_, k) => ph[k] ?? '')
}

const projectRecords = []
PROJECTS.forEach((p, pi) => {
  const created = fmt(daysAgo(30 - pi * 2, 8))
  const id = ins('projects', {
    name: p.name, description: p.desc, general_prompt: p.general, negative_prompt: NEG,
    parameters: JSON.stringify(p.params), created_at: created, updated_at: created,
  })
  // Position demo: with 2+ characters #1 is Fixed B3, #2 Random, the rest AI
  const charPosition = (idx, n) => n < 2 ? null : idx === 0 ? JSON.stringify({ mode: 'fixed', x: 0.3, y: 0.5 }) : idx === 1 ? JSON.stringify({ mode: 'random' }) : null
  const chars = p.chars.map(([name, prompt, neg], idx) => ({
    id: ins('characters', { project_id: id, slot_index: idx, name, char_prompt: prompt, char_negative: neg, position: charPosition(idx, p.chars.length), created_at: created, updated_at: created }),
    name, prompt, neg,
  }))
  const pscenes = []
  p.packs.forEach((spec, pkIdx) => {
    let packName, srcPack, list
    if (spec[0] === 'custom') {
      packName = spec[1]
      srcPack = null
      list = Array.from({ length: spec[2] }, (_, i) => {
        const e = EXPR[(i * 5 + pkIdx) % EXPR.length]
        const mood = MOODS[i % MOODS.length]
        return { name: `${packName.split(' ')[0]} ${String(i + 1).padStart(2, '0')} ${e.name}`, ph: { expression: `${e.ph.expression}, ${mood}`, pose: pick(POSE).ph.pose, outfit: pick(OUTFIT).ph.outfit, background: pick(BG) }, src: null }
      })
    } else {
      packName = spec[0].name
      srcPack = spec[0].id
      list = spec[0].scenes.slice(0, spec[1]).map((s) => ({ name: s.name, ph: { ...s.ph }, src: s.id }))
    }
    const ppId = ins('project_scene_packs', { project_id: id, scene_pack_id: srcPack, name: packName, created_at: created })
    list.forEach((s, i) => {
      const sid = ins('project_scenes', {
        project_scene_pack_id: ppId, source_scene_id: s.src, name: s.name,
        placeholders: JSON.stringify(s.ph), sort_order: i, created_at: created, updated_at: created,
      })
      const overrides = {}
      // First scene of the first pack: character #1 overrides its default position
      const posOverride = pkIdx === 0 && i === 0 && chars.length > 1
      if (posOverride) ins('character_scene_overrides', { project_scene_id: sid, character_id: chars[0].id, placeholders: '{}', position: JSON.stringify({ mode: 'fixed', x: 0.7, y: 0.5 }) })
      if (chars.length && chance(0.3)) {
        for (const c of chars) {
          if (posOverride && c === chars[0]) continue
          if (chance(0.7)) {
            const ov = { expression: pick(EXPR).ph.expression }
            ins('character_scene_overrides', { project_scene_id: sid, character_id: c.id, placeholders: JSON.stringify(ov) })
            overrides[c.id] = ov
          }
        }
      }
      pscenes.push({ id: sid, name: s.name, ph: s.ph, src: s.src, packId: ppId, overrides, images: [] })
    })
  })
  projectRecords.push({ id, p, chars, pscenes })
})

// ── images ──
const HUES = [340, 12, 28, 48, 150, 178, 200, 222, 262, 292]
function svgFor(w, h, label, sub, seedN) {
  const r = mulberry32(seedN)
  const h1 = HUES[Math.floor(r() * HUES.length)]
  const h2 = (h1 + 30 + Math.floor(r() * 80)) % 360
  const ang = Math.floor(r() * 360)
  let shapes = ''
  const n = 4 + Math.floor(r() * 5)
  for (let i = 0; i < n; i++) {
    const hue = (h1 + Math.floor(r() * 120)) % 360
    const op = (0.12 + r() * 0.3).toFixed(2)
    const x = Math.floor(r() * w), y = Math.floor(r() * h)
    const s = 30 + Math.floor(r() * 140)
    const fill = `hsla(${hue},70%,${55 + Math.floor(r() * 25)}%,${op})`
    const k = Math.floor(r() * 3)
    if (k === 0) shapes += `<circle cx="${x}" cy="${y}" r="${s}" fill="${fill}"/>`
    else if (k === 1) shapes += `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s * 1.4}" rx="${s / 5}" fill="${fill}" transform="rotate(${Math.floor(r() * 90)} ${x} ${y})"/>`
    else shapes += `<polygon points="${x},${y - s} ${x + s},${y + s} ${x - s},${y + s}" fill="${fill}"/>`
  }
  const cx = w / 2, headY = h * 0.38
  const fig = `<ellipse cx="${cx}" cy="${h * 0.78}" rx="${w * 0.26}" ry="${h * 0.22}" fill="hsla(${h2},40%,20%,0.35)"/><circle cx="${cx}" cy="${headY}" r="${w * 0.15}" fill="hsla(${h1},60%,85%,0.55)"/>`
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" gradientTransform="rotate(${ang} .5 .5)"><stop offset="0" stop-color="hsl(${h1},65%,42%)"/><stop offset="1" stop-color="hsl(${h2},70%,22%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${shapes}${fig}<rect x="0" y="${h - 64}" width="${w}" height="64" fill="rgba(0,0,0,0.45)"/><text x="${w / 2}" y="${h - 36}" font-family="Malgun Gothic, Segoe UI, Arial, sans-serif" font-size="22" font-weight="600" fill="#fff" text-anchor="middle">${esc(label)}</text><text x="${w / 2}" y="${h - 14}" font-family="Malgun Gothic, Segoe UI, Arial, sans-serif" font-size="14" fill="rgba(255,255,255,.75)" text-anchor="middle">${esc(sub)}</text></svg>`
}

let batchOrder = 0
const imageTasks = []
const allImages = []
const sceneBatchPlans = []

projectRecords.forEach((rec, ri0) => {
  const { p, pscenes } = rec
  const active = shuffle(pscenes).slice(0, Math.max(3, Math.round(pscenes.length * 0.75)))
  const counts = new Map(active.map((s) => [s, 0]))
  for (let i = 0; i < p.budget; i++) {
    const s = active[Math.floor(Math.pow(rnd(), 1.3) * active.length)]
    counts.set(s, counts.get(s) + 1)
  }
  const planned = active.filter((s) => counts.get(s) > 0)
  for (let i = 0; i < planned.length; i += 4) {
    const chunk = planned.slice(i, i + 4)
    const day = Math.max(1, 26 - Math.floor((i / planned.length) * 24) - (ri0 % 3))
    sceneBatchPlans.push({ rec, chunk, counts, day })
  }
})
sceneBatchPlans.sort((a, b) => b.day - a.day)

for (const plan of sceneBatchPlans) {
  const { rec, chunk, counts, day } = plan
  const { p, id: projectId, chars } = rec
  const [W, H] = p.size
  const imgW = W === H ? 512 : W > H ? 608 : 416
  const imgH = W === H ? 512 : W > H ? 416 : 608
  const batchTs = daysAgo(day, 10)
  const label = `${p.name} — ${chunk.map((s) => s.name).join(', ')}`
  const batchId = ins('generation_batches', { project_id: projectId, label, queue_order: ++batchOrder, status: 'completed', created_at: fmt(batchTs) })
  let order = 0
  for (const s of chunk) {
    const n = counts.get(s)
    const used = new Set()
    const gp = resolve(p.general, s.ph, used)
    const np = resolve(NEG, s.ph, used)
    const cps = chars.map((c) => {
      const ph = { ...s.ph, ...(s.overrides[c.id] ?? {}) }
      return { characterId: c.id, name: c.name, prompt: resolve(c.prompt, ph, used), negative: resolve(c.neg, ph, used) }
    })
    const prompts = { generalPrompt: gp, negativePrompt: np, characterPrompts: cps, usedBundleIds: [...used] }
    const jobTs = batchTs + order * 90000
    const jobId = ins('generation_jobs', {
      project_id: projectId, project_scene_id: s.id, source_scene_id: s.src, batch_id: batchId,
      queue_order: order++, resolved_prompts: JSON.stringify(prompts), resolved_parameters: JSON.stringify(p.params),
      total_count: n, completed_count: n, status: 'completed', created_at: fmt(jobTs), updated_at: fmt(jobTs + n * 7000),
    })
    for (let k = 0; k < n; k++) {
      const seed = ri(100000000, 4294967295)
      const ts = jobTs + (k + 1) * 7000
      const filename = `${jobId}_${seed}_${ts}.png`
      const fileRel = `data/images/${projectId}/${filename}`
      const thumbRel = `data/thumbnails/${projectId}/${filename}`
      const meta = { prompts, parameters: { ...p.params, seed } }
      const imgId = ins('generated_images', {
        job_id: jobId, project_id: projectId, project_scene_id: s.id, source_scene_id: s.src,
        file_path: fileRel, thumbnail_path: thumbRel, seed, metadata: JSON.stringify(meta), created_at: fmt(ts),
      })
      const r2 = { id: imgId, projectId, sceneId: s.id, fileRel, thumbRel }
      s.images.push(r2)
      allImages.push(r2)
      imageTasks.push({ ...r2, w: imgW, h: imgH, label: s.name, sub: `${p.name.slice(0, 22)} · seed ${seed}`, seed })
    }
  }
}

// ── failed / cancelled batches (terminal states only) ──
function terminalBatch(rec, scene, status, err, completed, day) {
  const ts = fmt(daysAgo(day, 3))
  const bid = ins('generation_batches', { project_id: rec.id, label: `${rec.p.name} — ${scene.name}`, queue_order: ++batchOrder, status, created_at: ts })
  const used = new Set()
  const prompts = { generalPrompt: resolve(rec.p.general, scene.ph, used), negativePrompt: resolve(NEG, scene.ph, used), characterPrompts: [], usedBundleIds: [...used] }
  ins('generation_jobs', {
    project_id: rec.id, project_scene_id: scene.id, source_scene_id: scene.src, batch_id: bid, queue_order: 0,
    resolved_prompts: JSON.stringify(prompts), resolved_parameters: JSON.stringify(rec.p.params),
    total_count: 4, completed_count: completed, status, error_message: err, created_at: ts, updated_at: ts,
  })
}
terminalBatch(projectRecords[0], projectRecords[0].pscenes[0], 'failed', 'NAI API error 401: Unauthorized (invalid or missing API key)', 0, 3)
terminalBatch(projectRecords[3], projectRecords[3].pscenes[1], 'failed', 'NAI API error 429: Concurrent generation is locked — too many requests', 1, 2)
terminalBatch(projectRecords[5], projectRecords[5].pscenes[2], 'cancelled', null, 2, 1)

// ── render image files ──
for (const rec of projectRecords) {
  fs.mkdirSync(path.join(DATA, 'images', String(rec.id)), { recursive: true })
  fs.mkdirSync(path.join(DATA, 'thumbnails', String(rec.id)), { recursive: true })
}
console.log(`Rendering ${imageTasks.length} images...`)
const t0 = Date.now()
let cursor = 0
async function worker() {
  while (cursor < imageTasks.length) {
    const t = imageTasks[cursor++]
    const buf = await sharp(Buffer.from(svgFor(t.w, t.h, t.label, t.sub, t.seed))).png({ compressionLevel: 6 }).toBuffer()
    fs.writeFileSync(path.join(DEMO, t.fileRel), buf)
    await sharp(buf)
      .resize({ width: t.w >= t.h ? 300 : undefined, height: t.w < t.h ? 300 : undefined })
      .png()
      .toFile(path.join(DEMO, t.thumbRel))
  }
}
await Promise.all(Array.from({ length: 8 }, worker))
console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

// ── curation: favorites, ratings, memos, tags ──
const MEMOS = ['표정 좋음', '손 모양 어색', 'final 후보', 'background nice', '색감 마음에 듦', 'face is a bit off', '썸네일로 쓰기 좋음', 'try again with higher cfg', '라인이 깔끔함', 'great composition']
const userTags = ['final', 'wip', '표지 후보', 'sns', 'retouch', 'best-of', '배경 좋음', 'reject']
const tagIds = Object.fromEntries(userTags.map((t) => [t, ins('tags', { name: t })]))
let favCount = 0, rated = 0, tagged = 0
for (const im of allImages) {
  const fav = chance(0.14)
  const rating = chance(fav ? 0.9 : 0.3) ? (fav ? ri(3, 5) : ri(1, 5)) : null
  const memo = chance(0.12) ? pick(MEMOS) : null
  if (fav || rating || memo) db.prepare('UPDATE generated_images SET is_favorite=?, rating=?, memo=? WHERE id=?').run(fav ? 1 : 0, rating, memo, im.id)
  if (fav) favCount++
  if (rating) rated++
  if (chance(fav ? 0.6 : 0.1)) {
    for (const n of shuffle(userTags).slice(0, ri(1, 3))) ins('image_tags', { image_id: im.id, tag_id: tagIds[n] })
    tagged++
  }
  const meta = JSON.parse(db.prepare('SELECT metadata FROM generated_images WHERE id=?').get(im.id).metadata)
  for (const bid of meta.prompts.usedBundleIds) ins('image_bundles', { image_id: im.id, bundle_id: bid })
}
// tournaments for scenes with >= 4 images
for (const rec of projectRecords) {
  for (const s of rec.pscenes.filter((s) => s.images.length >= 4).slice(0, 5)) {
    const imgs = s.images
    const wins = new Map(imgs.map((i) => [i.id, [0, 0]]))
    for (let m = 0; m < Math.min(10, imgs.length * 2); m++) {
      const [a, b] = shuffle(imgs).slice(0, 2)
      const result = pick(['left', 'right', 'left', 'right', 'both_win', 'both_lose'])
      ins('tournament_matches', { project_scene_id: s.id, image1_id: a.id, image2_id: b.id, result, created_at: fmt(daysAgo(2, 20)) })
      const wa = wins.get(a.id), wb = wins.get(b.id)
      if (result === 'left') { wa[0]++; wb[1]++ }
      else if (result === 'right') { wb[0]++; wa[1]++ }
      else if (result === 'both_win') { wa[0]++; wb[0]++ }
      else { wa[1]++; wb[1]++ }
    }
    for (const [iid, [w, l]] of wins) db.prepare('UPDATE generated_images SET tournament_wins=?, tournament_losses=? WHERE id=?').run(w, l, iid)
  }
}
// thumbnails
for (const rec of projectRecords) {
  const all = rec.pscenes.flatMap((s) => s.images)
  if (all.length) db.prepare('UPDATE projects SET thumbnail_image_id=? WHERE id=?').run(pick(all).id, rec.id)
  for (const s of rec.pscenes) if (s.images.length && chance(0.5)) db.prepare('UPDATE project_scenes SET thumbnail_image_id=? WHERE id=?').run(pick(s.images).id, s.id)
}
for (const name of ['quality-boost', 'violet-hair', 'neon-city', 'cozy-cafe', 'cat-ears', 'summer-sky']) {
  db.prepare('UPDATE prompt_bundles SET thumbnail_image_id=? WHERE id=?').run(pick(allImages).id, bundleIds[name])
}

// ── tag bookmarks ──
const BM = [
  ['school_uniform', '교복 기본 태그. serafuku 와 구분해서 사용', ['outfit']], ['twintails', '트윈테일 - 길이 조절은 long/short', ['hair']],
  ['smile', '', ['expression']], ['looking_at_viewer', '시선 처리 기본', ['pose', 'expression']],
  ['cat_ears', 'animal ears 계열', ['character']], ['maid', 'headdress 와 함께', ['outfit']],
  ['cowboy_shot', '무릎 위 구도', ['composition']], ['depth_of_field', '배경 블러, 강조 용도', ['lighting', 'composition']],
  ['rim_light', '역광 윤곽', ['lighting']], ['wide_shot', '전신 + 배경 비중 큼', ['composition']],
  ['blush', 'blush stickers 와 별개', ['expression']], ['arms_up', 'stretching 대용', ['pose']],
  ['hoodie', '', ['outfit']], ['sunset', '색감 따뜻', ['background', 'lighting']], ['from_above', '하이앵글', ['composition']],
]
const bmTagIds = {}
BM.forEach(([name, memo, tgs], i) => {
  const ts = fmt(daysAgo(20 - i, 6))
  const id = ins('tag_bookmarks', { name, memo: memo || null, created_at: ts, updated_at: ts })
  for (const t of tgs) {
    if (!bmTagIds[t]) bmTagIds[t] = ins('tag_bookmark_tags', { name: t })
    ins('tag_bookmark_tag_assignments', { bookmark_id: id, tag_id: bmTagIds[t] })
  }
  if (i < 9) {
    const imgIds = []
    for (let k = 0, n = ri(1, 4); k < n; k++) {
      const g = pick(allImages)
      imgIds.push(ins('tag_bookmark_images', { bookmark_id: id, source: 'gallery', gallery_image_id: g.id, file_path: g.fileRel, thumbnail_path: g.thumbRel, sort_order: k, created_at: ts }))
    }
    db.prepare('UPDATE tag_bookmarks SET thumbnail_image_id=? WHERE id=?').run(imgIds[0], id)
  }
})

// ── settings (no nai_api_key on purpose) ──
ins('settings', { key: 'generation_delay', value: '500' })

// ── summary ──
const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c
const live = db.prepare("SELECT (SELECT COUNT(*) FROM generation_jobs WHERE status IN ('pending','running')) + (SELECT COUNT(*) FROM generation_batches WHERE status IN ('pending','running')) c").get().c
console.log(JSON.stringify({
  projects: count('projects'), characters: count('characters'), scenePacks: count('scene_packs'), scenes: count('scenes'),
  projectScenePacks: count('project_scene_packs'), projectScenes: count('project_scenes'), overrides: count('character_scene_overrides'),
  batches: count('generation_batches'), jobs: count('generation_jobs'), pendingOrRunning: live,
  images: count('generated_images'), favorites: favCount, rated, tagged, matches: count('tournament_matches'),
  bundles: count('prompt_bundles'), bookmarks: count('tag_bookmarks'), bookmarkImages: count('tag_bookmark_images'),
  apiKeyPresent: !!db.prepare("SELECT 1 FROM settings WHERE key='nai_api_key'").get(),
}, null, 1))
db.pragma('wal_checkpoint(TRUNCATE)')
db.close()
