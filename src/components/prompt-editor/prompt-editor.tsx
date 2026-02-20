import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { autocompletion, acceptCompletion } from '@codemirror/autocomplete'
import { darkTheme } from './theme'
import { placeholderHighlight } from './placeholder-highlight'
import { bundleHighlight } from './bundle-highlight'
import { weightHighlight } from './weight-highlight'
import { danbooruCompletion, loadTagDatabase } from './danbooru-completion'
import { bundleCompletion, setBundleNames } from './bundle-completion'
import { bundleTooltip } from './bundle-tooltip'

// CM6 bug workaround: When lineWrapping is on and cursor is at a wrap boundary,
// enforceCursorAssoc() modifies the DOM selection without checking hasFocus,
// stealing focus back from the newly-focused editor.
const fixLineWrapFocusSteal = ViewPlugin.fromClass(class {
  update(update: ViewUpdate) {
    if (update.focusChanged && !update.view.hasFocus) {
      ;(update.view as any).viewState.mustEnforceCursorAssoc = false
    }
  }
})

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
  bundleNames?: Array<{ name: string; content: string }>
}

export function PromptEditor({
  value,
  onChange,
  placeholder,
  minHeight = '200px',
  bundleNames: bundleNamesProp,
}: PromptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    loadTagDatabase()
  }, [])

  useEffect(() => {
    if (bundleNamesProp) {
      setBundleNames(bundleNamesProp)
    }
  }, [bundleNamesProp])

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        keymap.of([
          { key: 'Tab', run: acceptCompletion },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        history(),
        EditorView.lineWrapping,
        fixLineWrapFocusSteal,
        darkTheme,
        placeholderHighlight,
        bundleHighlight,
        weightHighlight,
        bundleTooltip,
        autocompletion({
          override: [bundleCompletion, danbooruCompletion],
          activateOnTyping: true,
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '.cm-editor': { minHeight },
          '.cm-scroller': { minHeight },
          '.cm-content': { minHeight },
        }),
        placeholder
          ? EditorView.contentAttributes.of({
              'aria-placeholder': placeholder,
            })
          : [],
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only recreate on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value changes (skip if editor is focused to avoid cursor jumps)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.hasFocus) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return <div ref={containerRef} />
}
