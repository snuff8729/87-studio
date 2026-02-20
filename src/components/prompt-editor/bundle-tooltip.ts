import { hoverTooltip } from '@codemirror/view'
import { getBundleNames } from './bundle-completion'

const BUNDLE_RE = /@\{([^}]+)\}/g
const MAX_LINES = 3

export const bundleTooltip = hoverTooltip((view, pos) => {
  const doc = view.state.doc.toString()

  BUNDLE_RE.lastIndex = 0
  let match
  while ((match = BUNDLE_RE.exec(doc)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (pos >= from && pos <= to) {
      const name = match[1]
      const bundle = getBundleNames().find((b) => b.name === name)
      if (!bundle || !bundle.content) return null

      return {
        pos: from,
        end: to,
        above: true,
        create() {
          const dom = document.createElement('div')
          dom.className = 'cm-tooltip-bundle-preview'

          const header = document.createElement('div')
          header.className = 'cm-tooltip-bundle-name'
          header.textContent = name
          dom.appendChild(header)

          const sep = document.createElement('div')
          sep.className = 'cm-tooltip-bundle-sep'
          dom.appendChild(sep)

          const content = document.createElement('div')
          content.className = 'cm-tooltip-bundle-content'
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
