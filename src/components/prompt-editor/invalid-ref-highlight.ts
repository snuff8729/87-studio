import { Decoration, ViewPlugin, hoverTooltip } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

const invalidRefDeco = Decoration.mark({ class: 'cm-invalid-ref-highlight' })
const INVALID_REF_SRC = String.raw`@\{(?!slot:|bundle:)[^}]+\}`
/** Variant that treats @{char} / @{outfit} as valid */
const INVALID_REF_SRC_PARTS = String.raw`@\{(?!slot:|bundle:|char\}|outfit\})[^}]+\}`

function findInvalidRefs(doc: { toString: () => string }, allowParts: boolean) {
  const decorations: Array<{ from: number; to: number }> = []
  const text = doc.toString()
  const re = new RegExp(
    allowParts ? INVALID_REF_SRC_PARTS : INVALID_REF_SRC,
    'g',
  )
  let match
  while ((match = re.exec(text)) !== null) {
    decorations.push({ from: match.index, to: match.index + match[0].length })
  }
  return decorations
}

function createInvalidRefHighlight(allowParts: boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: { state: { doc: { toString: () => string } } }) {
        this.decorations = Decoration.set(
          findInvalidRefs(view.state.doc, allowParts).map((d) =>
            invalidRefDeco.range(d.from, d.to),
          ),
        )
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = Decoration.set(
            findInvalidRefs(update.state.doc, allowParts).map((d) =>
              invalidRefDeco.range(d.from, d.to),
            ),
          )
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
}

export const invalidRefHighlight = createInvalidRefHighlight(false)
/** @{char} / @{outfit} count as valid (workspace character prompt only) */
export const invalidRefHighlightParts = createInvalidRefHighlight(true)

function createInvalidRefTooltip(allowParts: boolean) {
  return hoverTooltip((view, pos) => {
    const doc = view.state.doc.toString()
    const re = new RegExp(
      allowParts ? INVALID_REF_SRC_PARTS : INVALID_REF_SRC,
      'g',
    )
    let match
    while ((match = re.exec(doc)) !== null) {
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
            dom.textContent = allowParts
              ? 'Use @{slot:name}, @{bundle:name}, @{char} or @{outfit}'
              : 'Use @{slot:name} or @{bundle:name}'
            return { dom }
          },
        }
      }
    }
    return null
  })
}

export const invalidRefTooltip = createInvalidRefTooltip(false)
export const invalidRefTooltipParts = createInvalidRefTooltip(true)
