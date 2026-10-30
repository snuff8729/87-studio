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
    '.cm-var-highlight': {
      backgroundColor: 'oklch(0.78 0.14 75 / 14%)',
      borderRadius: '3px',
      padding: '1px 0',
      border: '1px solid oklch(0.78 0.14 75 / 35%)',
    },
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
    },
    '.cm-tooltip-autocomplete > ul': {
      maxHeight: '260px',
      minWidth: '280px',
    },
    '.cm-tooltip-autocomplete ul li': {
      padding: '4px 8px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
    },
    '.cm-tooltip-autocomplete ul li .cm-completionLabel': {
      minWidth: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    '.cm-tag-rowcount': {
      marginLeft: 'auto',
      color: 'var(--muted-foreground)',
      fontSize: '10px',
      fontVariantNumeric: 'tabular-nums',
      paddingLeft: '8px',
    },
    '.cm-tag-inprompt': {
      fontSize: '9px',
      color: 'var(--primary)',
      border: '1px solid color-mix(in oklch, var(--primary) 40%, transparent)',
      borderRadius: '4px',
      padding: '0 4px',
      whiteSpace: 'nowrap',
    },
    '.cm-tag-alias': {
      fontSize: '10px',
      color: 'var(--muted-foreground)',
      whiteSpace: 'nowrap',
    },
    '.cm-tag-badge': {
      fontSize: '9px',
      border: '1px solid',
      borderRadius: '4px',
      padding: '0 4px',
      whiteSpace: 'nowrap',
      lineHeight: '14px',
    },
    '.cm-tag-muted': { color: 'var(--muted-foreground)' },
    '.cm-completionInfo': {
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: '0.5rem',
      padding: '8px 10px',
      width: '260px',
      maxWidth: '260px',
      fontSize: '11px',
      lineHeight: '1.5',
      color: 'var(--popover-foreground)',
    },
    '.cm-tag-info-title': { fontSize: '12px', fontWeight: '600' },
    '.cm-tag-meta': {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '4px',
      margin: '3px 0',
    },
    '.cm-tag-count': { fontSize: '10px', color: 'var(--muted-foreground)' },
    '.cm-tag-desc': { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
    '.cm-tag-info-row': { marginTop: '3px' },
    '.cm-tag-card': {
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '8px 10px',
      width: '300px',
      maxWidth: 'min(300px, 90vw)',
      maxHeight: 'min(70vh, 540px)',
      overflowY: 'auto',
      fontSize: '11px',
      lineHeight: '1.5',
      boxShadow: '0 4px 12px oklch(0 0 0 / 40%)',
      color: 'var(--popover-foreground)',
    },
    '.cm-tag-card-head': {
      display: 'flex',
      alignItems: 'baseline',
      gap: '6px',
      cursor: 'grab',
      touchAction: 'none',
      userSelect: 'none',
    },
    '.cm-tag-card[data-pinned] .cm-tag-card-head': { cursor: 'move' },
    '.cm-tag-pin': {
      marginLeft: 'auto',
      alignSelf: 'center',
      color: 'var(--primary)',
      background: 'transparent',
      border: 'none',
      padding: '0 2px',
      cursor: 'pointer',
      lineHeight: '0',
    },
    '.cm-tag-card[data-pinned]': {
      borderColor: 'color-mix(in oklch, var(--primary) 55%, var(--border))',
    },
    '.cm-tag-skel': {
      height: '14px',
      marginTop: '4px',
      borderRadius: '9999px',
      background:
        'linear-gradient(90deg, var(--muted) 25%, color-mix(in oklch, var(--muted) 60%, var(--foreground) 12%) 50%, var(--muted) 75%)',
      backgroundSize: '200% 100%',
      animation: 'cm-tag-skel 1.2s linear infinite',
    },
    '@keyframes cm-tag-skel': {
      from: { backgroundPosition: '200% 0' },
      to: { backgroundPosition: '-200% 0' },
    },
    '.cm-tag-remote-error': {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '4px',
    },
    '.cm-tag-ratings': { marginTop: '4px' },
    '.cm-tag-rating-grid': {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '4px',
      marginTop: '2px',
    },
    '.cm-tag-rating': {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '2px 0',
    },
    '.cm-tag-rating-label': { fontSize: '9px' },
    '.cm-tag-rating-n': {
      fontSize: '11px',
      fontVariantNumeric: 'tabular-nums',
    },
    '.cm-tag-clamp': {
      display: '-webkit-box',
      WebkitLineClamp: '3',
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    },
    '.cm-tag-chips': {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '4px',
      marginTop: '4px',
    },
    '.cm-tag-chip': {
      fontSize: '10px',
      border: '1px solid var(--border)',
      borderRadius: '9999px',
      padding: '0 6px',
      color: 'var(--foreground)',
      background: 'transparent',
      cursor: 'pointer',
    },
    '.cm-tag-chip:hover': { backgroundColor: 'var(--accent)' },
    '.cm-tag-actions': { display: 'flex', gap: '10px', marginTop: '6px' },
    '.cm-tag-link': {
      fontSize: '10px',
      color: 'var(--primary)',
      background: 'transparent',
      border: 'none',
      padding: '0',
      cursor: 'pointer',
      textDecoration: 'none',
    },
    '.cm-tag-link:hover': { textDecoration: 'underline' },
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
