import { Decoration, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

const invalidRefDeco = Decoration.mark({ class: 'cm-invalid-ref-highlight' })

function findInvalidRefs(doc: { toString: () => string }) {
  const decorations: Array<{ from: number; to: number }> = []
  const text = doc.toString()
  const re = /@\{(?!slot:|bundle:)[^}]+\}/g
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
