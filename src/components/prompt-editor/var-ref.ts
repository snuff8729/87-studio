import { StateEffect } from '@codemirror/state'
import { Decoration, ViewPlugin, hoverTooltip } from '@codemirror/view'
import type { Range } from '@codemirror/state'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import type {
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'

/**
 * `@{var:name}` references of outfit item fragments. Known names (the item's
 * variables) are highlighted, unknown names get the invalid-ref warning.
 * Names come from a getter so the editor can update them without being
 * recreated; dispatch `refreshVarRefs` after they change.
 */
export const refreshVarRefs = StateEffect.define<null>()

const knownDeco = Decoration.mark({ class: 'cm-var-highlight' })
const unknownDeco = Decoration.mark({ class: 'cm-invalid-ref-highlight' })
const VAR_RE = /@\{var:([^}]*)\}/g

function build(text: string, names: Array<string>): DecorationSet {
  const ranges: Array<Range<Decoration>> = []
  for (const m of text.matchAll(VAR_RE)) {
    const from = m.index
    const to = from + m[0].length
    ranges.push(
      (names.includes(m[1].trim()) ? knownDeco : unknownDeco).range(from, to),
    )
  }
  return Decoration.set(ranges)
}

export function varRefExtension(getNames: () => Array<string>) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: { state: { doc: { toString: () => string } } }) {
        this.decorations = build(view.state.doc.toString(), getNames())
      }
      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.transactions.some((tr) =>
            tr.effects.some((e) => e.is(refreshVarRefs)),
          )
        ) {
          this.decorations = build(update.state.doc.toString(), getNames())
        }
      }
    },
    { decorations: (v) => v.decorations },
  )
  const tooltip = hoverTooltip((view, pos) => {
    const doc = view.state.doc.toString()
    for (const m of doc.matchAll(VAR_RE)) {
      const from = m.index
      const to = from + m[0].length
      if (pos < from || pos > to) continue
      if (getNames().includes(m[1].trim())) return null
      return {
        pos: from,
        end: to,
        above: true,
        create() {
          const dom = document.createElement('div')
          dom.className = 'cm-tooltip-invalid-ref'
          dom.textContent = 'Unknown variable (resolves to empty)'
          return { dom }
        },
      }
    }
    return null
  })
  return [plugin, tooltip]
}

/** Completion source: `@{` / `@{var:` → the item's variable names. */
export function varCompletionSource(getNames: () => Array<string>) {
  return (context: CompletionContext): CompletionResult | null => {
    const m = context.matchBefore(/@\{(?:v(?:a(?:r:?)?)?|var:[^}\s]*)?$/)
    if (!m) return null
    const names = getNames()
    if (names.length === 0) return null
    const typed = m.text.slice(2)
    const query = typed.startsWith('var:') ? typed.slice(4).toLowerCase() : ''
    return {
      from: m.from + 2,
      validFor: /^[^}]*$/,
      options: names
        .filter((n) => !query || n.toLowerCase().includes(query))
        .map((n) => ({
          label: `var:${n}`,
          detail: 'variable',
          type: 'variable' as const,
          apply: `var:${n}}`,
          boost: 3,
        })),
    }
  }
}
