import { hoverTooltip } from '@codemirror/view'
import { getBundleNames, lookupBundleRef } from './bundle-completion'
import { effectiveMode, optionName, parseWildcardOptions } from '@/lib/wildcard'

const BUNDLE_RE = /@\{bundle:([^}]+)\}/g
const MAX_LINES = 3
const MAX_OPTIONS = 8

export const bundleTooltip = hoverTooltip((view, pos) => {
  const doc = view.state.doc.toString()

  BUNDLE_RE.lastIndex = 0
  let match
  while ((match = BUNDLE_RE.exec(doc)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (pos >= from && pos <= to) {
      const raw = match[1]
      const ref = lookupBundleRef(raw)
      if (!ref && getBundleNames().length > 0) {
        return invalidTooltip(from, to, raw)
      }
      if (!ref || !ref.bundle.content) return null
      const { bundle } = ref

      return {
        pos: from,
        end: to,
        above: true,
        create() {
          const dom = document.createElement('div')
          dom.className = 'cm-tooltip-bundle-preview'

          const header = document.createElement('div')
          header.className = 'cm-tooltip-bundle-name'
          header.textContent = bundle.name
          dom.appendChild(header)

          const sep = document.createElement('div')
          sep.className = 'cm-tooltip-bundle-sep'
          dom.appendChild(sep)

          const content = document.createElement('div')
          content.className = 'cm-tooltip-bundle-content'

          if (bundle.kind === 'wildcard') {
            const options = parseWildcardOptions(bundle.content)
            const mode = effectiveMode(ref)
            const meta = document.createElement('div')
            meta.className = 'cm-tooltip-bundle-meta'
            if (ref.fixed) {
              meta.textContent = `wildcard · fixed: ${optionName(ref.fixed.option)}`
            } else {
              const overridden = ref.override ? 'overridden' : 'default'
              meta.textContent = `wildcard · ${mode} (${overridden}) · ${options.length} options`
            }
            dom.appendChild(meta)
            const shown = options.slice(0, MAX_OPTIONS)
            content.textContent =
              shown.map((o) => `• ${optionName(o)}`).join('\n') +
              (options.length > MAX_OPTIONS
                ? `\n… +${options.length - MAX_OPTIONS}`
                : '')
            dom.appendChild(content)
            return { dom }
          }

          // Truncate to MAX_LINES worth of comma-separated segments
          const text = bundle.content.trim()
          const segments = text.split(/,\s*/)
          let preview = ''
          let lines = 1
          for (const seg of segments) {
            const candidate = preview ? preview + ', ' + seg : seg
            // Rough estimate: ~50 chars per line at 320px max-width monospace 11px
            lines = Math.ceil(candidate.length / 50)
            if (lines > MAX_LINES) {
              preview += ', …'
              break
            }
            preview = candidate
          }
          content.textContent = preview || text.slice(0, 150)
          dom.appendChild(content)

          return { dom }
        },
      }
    }
  }
  return null
})

function invalidTooltip(from: number, to: number, raw: string) {
  return {
    pos: from,
    end: to,
    above: true,
    create() {
      const dom = document.createElement('div')
      dom.className = 'cm-tooltip-invalid-ref'
      dom.textContent = raw.includes(':')
        ? `Unknown bundle, mode or option: ${raw}`
        : `Unknown bundle: ${raw}`
      return { dom }
    },
  }
}
