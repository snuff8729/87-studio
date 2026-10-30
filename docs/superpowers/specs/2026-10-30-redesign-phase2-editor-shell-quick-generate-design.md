# Redesign Phase 2 — EditorShell & Quick Generate

Date: 2026-10-30
Status: approved layout (brainstorm mockup `layout-quick-v3.html` option 1); details decided by Claude under the user's "proceed, don't ask dev questions" instruction.

## Goal

A reusable editor layout (`EditorShell`) modelled on video-editor docking: left tabbed panel with a fixed Generate footer, center single-image viewer, right vertical history — resizable and collapsible. Rebuild Quick Generate (`/generate`) on it. Workspace keeps the old `WorkspaceLayout` until phase 3, which will reuse `EditorShell`.

## Decided UX

- **Header (`EditorHeader`)**, h-12, `bg-sidebar`/border-b: `SidebarTrigger` · title · flexible space · right actions slot · panel toggle buttons (show/hide left, show/hide right; desktop only). The old "← Back" button is removed (sidebar navigates).
- **Left panel**: shadcn `Tabs` header row (Prompt · Chars · Refs · Params). Tabs show a count badge when non-zero (Chars = characters count, Refs = enabled reference images count). Active tab underline in `--primary`. Tab body scrolls (`ScrollArea`). **Footer fixed** at panel bottom: compact generation progress (only when a job for this context is running/pending) + `NumberStepper` (count) + `Button variant="brand"` Generate (flex-1). No parameter chips.
- **Center viewer**: the selected image, `object-contain`, centered on a subtle radial background; thin 2px brand-gradient progress line at the top while generating. Bottom info bar (h-9): favorite, 1–5 rating, seed (click copies to clipboard + toast), resolution, "Details →" (opens the existing image-detail overlay). Empty state as today.
- **Keyboard** (ignored while focus is in an input, textarea, contenteditable or CodeMirror, or a dialog is open): `ArrowUp`/`ArrowLeft` → newer image in history, `ArrowDown`/`ArrowRight` → older image; `F` toggles favorite; `1`–`5` set rating (same value again clears, as today).
- **Right history**: vertical strip, newest first, virtualized (keep `@tanstack/react-virtual`). Column count derived from panel width: `max(1, floor((width + gap) / (MIN_THUMB + gap)))` with `MIN_THUMB = 96`, `gap = 6` (so default width ≈ 1 column; widening gives 2+). The S/M/L `GridSizeToggle` is removed here. Selected thumbnail: 2px `--primary` outline. Footer link "View all in gallery".
- **Resizing**: shadcn `Resizable` (react-resizable-panels). Defaults (percent of shell width): left 24, center 66, right 10. Min: left 18, right 7, center 30. Max: left 40, right 30. Handles: 1px border line with a centered grip on hover. Layout persisted per shell via `autoSaveId` / localStorage key `87studio-editor-layout:<id>`.
- **Collapsing**: left and right panels are collapsible (`collapsible` + `collapsedSize 0`); header toggle buttons and dragging past min collapse them; state persisted with the layout.
- **Persisted UI state** (localStorage, try/catch): active left tab per shell (`87studio-editor-tab:<id>`).
- **Mobile (< 768px, `useIsMobile`)**: no resizing. Body shows one pane at a time chosen by a bottom segmented control (shadcn `Tabs`/`ToggleGroup`): **Edit · Result · History**. The Generate footer stays pinned at the bottom in all three views (above the segmented control). Selecting a history item switches to Result. After clicking Generate the view switches to Result.
- **Tablet (768–1023px)**: same as desktop; right panel starts collapsed if no saved layout.
- Drag & drop metadata import on `/generate` keeps working unchanged.

## Architecture

```
src/components/editor-shell/
  editor-shell.tsx        EditorShell (desktop resizable / mobile pane switcher)
  editor-header.tsx       EditorHeader
  editor-left-panel.tsx   tabs + scroll body + footer
  history-columns.ts      pure: historyColumns(width) + constants
  use-editor-persist.ts   tab persistence hook
  __tests__/history-columns.test.ts
src/components/ui/resizable.tsx    (shadcn, hand-ported if CLI fails)
src/components/quick-generate/     (extracted from routes/generate/index.tsx)
  quick-prompt-tab.tsx      prompt + negative editors
  quick-characters-tab.tsx  character list
  image-viewer.tsx          center viewer + info bar + keyboard (reusable in phase 3)
  history-strip.tsx         virtualized history column (reusable in phase 3)
  import-metadata-dialog.tsx (moved as-is)
src/components/workspace/parameter-popover.tsx  export ParameterForm (used by Params tab)
src/routes/generate/index.tsx   page state + composition only
```

`EditorShell` props:

```ts
type EditorTab = { id: string; label: string; badge?: number; content: ReactNode }
interface EditorShellProps {
  id: string                       // persistence namespace, e.g. 'quick-generate'
  header: ReactNode                // usually <EditorHeader/>
  tabs: EditorTab[]
  footer: ReactNode                // Generate footer
  center: ReactNode
  right: ReactNode
  rightTitle: string
  mobilePane?: 'edit' | 'result' | 'history'          // controlled (optional)
  onMobilePaneChange?: (p: 'edit' | 'result' | 'history') => void
}
```

`EditorHeader` gets panel toggles from an `EditorShellContext` (`{ leftCollapsed, rightCollapsed, toggleLeft, toggleRight, isMobile }`) provided by `EditorShell`, so the header can sit inside the shell.

## Out of scope

Workspace layout (phase 3); new generation features; light theme.

## Verification

vitest (incl. history-columns), tsc no new errors vs baseline, lint no new errors in touched files, `npm run build` passes (only after confirming no server on :3000 holds `.output` — otherwise build to a temp outDir or skip and use dev server), headless Chrome on dev server :3100 at 1440/900/390: tabs switch, badges, footer pinned, resize + persist across reload, collapse/expand both panels, history column count changes with width, keyboard nav, mobile pane switcher, Generate switches to Result on mobile.
