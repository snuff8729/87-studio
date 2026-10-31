import { Decoration, ViewPlugin } from '@codemirror/view'
import { StateEffect } from '@codemirror/state'
import { getBundleNames, lookupBundleRef } from './bundle-completion'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

/** Dispatch after the bundle list changed so refs are re-classified */
export const refreshBundleRefs = StateEffect.define<null>()

const bundleDeco = Decoration.mark({ class: 'cm-bundle-highlight' })
const wildcardDeco = Decoration.mark({ class: 'cm-bundle-wildcard-highlight' })
const invalidDeco = Decoration.mark({ class: 'cm-invalid-ref-highlight' })

function buildDecorations(doc: { toString: () => string }): DecorationSet {
  const text = doc.toString()
  const known = getBundleNames().length > 0
  const re = /@\{bundle:([^}]+)\}/g
  const ranges = []
  let match
  while ((match = re.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    const ref = lookupBundleRef(match[1])
    // Unknown refs are only flagged once the bundle list is loaded
    const deco = ref
      ? ref.bundle.kind === 'wildcard'
        ? wildcardDeco
        : bundleDeco
      : known
        ? invalidDeco
        : bundleDeco
    ranges.push(deco.range(from, to))
  }
  return Decoration.set(ranges)
}

export const bundleHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: { state: { doc: { toString: () => string } } }) {
      this.decorations = buildDecorations(view.state.doc)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(refreshBundleRefs)),
        )
      ) {
        this.decorations = buildDecorations(update.state.doc)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
