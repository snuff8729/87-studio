import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { autocompletion } from '@codemirror/autocomplete'
import { darkTheme } from './theme'
import { placeholderHighlight } from './placeholder-highlight'
import { weightHighlight } from './weight-highlight'
import { danbooruCompletion, loadTagDatabase } from './danbooru-completion'

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
}

export function PromptEditor({
  value,
  onChange,
  placeholder,
  minHeight = '200px',
}: PromptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    loadTagDatabase()
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        EditorView.lineWrapping,
        darkTheme,
        placeholderHighlight,
        weightHighlight,
        autocompletion({
          override: [danbooruCompletion],
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

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return <div ref={containerRef} />
}
