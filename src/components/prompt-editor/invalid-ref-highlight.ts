import { Decoration, ViewPlugin, hoverTooltip } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

const invalidRefDeco = Decoration.mark({ class: 'cm-invalid-ref-highlight' })
const INVALID_REF_RE = /@\{(?!slot:|bundle:)[^}]+\}/g

function findInvalidRefs(doc: { toString: () => string }) {
  const decorations: Array<{ from: number; to: number }> = []
  const text = doc.toString()
  const re = new RegExp(INVALID_REF_RE.source, 'g')
  let match
  while ((match = re.exec(text)) !== null) {
    decorations.push({ from: match.index, to: match.index + match[0].length })
  }
  return decorations
}

export const invalidRefHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: { state: { doc: { toString: () => string } } }) {
      this.decorations = Decoration.set(
        findInvalidRefs(view.state.doc).map((d) =>
          invalidRefDeco.range(d.from, d.to),
        ),
      )
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = Decoration.set(
          findInvalidRefs(update.state.doc).map((d) =>
            invalidRefDeco.range(d.from, d.to),
          ),
        )
      }
    }
  },
  { decorations: (v) => v.decorations },
)

export const invalidRefTooltip = hoverTooltip((view, pos) => {
  const doc = view.state.doc.toString()

  INVALID_REF_RE.lastIndex = 0
  let match
  while ((match = INVALID_REF_RE.exec(doc)) !== null) {
    const from = match.index
    const to = from + match[0].length
    if (pos >= from && pos <= to) {
      return {
        pos: from,
        end: to,
        above: true,
        create() {
          const dom = document.createElement('div')
          dom.className = 'cm-tooltip-invalid-ref'
          dom.textContent = 'Use @{slot:name} or @{bundle:name}'
          return { dom }
        },
      }
    }
  }
  return null
})
