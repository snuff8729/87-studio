/**
 * Danbooru DText -> plain text for tag descriptions (wiki bodies).
 * Pure; used by the server description helper and unit tests.
 */

/** Inline markup -> plain text (links keep their visible label). */
export function stripDTextInline(input: string): string {
  let s = input
  // [[target|label]] / [[target]] / [[target#anchor|label]]
  s = s.replace(
    /\[\[([^\]|]*)\|([^\]]*)\]\]/g,
    (_m, target: string, label: string) =>
      label.trim() ? label : target.replace(/#.*$/, ''),
  )
  s = s.replace(/\[\[([^\]]*)\]\]/g, (_m, target: string) =>
    target.replace(/^[^:]+:/, '').replace(/#.*$/, ''),
  )
  // {{search terms}}
  s = s.replace(/\{\{([^}]*)\}\}/g, '$1')
  // "label":url / "label":[url]
  s = s.replace(/"([^"]+)":\[[^\]]*\]/g, '$1')
  s = s.replace(/"([^"]+)":(?:https?:\/\/|\/)\S+/g, '$1')
  // post / thumbnail refs
  s = s.replace(/!post\s*#\d+/gi, '')
  s = s.replace(/\b(?:post|forum|topic|comment|pool|artist)\s*#\d+/gi, '')
  // [b] [i] [u] [s] [tn] [spoiler] [code] [quote] ...
  s = s.replace(
    /\[\/?(?:b|i|u|s|o|tn|spoiler|spoilers|code|nodtext|quote|expand|table|thead|tbody|tr|th|td|color|ruby|rb|rt)(?:=[^\]]*)?\]/gi,
    '',
  )
  // <br> and friends
  s = s.replace(/<\/?[a-z][^>]*>/gi, '')
  return s.replace(/[ \t]+/g, ' ').trim()
}

const HEADER_RE = /^h[1-6]\.(?:\s|(?=[A-Za-z]))/
const BLOCK_SKIP_RE =
  /^(?:\*+\s|#+\s|!post\b|\[quote|\[expand|\[table|\[code|\[nodtext)/i

/**
 * First readable paragraph(s) of a wiki body, DText stripped. Stops at the
 * first `hN.` header once something was collected; null when nothing readable
 * precedes a list/header-only body.
 */
export function wikiSummary(
  body: string | null | undefined,
  maxChars = 400,
): string | null {
  if (!body) return null
  const blocks = body.replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const out: Array<string> = []
  let total = 0
  for (const raw of blocks) {
    const block = raw.trim()
    if (!block) continue
    if (HEADER_RE.test(block)) {
      if (out.length > 0) break
      continue
    }
    if (BLOCK_SKIP_RE.test(block)) continue
    // A header glued to the block ("text\nh4. Foo") ends the paragraph
    const kept: Array<string> = []
    let hitHeader = false
    for (const line of block.split('\n')) {
      const t = line.trim()
      if (HEADER_RE.test(t)) {
        hitHeader = true
        break
      }
      if (BLOCK_SKIP_RE.test(t)) continue
      kept.push(line)
    }
    const text = stripDTextInline(kept.join(' '))
    if (text) {
      out.push(text)
      total += text.length
    }
    if (hitHeader || total >= maxChars) break
  }
  if (out.length === 0) return null
  const joined = out.join('\n\n')
  if (joined.length <= maxChars) return joined
  const cut = joined.slice(0, maxChars)
  const lastStop = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('。'),
    cut.lastIndexOf('! '),
  )
  if (lastStop > maxChars * 0.5) return cut.slice(0, lastStop + 1)
  return cut.trimEnd() + '…'
}
