import { Prec, StateEffect, StateField } from '@codemirror/state'
import { ViewPlugin, keymap, showTooltip } from '@codemirror/view'
import { completionStatus } from '@codemirror/autocomplete'
import { detectTokenAt } from './editor-context-menu'
import {
  isTagInfoEnabled,
  loadTagInfo,
  subscribeTagInfoEnabled,
  translator,
} from './tag-info-client'
import { el, metaLine } from './tag-info-dom'
import type { EditorView, Tooltip, ViewUpdate } from '@codemirror/view'
import type { TagInfo } from '@/server/functions/tag-assist'
import { tagDisplayName } from '@/lib/tag-query'
import { danbooruColor } from '@/lib/tag-categories'

const SHOW_DELAY_MS = 300

interface CardState {
  /** Token range the card describes */
  from: number
  to: number
  info: TagInfo
}

const setCard = StateEffect.define<CardState | null>()

const cardField = StateField.define<CardState | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setCard)) return e.value
    if (tr.docChanged || tr.selection) return null
    return value
  },
  provide: (f) =>
    showTooltip.compute([f], (state): Tooltip | null => {
      const card = state.field(f)
      if (!card) return null
      return {
        pos: card.from,
        end: card.to,
        above: true,
        arrow: false,
        create: (view) => ({ dom: buildCard(view, card) }),
      }
    }),
})

function chipRow(
  view: EditorView,
  card: CardState,
  label: string,
  names: Array<string>,
): HTMLElement | null {
  if (names.length === 0) return null
  const row = el('div', 'cm-tag-chips')
  row.append(el('span', 'cm-tag-muted', label))
  for (const name of names.slice(0, 8)) {
    const chip = el('button', 'cm-tag-chip', tagDisplayName(name))
    chip.type = 'button'
    chip.addEventListener('click', () => {
      const insert = ', ' + tagDisplayName(name)
      view.dispatch({
        changes: { from: card.to, insert },
        selection: { anchor: card.to + insert.length },
        userEvent: 'input.complete',
      })
      view.focus()
    })
    row.append(chip)
  }
  return row
}

function buildCard(view: EditorView, card: CardState): HTMLElement {
  const t = translator()
  const { info } = card
  const root = el('div', 'cm-tag-card')
  // Keep editor focus when interacting with the card
  root.addEventListener('mousedown', (e) => e.preventDefault())

  const head = el('div', 'cm-tag-card-head')
  const name = el('span', 'cm-tag-info-title', tagDisplayName(info.name))
  name.style.color = danbooruColor(info.category)
  head.append(name)
  if (info.aliasOf) {
    head.append(el('span', 'cm-tag-alias', `← ${tagDisplayName(info.aliasOf)}`))
  }
  root.append(head, metaLine(info))

  const desc = el(
    'div',
    info.description ? 'cm-tag-desc cm-tag-clamp' : 'cm-tag-desc cm-tag-muted',
    info.description ?? t('tagAssist.noDescription'),
  )
  root.append(desc)
  if (info.description && info.description.length > 150) {
    const more = el('button', 'cm-tag-link', t('tagAssist.more'))
    more.type = 'button'
    more.addEventListener('click', () => {
      const open = desc.classList.toggle('cm-tag-clamp')
      more.textContent = open ? t('tagAssist.more') : t('tagAssist.less')
    })
    root.append(more)
  }

  const rows = [
    chipRow(view, card, t('tagAssist.aliases'), info.aliases),
    chipRow(view, card, t('tagAssist.implies'), info.implies),
    chipRow(view, card, t('tagAssist.impliedBy'), info.impliedBy),
    chipRow(view, card, t('tagAssist.sameGroup'), info.sameGroup?.tags ?? []),
  ]
  for (const r of rows) if (r) root.append(r)

  const actions = el('div', 'cm-tag-actions')
  const copy = el('button', 'cm-tag-link', t('tagAssist.copy'))
  copy.type = 'button'
  copy.addEventListener('click', () => {
    void navigator.clipboard
      ?.writeText(tagDisplayName(info.name))
      .then(() => {
        copy.textContent = t('tagAssist.copied')
      })
      .catch(() => {})
  })
  const open = el('a', 'cm-tag-link', t('tagAssist.openTagPage'))
  open.href = `/tags?tag=${encodeURIComponent(info.name)}`
  open.target = '_blank'
  open.rel = 'noopener'
  actions.append(copy, open)
  root.append(actions)
  return root
}

const caretPlugin = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | undefined
    seq = 0
    unsub: () => void
    constructor(readonly view: EditorView) {
      this.unsub = subscribeTagInfoEnabled(() => {
        if (!isTagInfoEnabled()) this.hide()
      })
    }
    hide() {
      clearTimeout(this.timer)
      this.seq++
      if (this.view.state.field(cardField, false)) {
        this.view.dispatch({ effects: setCard.of(null) })
      }
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        clearTimeout(this.timer)
        this.seq++
        return
      }
      if (update.focusChanged && !update.view.hasFocus) {
        this.hide()
        return
      }
      if (!update.selectionSet) return
      clearTimeout(this.timer)
      this.seq++
      const moved = update.transactions.some((tr) => tr.isUserEvent('select'))
      const sel = update.state.selection.main
      if (
        !moved ||
        !sel.empty ||
        !isTagInfoEnabled() ||
        completionStatus(update.state) !== null
      ) {
        return
      }
      const seq = this.seq
      this.timer = setTimeout(() => void this.show(seq), SHOW_DELAY_MS)
    }
    async show(seq: number) {
      const view = this.view
      if (!view.hasFocus || completionStatus(view.state) !== null) return
      const pos = view.state.selection.main.head
      const token = detectTokenAt(view.state.doc.toString(), pos)
      if (token?.type !== 'tag') return
      const info = await loadTagInfo(token.name)
      // Stale (typed / moved / blurred meanwhile) or unknown tag
      if (!info || seq !== this.seq || !view.hasFocus) return
      if (view.state.selection.main.head !== pos) return
      view.dispatch({
        effects: setCard.of({ from: token.from, to: token.to, info }),
      })
    }
    destroy() {
      clearTimeout(this.timer)
      this.unsub()
    }
  },
)

const escapeKeymap = Prec.high(
  keymap.of([
    {
      key: 'Escape',
      run: (view) => {
        if (!view.state.field(cardField, false)) return false
        view.dispatch({ effects: setCard.of(null) })
        return true
      },
    },
  ]),
)

/** Compact tag info card when the caret rests on a tag (see spec section 4). */
export function tagCaretInfo() {
  return [cardField, caretPlugin, escapeKeymap]
}
