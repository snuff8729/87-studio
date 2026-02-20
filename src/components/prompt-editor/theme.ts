import { EditorView } from '@codemirror/view'

export const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'oklch(0.18 0.006 70)',
      color: 'oklch(0.93 0.01 80)',
      borderRadius: '0.5rem',
      border: '1px solid oklch(1 0.03 70 / 8%)',
      fontSize: '13px',
    },
    '.cm-content': {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      padding: '8px 0',
      caretColor: 'oklch(0.93 0.01 80)',
    },
    '.cm-cursor': {
      borderLeftColor: 'oklch(0.93 0.01 80)',
    },
    '&.cm-focused': {
      outline: '2px solid oklch(0.72 0.14 70 / 50%)',
      outlineOffset: '-1px',
    },
    '.cm-gutters': {
      backgroundColor: 'oklch(0.18 0.006 70)',
      color: 'oklch(0.55 0.02 70)',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'oklch(1 0.03 70 / 8%)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'oklch(0.72 0.14 70 / 20%) !important',
    },
    '.cm-line': {
      padding: '0 8px',
    },
    // Placeholder highlight — amber signature
    '.cm-placeholder-highlight': {
      backgroundColor: 'oklch(0.72 0.14 70 / 15%)',
      borderRadius: '3px',
      padding: '1px 0',
      border: '1px solid oklch(0.72 0.14 70 / 30%)',
    },
    // Bundle highlight — teal/cyan signature
    '.cm-bundle-highlight': {
      backgroundColor: 'oklch(0.65 0.12 200 / 15%)',
      borderRadius: '3px',
      padding: '1px 0',
      border: '1px solid oklch(0.65 0.12 200 / 30%)',
    },
    // Autocomplete styling
    '.cm-tooltip-autocomplete': {
      backgroundColor: 'oklch(0.20 0.008 70)',
      border: '1px solid oklch(1 0.03 70 / 8%)',
      borderRadius: '0.5rem',
      maxHeight: '180px',
      overflowY: 'auto',
    },
    '.cm-tooltip-autocomplete ul li': {
      padding: '4px 8px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'oklch(0.26 0.012 70)',
    },
    '.cm-completionLabel': {
      color: 'oklch(0.93 0.01 80)',
    },
    '.cm-completionDetail': {
      color: 'oklch(0.55 0.02 70)',
      fontStyle: 'normal',
      marginLeft: '8px',
    },
    // Bundle hover tooltip — compact card
    '.cm-tooltip-bundle-preview': {
      backgroundColor: 'oklch(0.20 0.008 70)',
      border: '1px solid oklch(1 0.03 70 / 12%)',
      borderRadius: '8px',
      padding: '8px 10px',
      maxWidth: '320px',
      fontSize: '11px',
      lineHeight: '1.5',
      boxShadow: '0 4px 12px oklch(0 0 0 / 40%)',
    },
    '.cm-tooltip-bundle-name': {
      color: 'oklch(0.72 0.12 200)',
      fontWeight: '600',
      fontSize: '12px',
    },
    '.cm-tooltip-bundle-sep': {
      height: '1px',
      backgroundColor: 'oklch(1 0 0 / 8%)',
      margin: '5px 0',
    },
    '.cm-tooltip-bundle-content': {
      color: 'oklch(0.70 0.01 80)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
  },
  { dark: true },
)
