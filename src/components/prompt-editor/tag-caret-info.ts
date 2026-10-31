import { Prec, StateEffect, StateField } from '@codemirror/state'
import { ViewPlugin, keymap, showTooltip } from '@codemirror/view'
import { completionStatus } from '@codemirror/autocomplete'
import { detectTokenAt } from './editor-context-menu'
import {
  isDanbooruUnreachable,
  isTagInfoEnabled,
  loadRemote,
  loadTagInfo,
  peekRemote,
  subscribeTagInfoEnabled,
  translator,
} from './tag-info-client'
import { el, metaLine, sourceLabel } from './tag-info-dom'
import {
  getPinnedPos,
  isCompactViewport,
  setPinnedPos,
  subscribePinned,
} from './tag-card-pin'
import type { EditorView, Tooltip, ViewUpdate } from '@codemirror/view'
import type { RemoteResult, TagInfo } from '@/server/functions/tag-assist'
import type { RatingCounts, RemoteKind } from '@/lib/tag-remote'
import { hasAnyCount } from '@/lib/tag-remote'
import { insertTagIntoLastEditor } from '@/components/tag-search/editor-registry'
import { formatCount, tagDisplayName } from '@/lib/tag-query'
import { danbooruColor } from '@/lib/tag-categories'
import { clampCardPos } from '@/lib/tag-card-pos'

const SHOW_DELAY_MS = 300

interface CardState {
  /** Token range the card describes */
  from: number
  to: number
  info: TagInfo
}

const setCard = StateEffect.define<CardState | null>()

// ── card DOM ─────────────────────────────────────────────────────────────────

/** Insert `, tag` after the described token (follow mode) or at the cursor of the last editor (pinned). */
function insertChip(
  view: EditorView,
  card: CardState,
  name: string,
  pinned: boolean,
) {
  if (pinned) {
    insertTagIntoLastEditor(name)
    return
  }
  const insert = ', ' + tagDisplayName(name)
  view.dispatch({
    changes: { from: card.to, insert },
    selection: { anchor: card.to + insert.length },
    userEvent: 'input.complete',
  })
  view.focus()
}

function chipRow(
  view: EditorView,
  card: CardState,
  pinned: boolean,
  label: string,
  names: Array<string>,
  section?: string,
): HTMLElement | null {
  if (names.length === 0) return null
  const row = el('div', 'cm-tag-chips')
  if (section) row.dataset.tagSection = section
  row.append(el('span', 'cm-tag-muted', label))
  for (const name of names.slice(0, 12)) {
    const chip = el('button', 'cm-tag-chip', tagDisplayName(name))
    chip.type = 'button'
    chip.addEventListener('click', () => insertChip(view, card, name, pinned))
    row.append(chip)
  }
  return row
}

const RATING_COLORS: Record<keyof RatingCounts, string> = {
  g: 'oklch(0.75 0.14 150)',
  s: 'oklch(0.82 0.13 95)',
  q: 'oklch(0.75 0.14 55)',
  e: 'oklch(0.68 0.2 25)',
}

function ratingsRow(
  t: ReturnType<typeof translator>,
  ratings: RatingCounts,
): HTMLElement {
  const row = el('div', 'cm-tag-ratings')
  row.dataset.tagSection = 'ratings'
  row.append(el('div', 'cm-tag-muted', t('tagAssist.ratingCounts')))
  const grid = el('div', 'cm-tag-rating-grid')
  for (const k of ['g', 's', 'q', 'e'] as const) {
    const cell = el('div', 'cm-tag-rating')
    const label = el('span', 'cm-tag-rating-label', t(`tagAssist.rating.${k}`))
    label.style.color = RATING_COLORS[k]
    const n = ratings[k]
    cell.append(
      label,
      el('span', 'cm-tag-rating-n', n === null ? '–' : formatCount(n)),
    )
    cell.title = n === null ? '' : n.toLocaleString()
    grid.append(cell)
  }
  row.append(grid)
  if (!hasAnyCount(ratings)) {
    row.append(el('div', 'cm-tag-muted', t('tagAssist.ratingUnavailable')))
  }
  return row
}

/** A remote section: skeleton -> chips / ratings, or a retryable error. */
function remoteSection(
  view: EditorView,
  card: CardState,
  pinned: boolean,
  kind: RemoteKind,
): HTMLElement {
  const t = translator()
  const label =
    kind === 'related'
      ? t('tagAssist.recommended')
      : kind === 'together'
        ? t('tagAssist.usedTogether')
        : t('tagAssist.ratingCounts')
  const holder = el('div', 'cm-tag-remote')
  holder.dataset.tagRemote = kind
  const name = card.info.name

  const render = (res: RemoteResult | null, failed: boolean) => {
    holder.replaceChildren()
    holder.dataset.state = res?.ok ? 'ok' : failed ? 'error' : 'loading'
    if (res?.ok) {
      if (res.kind === 'ratings') {
        holder.append(ratingsRow(t, res.ratings))
      } else {
        const row = chipRow(
          view,
          card,
          pinned,
          label,
          res.tags.map((x) => x.name),
          kind,
        )
        if (row) holder.append(row)
        else holder.dataset.state = 'empty'
      }
    } else if (failed) {
      const box = el('div', 'cm-tag-remote-error')
      box.append(
        el('span', 'cm-tag-muted', `${label}: ${t('tagAssist.remoteFailed')}`),
      )
      const retry = el('button', 'cm-tag-link', t('tagAssist.retry'))
      retry.type = 'button'
      retry.addEventListener('click', () => start(true))
      box.append(retry)
      holder.append(box)
      if (isDanbooruUnreachable()) {
        holder.append(
          el('div', 'cm-tag-muted', t('tagAssist.remoteUnreachable')),
        )
      }
    } else {
      const sk = el('div', 'cm-tag-skel')
      sk.setAttribute('aria-label', label)
      holder.append(el('div', 'cm-tag-muted', label), sk)
    }
    view.requestMeasure()
  }

  const start = (force: boolean) => {
    render(null, false)
    void loadRemote(name, kind, force).then((res) => render(res, !res.ok))
  }

  const cached = peekRemote(name, kind)
  if (cached) render(cached, false)
  else start(false)
  return holder
}

function buildCard(
  view: EditorView,
  card: CardState,
  pinned: boolean,
): HTMLElement {
  const t = translator()
  const { info } = card
  const root = el('div', 'cm-tag-card')
  if (pinned) root.dataset.pinned = 'true'
  // Keep editor focus when interacting with the card
  root.addEventListener('mousedown', (e) => e.preventDefault())

  const head = el('div', 'cm-tag-card-head')
  head.dataset.tagCardHead = ''
  const name = el('span', 'cm-tag-info-title', tagDisplayName(info.name))
  name.style.color = danbooruColor(info.category)
  head.append(name)
  if (info.aliasOf) {
    head.append(el('span', 'cm-tag-alias', `← ${tagDisplayName(info.aliasOf)}`))
  }
  if (pinned) {
    const pin = el('button', 'cm-tag-pin')
    pin.type = 'button'
    pin.dataset.tagCardPin = ''
    pin.title = t('tagAssist.unpinHint')
    pin.setAttribute('aria-label', t('tagAssist.unpinHint'))
    pin.innerHTML =
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M16 3a1 1 0 0 1 .7 1.7L15.4 6l1.8 5.4 1.5 1.5A1 1 0 0 1 18 14.6h-5V21a1 1 0 1 1-2 0v-6.4H6a1 1 0 0 1-.7-1.7l1.5-1.5L8.6 6 7.3 4.7A1 1 0 0 1 8 3h8z"/></svg>'
    pin.addEventListener('click', () => setPinnedPos(null))
    head.append(pin)
  }
  if (!isCompactViewport()) {
    head.title = pinned ? t('tagAssist.unpinHint') : t('tagAssist.dragHint')
    head.addEventListener('pointerdown', (e) => startDrag(e, view, card, root))
    head.addEventListener('dblclick', () => {
      if (getPinnedPos()) setPinnedPos(null)
    })
  }
  root.append(head, metaLine(info))

  const desc = el(
    'div',
    info.description ? 'cm-tag-desc cm-tag-clamp' : 'cm-tag-desc cm-tag-muted',
    info.description ?? t('tagAssist.noDescription'),
  )
  const source = sourceLabel(info)
  if (source) desc.append(source)
  root.append(desc)
  if (info.description && info.description.length > 150) {
    const more = el('button', 'cm-tag-link', t('tagAssist.more'))
    more.type = 'button'
    more.addEventListener('click', () => {
      const open = desc.classList.toggle('cm-tag-clamp')
      more.textContent = open ? t('tagAssist.more') : t('tagAssist.less')
      view.requestMeasure()
    })
    root.append(more)
  }

  const rows = [
    chipRow(view, card, pinned, t('tagAssist.aliases'), info.aliases),
    chipRow(view, card, pinned, t('tagAssist.implies'), info.implies),
    chipRow(view, card, pinned, t('tagAssist.impliedBy'), info.impliedBy),
    chipRow(
      view,
      card,
      pinned,
      t('tagAssist.sameGroup'),
      info.sameGroup?.tags ?? [],
    ),
    chipRow(
      view,
      card,
      pinned,
      t('tagAssist.alternatives'),
      info.alternatives,
      'alternatives',
    ),
  ]
  for (const r of rows) if (r) root.append(r)
  for (const kind of ['related', 'together', 'ratings'] as const) {
    root.append(remoteSection(view, card, pinned, kind))
  }

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

// ── pinned (draggable) card ──────────────────────────────────────────────────

let pinnedHost: HTMLElement | null = null
let pinnedScope: HTMLElement | null = null
let pinnedName: string | null = null
/** Editors whose plugin should re-show a follow-mode card after unpinning. */
let lastPresenter: EditorView | null = null

function viewportSize() {
  return { w: window.innerWidth, h: window.innerHeight }
}

function applyPinnedPosition() {
  const pos = getPinnedPos()
  if (!pinnedHost || !pos) return
  const r = pinnedHost.getBoundingClientRect()
  const c = clampCardPos(pos, { w: r.width, h: r.height }, viewportSize())
  pinnedHost.style.left = `${c.x}px`
  pinnedHost.style.top = `${c.y}px`
}

function removePinnedHost() {
  pinnedHost?.remove()
  pinnedHost = null
  pinnedScope = null
  pinnedName = null
}

/** Render `card` into the pinned singleton (content follows the caret). */
function renderPinned(view: EditorView, card: CardState) {
  if (!pinnedHost?.isConnected) {
    pinnedHost = document.createElement('div')
    pinnedHost.dataset.tagCardPinned = ''
    pinnedHost.style.cssText = 'position:fixed;z-index:100;left:0;top:0'
    document.body.appendChild(pinnedHost)
    pinnedName = null
  }
  // CodeMirror theme classes scope the card styles
  if (!pinnedScope?.isConnected || pinnedScope.parentNode !== pinnedHost) {
    pinnedScope = document.createElement('div')
    pinnedHost.replaceChildren(pinnedScope)
    pinnedName = null
  }
  pinnedScope.className = [...view.dom.classList]
    .filter((c) => c.startsWith('ͼ'))
    .join(' ')
  if (pinnedName !== card.info.name || !pinnedScope.firstChild) {
    pinnedScope.replaceChildren(buildCard(view, card, true))
    pinnedName = card.info.name
  }
  lastPresenter = view
  applyPinnedPosition()
}

function startDrag(
  e: PointerEvent,
  view: EditorView,
  card: CardState,
  root: HTMLElement,
) {
  if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
  e.preventDefault()
  const rect = root.getBoundingClientRect()
  const dx = e.clientX - rect.left
  const dy = e.clientY - rect.top
  const size = { w: rect.width, h: rect.height }
  let started = false
  let last = { x: rect.left, y: rect.top }

  const move = (ev: PointerEvent) => {
    if (!started) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 4) return
      started = true
      if (!getPinnedPos()) {
        // Convert the follow-mode tooltip into the pinned card
        setPinnedPos(last)
        renderPinned(view, card)
      }
    }
    last = clampCardPos(
      { x: ev.clientX - dx, y: ev.clientY - dy },
      size,
      viewportSize(),
    )
    if (pinnedHost) {
      pinnedHost.style.left = `${last.x}px`
      pinnedHost.style.top = `${last.y}px`
    }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    if (started) setPinnedPos(last)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

// ── follow-the-caret tooltip ─────────────────────────────────────────────────

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
        create: (view) => ({ dom: buildCard(view, card, false) }),
      }
    }),
})

const caretPlugin = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | undefined
    seq = 0
    unsubToggle: () => void
    unsubPin: () => void
    windowBlurred = false
    onMouseUp = () => this.schedule()
    onWindowBlur = () => {
      this.windowBlurred = true
    }
    onWindowFocus = () => {
      // Coming back to the window: re-show the card for the caret token
      if (!this.windowBlurred) return
      this.windowBlurred = false
      setTimeout(() => this.schedule(), 0)
    }
    constructor(readonly view: EditorView) {
      this.unsubToggle = subscribeTagInfoEnabled(() => {
        if (!isTagInfoEnabled()) {
          this.hide()
          removePinnedHost()
        }
      })
      this.unsubPin = subscribePinned(() => {
        if (getPinnedPos()) {
          // Pinned via another editor: this editor's tooltip must not linger
          this.hide()
        } else {
          removePinnedHost()
          if (lastPresenter === this.view) this.schedule()
        }
      })
      // A click that does not move the caret (e.g. after Esc) emits no
      // selection change, so listen for the click itself.
      view.dom.addEventListener('mouseup', this.onMouseUp)
      window.addEventListener('blur', this.onWindowBlur)
      window.addEventListener('focus', this.onWindowFocus)
    }
    /** Clear the follow-mode card. Safe to call from anywhere but update(). */
    hide() {
      clearTimeout(this.timer)
      this.seq++
      if (this.view.state.field(cardField, false)) {
        this.view.dispatch({ effects: setCard.of(null) })
      }
    }
    /** (Re)start the show timer for the token under the caret. */
    schedule() {
      clearTimeout(this.timer)
      this.seq++
      const view = this.view
      const sel = view.state.selection.main
      if (
        !sel.empty ||
        !view.hasFocus ||
        !isTagInfoEnabled() ||
        completionStatus(view.state) !== null
      ) {
        return
      }
      const seq = this.seq
      this.timer = setTimeout(() => void this.show(seq), SHOW_DELAY_MS)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        clearTimeout(this.timer)
        this.seq++
        return
      }
      if (update.focusChanged && !update.view.hasFocus) {
        // Dispatching inside update() throws (and CodeMirror then disables
        // this plugin for good), so defer the hide.
        clearTimeout(this.timer)
        this.seq++
        setTimeout(() => this.hide(), 0)
        return
      }
      if (!update.selectionSet) return
      clearTimeout(this.timer)
      this.seq++
      const moved = update.transactions.some((tr) => tr.isUserEvent('select'))
      if (moved) this.schedule()
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
      const card: CardState = { from: token.from, to: token.to, info }
      if (getPinnedPos()) {
        renderPinned(view, card)
        return
      }
      view.dispatch({ effects: setCard.of(card) })
    }
    destroy() {
      clearTimeout(this.timer)
      this.seq++
      this.unsubToggle()
      this.unsubPin()
      this.view.dom.removeEventListener('mouseup', this.onMouseUp)
      window.removeEventListener('blur', this.onWindowBlur)
      window.removeEventListener('focus', this.onWindowFocus)
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

if (typeof window !== 'undefined') {
  window.addEventListener('resize', applyPinnedPosition)
}

/** Compact tag info card when the caret rests on a tag (see spec section 4). */
export function tagCaretInfo() {
  return [cardField, caretPlugin, escapeKeymap]
}
