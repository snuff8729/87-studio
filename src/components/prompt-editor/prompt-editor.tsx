import { useCallback, useEffect, useRef, useState } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, ViewPlugin, keymap, tooltips } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { acceptCompletion, autocompletion } from '@codemirror/autocomplete'
import { darkTheme, lightTheme } from './theme'
import { placeholderHighlight } from './placeholder-highlight'
import { bundleHighlight } from './bundle-highlight'
import { weightHighlight } from './weight-highlight'
import { invalidRefHighlight, invalidRefTooltip } from './invalid-ref-highlight'
import { setBundleNames, setSlotNames, unifiedCompletion } from './bundle-completion'
import { bundleTooltip } from './bundle-tooltip'
import type { ViewUpdate } from '@codemirror/view'
import { useTheme } from '@/lib/theme'
import {
  EditorContextMenu,
  detectTokenAt,
  type ContextMenuTarget,
} from './editor-context-menu'

// CM6 bug workaround: When lineWrapping is on and cursor is at a wrap boundary,
// enforceCursorAssoc() modifies the DOM selection without checking hasFocus,
// stealing focus back from the newly-focused editor.
const fixLineWrapFocusSteal = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      if (update.focusChanged && !update.view.hasFocus) {
        ;(update.view as any).viewState.mustEnforceCursorAssoc = false
      }
    }
  },
)

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
  bundleNames?: Array<{ name: string; content: string }>
  slotNames?: Array<string>
}

export function PromptEditor({
  value,
  onChange,
  placeholder,
  minHeight = '200px',
  bundleNames: bundleNamesProp,
  slotNames: slotNamesProp,
}: PromptEditorProps) {
  const { resolvedTheme } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const themeCompartmentRef = useRef<Compartment | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    target: ContextMenuTarget
    x: number
    y: number
  } | null>(null)

  const handleContextMenuDelete = useCallback(
    (from: number, to: number) => {
      const view = viewRef.current
      if (!view) return
      const doc = view.state.doc.toString()
      // Clean surrounding comma/whitespace
      let delFrom = from
      let delTo = to
      // Remove trailing comma + space
      if (doc[delTo] === ',' || doc[delTo] === ' ') {
        delTo++
        while (delTo < doc.length && doc[delTo] === ' ') delTo++
      }
      // Or leading comma + space if at end
      else if (delFrom > 0 && (doc[delFrom - 1] === ',' || doc[delFrom - 1] === ' ')) {
        delFrom--
        while (delFrom > 0 && (doc[delFrom - 1] === ',' || doc[delFrom - 1] === ' ')) delFrom--
      }
      view.dispatch({ changes: { from: delFrom, to: delTo } })
    },
    [],
  )

  useEffect(() => {
    if (bundleNamesProp) {
      setBundleNames(bundleNamesProp)
    }
  }, [bundleNamesProp])

  useEffect(() => {
    if (slotNamesProp) {
      setSlotNames(slotNamesProp)
    }
  }, [slotNamesProp])

  useEffect(() => {
    if (!containerRef.current) return

    const compartment = new Compartment()
    themeCompartmentRef.current = compartment

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
        compartment.of(resolvedTheme === 'dark' ? darkTheme : lightTheme),
        placeholderHighlight,
        bundleHighlight,
        weightHighlight,
        invalidRefHighlight,
        invalidRefTooltip,
        bundleTooltip,
        tooltips({ parent: document.body }),
        autocompletion({
          override: [unifiedCompletion],
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

    // Context menu handler
    const handleContextMenu = (e: MouseEvent) => {
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
      if (pos === null) return
      const doc = view.state.doc.toString()
      const token = detectTokenAt(doc, pos)
      if (token) {
        e.preventDefault()
        setContextMenu({ target: token, x: e.clientX, y: e.clientY })
      }
    }
    view.dom.addEventListener('contextmenu', handleContextMenu)

    return () => {
      view.dom.removeEventListener('contextmenu', handleContextMenu)
      view.destroy()
      viewRef.current = null
    }
    // Only recreate on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync theme changes at runtime
  useEffect(() => {
    const view = viewRef.current
    const compartment = themeCompartmentRef.current
    if (!view || !compartment) return
    view.dispatch({
      effects: compartment.reconfigure(
        resolvedTheme === 'dark' ? darkTheme : lightTheme,
      ),
    })
  }, [resolvedTheme])

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

  return (
    <>
      <div ref={containerRef} />
      {contextMenu && (
        <EditorContextMenu
          target={contextMenu.target}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onDelete={handleContextMenuDelete}
        />
      )}
    </>
  )
}
