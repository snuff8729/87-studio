/**
 * Stable Diffusion (A1111) prompt syntax → NovelAI syntax.
 *
 *   (abc:1.2)          → 1.2::abc::
 *   (abc) / ((abc))    → 1.1::abc:: / 1.21::abc::
 *   [abc]              → 0.91::abc::   (only when the text is detected as SD)
 *   \( \)              → ( )           (literal parentheses)
 *   <lora:…> BREAK     → removed
 *
 * Nested weights multiply and are flattened into segments, e.g.
 * `(a, (b:1.5):1.2)` → `1.2::a::, 1.8::b::`.
 */

const EMPHASIS = 1.1
const EXTRA_TOKEN_RE = /\s*<(?:lora|lyco|hypernet):[^>]*>/g
const BREAK_RE = /\s*\bBREAK\b\s*/g
const WEIGHT_TAIL_RE = /^([\s\S]*):\s*(-?(?:\d+\.?\d*|\.\d+))\s*$/

/** True when the text looks like SD (A1111) syntax and not already NAI weights. */
export function looksLikeSd(text: string): boolean {
  if (text.includes('::')) return false
  return (
    /(^|[^\\])\(/.test(text) ||
    text.includes('\\(') ||
    /<(?:lora|lyco|hypernet):/.test(text) ||
    /\bBREAK\b/.test(text)
  )
}

interface Seg {
  t: string
  w: number
}

class Unbalanced extends Error {}

function findClose(
  s: string,
  open: number,
  end: number,
  o: string,
  c: string,
): number {
  let depth = 0
  for (let i = open; i < end; i++) {
    const ch = s[i]
    if (ch === '\\') {
      i++
    } else if (ch === '@' && s[i + 1] === '{') {
      const close = s.indexOf('}', i)
      if (close === -1 || close >= end) return -1
      i = close
    } else if (ch === o) depth++
    else if (ch === c) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function push(out: Array<Seg>, t: string, w: number) {
  if (!t) return
  const last = out.at(-1)
  if (last && last.w === w) last.t += t
  else out.push({ t, w })
}

function walk(s: string, w: number, out: Array<Seg>) {
  const end = s.length
  let i = 0
  while (i < end) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < end) {
      const n = s[i + 1]
      if ('()[]'.includes(n)) push(out, n, w)
      else push(out, ch + n, w)
      i += 2
    } else if (ch === '@' && s[i + 1] === '{') {
      const close = s.indexOf('}', i)
      const e = close === -1 ? end - 1 : close
      push(out, s.slice(i, e + 1), w)
      i = e + 1
    } else if (ch === '(') {
      const close = findClose(s, i, end, '(', ')')
      if (close === -1) throw new Unbalanced()
      const inner = s.slice(i + 1, close)
      const m = WEIGHT_TAIL_RE.exec(inner)
      if (m && Number.isFinite(Number(m[2]))) {
        walk(m[1].trim(), w * Number(m[2]), out)
      } else {
        walk(inner.trim(), w * EMPHASIS, out)
      }
      i = close + 1
    } else if (ch === ')') {
      throw new Unbalanced()
    } else if (ch === '[') {
      const close = findClose(s, i, end, '[', ']')
      const inner = close === -1 ? '' : s.slice(i + 1, close)
      // `[a|b]` / `[a:b]` are A1111 prompt editing, not plain de-emphasis
      if (close === -1 || /[|:]/.test(inner)) {
        push(out, ch, w)
        i++
      } else {
        walk(inner, w / EMPHASIS, out)
        i = close + 1
      }
    } else {
      push(out, ch, w)
      i++
    }
  }
}

function fmt(w: number): string {
  return String(Math.round(w * 100) / 100)
}

function emit(segs: Array<Seg>): string {
  let res = ''
  for (const { t, w } of segs) {
    const weight = Math.round(w * 100) / 100
    if (weight === 1) {
      res += t
      continue
    }
    const m = /^([\s,]*)([\s\S]*?)([\s,]*)$/.exec(t)!
    if (!m[2]) res += t
    else res += `${m[1]}${fmt(w)}::${m[2]}::${m[3]}`
  }
  return res
}

export function convertSdPrompt(text: string): {
  text: string
  changed: boolean
} {
  if (!looksLikeSd(text)) return { text, changed: false }
  const hadExtra = /<(?:lora|lyco|hypernet):/.test(text) || /\bBREAK\b/.test(text)
  const src = text.replace(EXTRA_TOKEN_RE, '').replace(BREAK_RE, ', ')

  let out: string
  try {
    const segs: Array<Seg> = []
    walk(src, 1, segs)
    out = emit(segs)
  } catch (e) {
    if (e instanceof Unbalanced) return { text, changed: false }
    throw e
  }
  if (hadExtra) {
    out = out
      .replace(/,(\s*,)+/g, ',')
      .replace(/^\s*,\s*/, '')
      .replace(/\s*,\s*$/, '')
      .replace(/,(?=\S)/g, ', ')
  }
  return { text: out, changed: out !== text }
}
