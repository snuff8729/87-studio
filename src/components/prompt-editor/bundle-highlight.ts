import { ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const bundleDeco = Decoration.mark({ class: 'cm-bundle-highlight' })

function findBundles(doc: { toString: () => string }) {
  const decorations: Array<{ from: number; to: number }> = []
  const text = doc.toString()
  const re = /@\{[^}]+\}/g
  let match
  while ((match = re.exec(text)) !== null) {
    decorations.push({ from: match.index, to: match.index + match[0].length })
  }
  return decorations
}

export const bundleHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: { state: { doc: { toString: () => string } } }) {
      this.decorations = Decoration.set(
        findBundles(view.state.doc).map((d) => bundleDeco.range(d.from, d.to)),
      )
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = Decoration.set(
          findBundles(update.state.doc).map((d) => bundleDeco.range(d.from, d.to)),
        )
      }
    }
  },
  { decorations: (v) => v.decorations },
)
