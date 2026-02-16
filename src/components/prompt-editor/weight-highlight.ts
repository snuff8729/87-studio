import { ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const WEIGHT_RE = /(?<![a-zA-Z_])(-?\d+(?:\.\d+)?)::((?:[^:]|:(?!:))*?)::/g

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function weightColor(weight: number) {
  const w = clamp(weight, -3, 3)
  const abs = Math.abs(w)
  const t = abs / 3 // 0..1

  if (w === 0) {
    return { hue: 0, chroma: 0, lightness: 0.55 }
  }

  const hue = w > 0 ? 145 : 25
  const chroma = 0.04 + t * 0.12 // 0.04..0.16
  const lightness = 0.55 + t * 0.15 // 0.55..0.70

  return { hue, chroma, lightness }
}

function findWeights(doc: { toString: () => string }) {
  const decorations: Array<{ from: number; to: number; deco: Decoration }> = []
  const text = doc.toString()
  let match

  while ((match = WEIGHT_RE.exec(text)) !== null) {
    const fullStart = match.index
    const fullEnd = fullStart + match[0].length
    const weight = parseFloat(match[1])

    const { hue, chroma, lightness } = weightColor(weight)
    const t = clamp(Math.abs(weight), 0, 3) / 3
    const bgAlpha = (0.14 + t * 0.18).toFixed(2)    // 0.14 → 0.32
    const borderAlpha = (0.30 + t * 0.35).toFixed(2) // 0.30 → 0.65
    const bg = `oklch(${lightness} ${chroma} ${hue} / ${bgAlpha})`
    const border = `oklch(${lightness} ${chroma} ${hue} / ${borderAlpha})`

    decorations.push({
      from: fullStart,
      to: fullEnd,
      deco: Decoration.mark({
        attributes: {
          style: `background-color: ${bg}; border-bottom: 1.5px solid ${border}; border-radius: 2px;`,
        },
      }),
    })
  }

  return decorations.sort((a, b) => a.from - b.from)
}

export const weightHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: { state: { doc: { toString: () => string } } }) {
      this.decorations = Decoration.set(
        findWeights(view.state.doc).map((d) => d.deco.range(d.from, d.to)),
      )
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = Decoration.set(
          findWeights(update.state.doc).map((d) => d.deco.range(d.from, d.to)),
        )
      }
    }
  },
  { decorations: (v) => v.decorations },
)
