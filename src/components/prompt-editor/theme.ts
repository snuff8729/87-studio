import { EditorView } from '@codemirror/view'

export const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--card)',
      color: 'var(--foreground)',
      borderRadius: '0.5rem',
      border: '1px solid var(--border)',
      fontSize: '13px',
    },
    '.cm-content': {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      padding: '8px 0',
      caretColor: 'var(--foreground)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--foreground)',
    },
    '&.cm-focused': {
      outline: '2px solid var(--ring)',
      outlineOffset: '-1px',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--card)',
      color: 'var(--muted-foreground)',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--accent)',
    },
    '.cm-selectionBackground': {
      backgroundColor:
        'color-mix(in oklab, var(--primary) 20%, transparent) !important',
    },
    '.cm-line': {
      padding: '0 8px',
    },
    // Placeholder highlight — brand signature
    '.cm-placeholder-highlight': {
      backgroundColor: 'color-mix(in oklab, var(--primary) 15%, transparent)',
      borderRadius: '3px',
      padding: '1px 0',
      border: '1px solid color-mix(in oklab, var(--primary) 30%, transparent)',
    },
    // Bundle highlight — teal/cyan signature
    '.cm-bundle-highlight': {
      backgroundColor: 'oklch(0.65 0.12 200 / 15%)',
      borderRadius: '3px',
      padding: '1px 0',
      border: '1px solid oklch(0.65 0.12 200 / 30%)',
    },
    // Invalid ref highlight — red wavy underline
    '.cm-invalid-ref-highlight': {
      textDecoration: 'wavy underline oklch(0.65 0.2 25)',
      textDecorationSkipInk: 'none',
      backgroundColor: 'oklch(0.65 0.2 25 / 8%)',
      borderRadius: '3px',
    },
    // Autocomplete styling
    '.cm-tooltip-autocomplete': {
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: '0.5rem',
      maxHeight: '180px',
      overflowY: 'auto',
    },
    '.cm-tooltip-autocomplete ul li': {
      padding: '4px 8px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--accent)',
    },
    '.cm-completionLabel': {
      color: 'var(--foreground)',
    },
    '.cm-completionDetail': {
      color: 'var(--muted-foreground)',
      fontStyle: 'normal',
      marginLeft: '8px',
    },
    // Hide completion icons, color labels by type
    '.cm-completionIcon': { display: 'none' },
    // Slot — brand
    '.cm-completionIcon-property + .cm-completionLabel': {
      color: 'var(--chart-4)',
    },
    // Bundle — teal
    '.cm-completionIcon-variable + .cm-completionLabel': {
      color: 'oklch(0.75 0.08 200)',
    },
    // Danbooru categories
    '.cm-completionIcon-tag-general + .cm-completionLabel': {
      color: 'oklch(0.75 0.08 250)',
    },
    '.cm-completionIcon-tag-artist + .cm-completionLabel': {
      color: 'oklch(0.75 0.12 25)',
    },
    '.cm-completionIcon-tag-copyright + .cm-completionLabel': {
      color: 'oklch(0.75 0.12 310)',
    },
    '.cm-completionIcon-tag-character + .cm-completionLabel': {
      color: 'oklch(0.75 0.12 145)',
    },
    '.cm-completionIcon-tag-meta + .cm-completionLabel': {
      color: 'var(--secondary-foreground)',
    },
    // Bundle hover tooltip — compact card
    '.cm-tooltip-bundle-preview': {
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '8px 10px',
      maxWidth: '320px',
      fontSize: '11px',
      lineHeight: '1.5',
      boxShadow: '0 4px 12px oklch(0 0 0 / 40%)',
    },
    '.cm-tooltip-invalid-ref': {
      color: 'oklch(0.85 0.15 25)',
      fontSize: '11px',
      padding: '4px 8px',
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
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
  },
  { dark: true },
)
