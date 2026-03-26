import { Decoration, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

const placeholderDeco = Decoration.mark({ class: 'cm-placeholder-highlight' })

function findPlaceholders(doc: { toString: () => string }) {
  const decorations: Array<{ from: number; to: number }> = []
  const text = doc.toString()
  const re = /\\\\\w+\\\\/g
  let match
  while ((match = re.exec(text)) !== null) {
    decorations.push({ from: match.index, to: match.index + match[0].length })
  }
  return decorations
}

export const placeholderHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: { state: { doc: { toString: () => string } } }) {
      this.decorations = Decoration.set(
        findPlaceholders(view.state.doc).map((d) =>
          placeholderDeco.range(d.from, d.to),
        ),
      )
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = Decoration.set(
          findPlaceholders(update.state.doc).map((d) =>
            placeholderDeco.range(d.from, d.to),
          ),
        )
      }
    }
  },
  { decorations: (v) => v.decorations },
)
