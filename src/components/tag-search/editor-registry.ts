import { useSyncExternalStore } from 'react'
import type { EditorView } from '@codemirror/view'
import { planTagInsert, tagDisplayName } from '@/lib/tag-query'

/**
 * The last focused prompt editor (CodeMirror view). Tag Search inserts into it
 * even after focus moved to the search window.
 */
let last: EditorView | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function registerFocusedEditor(view: EditorView) {
  if (last === view) return
  last = view
  emit()
}

export function unregisterEditor(view: EditorView) {
  if (last === view) {
    last = null
    emit()
  }
}

export function getLastFocusedEditor(): EditorView | null {
  if (last && !last.dom.isConnected) {
    last = null
  }
  return last
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Reactive "is there an editor to insert into". */
export function useHasPromptEditor(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getLastFocusedEditor() !== null,
    () => false,
  )
}

/** Insert `tag` at the last focused editor's cursor (end when unavailable). */
export function insertTagIntoLastEditor(tag: string): boolean {
  const view = getLastFocusedEditor()
  if (!view) return false
  const doc = view.state.doc.toString()
  const head = view.state.selection.main.head
  const plan = planTagInsert(doc, head, tagDisplayName(tag))
  view.dispatch({
    changes: { from: plan.from, to: plan.to, insert: plan.insert },
    selection: { anchor: plan.cursor },
    userEvent: 'input.complete',
  })
  return true
}
