# Redesign Phase 2 — EditorShell & Quick Generate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable resizable/collapsible `EditorShell` and rebuild `/generate` on it (left tabs + fixed Generate footer, center viewer, right vertical history, mobile pane switcher).

**Architecture:** `src/components/editor-shell/*` owns layout only (no data). Quick Generate's pieces are extracted from the 1400-line route into `src/components/quick-generate/*`, then the route composes them inside `EditorShell`.

**Tech Stack:** TanStack Start/Router, React 19, Tailwind 4, shadcn/ui (radix-maia, hugeicons), react-resizable-panels, @tanstack/react-virtual, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-redesign-phase2-editor-shell-quick-generate-design.md`

## Global Constraints

- **Dependencies are installed with npm** using the bundled runtime: `./runtime/node/npm.cmd install <pkg>` (updates `package.json` + `package-lock.json`), then `pnpm install --lockfile-only` to sync `pnpm-lock.yaml` WITHOUT touching node_modules. Never run `pnpm install/add` without `--lockfile-only`, never `pnpm build`/`npm run build` (the user's server on :3000 serves `.output`).
- Run tools via runtime: `./runtime/node/npx.cmd vitest run`, `./runtime/node/node.exe node_modules/typescript/bin/tsc --noEmit -p .`, `./runtime/node/npx.cmd eslint <files>`, `./runtime/node/npx.cmd prettier --write <files>`.
- Baseline (not yours to fix): tsc errors in editor-context-menu.tsx, bundles/index.tsx, tags/index.tsx, tag-bookmarks.ts.
- shadcn components first; icons hugeicons; all strings via i18n (`en.ts`/`ko.ts`, `ko` typed from `en`).
- Dark tokens only; Generate = `Button variant="brand"`; selection/active = `--primary`.
- Style: no semicolons, single quotes, Prettier.

## Review Focus

1. Persisted layout from localStorage that is invalid/out of range (or from an older version) must not crash or produce a 0-width center — fall back to defaults.
2. History with 0 images, 1 image, and >1000 images (virtualization) at 1 and 3 columns.
3. Keyboard shortcuts must not fire while typing in CodeMirror prompt editors or inside dialogs.
4. Mobile: Generate footer reachable in every pane; switching panes keeps prompt editor content (no remount losing unsaved state).
5. SSR: no `window`/`localStorage` access during render (hydration mismatch).

---

## Waves
- Wave 1 (parallel, separate worktrees off the phase-2 branch commit): Task 1, Task 2.
- Wave 2: Task 3 (needs both).

### Task 1: EditorShell + resizable

**Files:** Create `src/components/ui/resizable.tsx` (shadcn; hand-port from `npx shadcn@latest view resizable` if CLI add fails), `src/components/editor-shell/{editor-shell.tsx,editor-header.tsx,editor-left-panel.tsx,history-columns.ts,use-editor-persist.ts}`, `src/components/editor-shell/__tests__/history-columns.test.ts`. Modify `package.json`, `package-lock.json`, `pnpm-lock.yaml` (add `react-resizable-panels`, version shadcn's resizable expects), `src/lib/i18n/en.ts`, `ko.ts` (keys under `editor.*`: `edit`, `result`, `history`, `showLeftPanel`, `hideLeftPanel`, `showRightPanel`, `hideRightPanel`).

**Interfaces (produces):**
- `historyColumns(width: number): number` = `max(1, floor((width + HISTORY_GAP) / (HISTORY_MIN_THUMB + HISTORY_GAP)))`; exports `HISTORY_MIN_THUMB = 96`, `HISTORY_GAP = 6`.
- `EditorShell(props: EditorShellProps)` exactly as in the spec's Architecture block; `EditorTab` type exported.
- `EditorHeader({ title: ReactNode; actions?: ReactNode })` — reads `useEditorShell()`.
- `useEditorShell(): { leftCollapsed: boolean; rightCollapsed: boolean; toggleLeft(): void; toggleRight(): void; isMobile: boolean; mobilePane: 'edit'|'result'|'history'; setMobilePane(p): void }` (context provided by EditorShell).
- `usePersistedTab(id: string, tabIds: string[]): [string, (t: string) => void]` — SSR-safe (initial = first tab; read storage in effect), invalid stored id → first tab.

- [ ] Step 1: failing test `history-columns.test.ts`: `historyColumns(0)===1`, `historyColumns(96)===1`, `historyColumns(197)===1`, `historyColumns(198)===2`, `historyColumns(300)===2`, `historyColumns(500)===4`, negative/NaN → 1.
- [ ] Step 2: run vitest → FAIL; implement; → PASS.
- [ ] Step 3: install dep (npm + pnpm --lockfile-only), add `resizable.tsx`.
- [ ] Step 4: implement shell per spec "Decided UX" (sizes, min/max, collapsible, persistence key `87studio-editor-layout:<id>`, mobile pane switcher with footer pinned, tablet right-collapsed default). Header panel toggles call panel `collapse()/expand()` via imperative panel refs. Invalid persisted layout → defaults (Review Focus 1).
- [ ] Step 5: tsc/lint/vitest clean; commit `feat(editor-shell): resizable tabbed editor layout`.

### Task 2: Extract Quick Generate pieces (no visual change)

**Files:** Create `src/components/quick-generate/{quick-prompt-tab.tsx,quick-characters-tab.tsx,image-viewer.tsx,history-strip.tsx,import-metadata-dialog.tsx}`; modify `src/routes/generate/index.tsx` (import them; page still renders with `WorkspaceLayout`), `src/components/workspace/parameter-popover.tsx` (export `ParameterForm` with its props type, no behavior change).

**Interfaces (produces):**
- `QuickPromptTab({ state, setState })` — general + negative prompt editors (from `PromptPanelLocal`).
- `QuickCharactersTab({ characters, addCharacter, removeCharacter, updateCharacterField })` — character section (from `PromptPanelLocal`).
- `ImageViewer({ image, imageParams, onToggleFavorite, onSetRating, onPrev?, onNext?, generating?: boolean })` where `image` is the current `selectedImage` shape — renders viewer + info bar; implements seed click-to-copy (toast `quickGenerate.seedCopied`), keyboard shortcuts per spec (guard: skip when `event.target` is input/textarea/contenteditable or inside `.cm-editor`, or `document.querySelector('[role="dialog"][data-state="open"]')`), 2px top progress line when `generating`.
- `HistoryStrip({ images, selectedImageId, onSelect, footer?: ReactNode })` — virtualized, columns from `historyColumns(width)` measured with ResizeObserver; Task 2 inlines a local copy of the formula `Math.max(1, Math.floor((w + 6) / (96 + 6)))` with a `// TODO(task3): use historyColumns` comment because Task 1 lands in parallel.
- `ImportMetadataDialog` moved verbatim.

- [ ] Step 1: extract, keeping behavior; add new i18n key `quickGenerate.seedCopied`.
- [ ] Step 2: tsc/lint/vitest; manual sanity not required; commit `refactor(generate): extract quick generate components`.

### Task 3: Compose /generate on EditorShell

**Files:** Modify `src/routes/generate/index.tsx`, `src/components/quick-generate/history-strip.tsx` (use `historyColumns`), i18n if needed.

- [ ] Step 1: Replace `WorkspaceLayout` with `EditorShell id="quick-generate"`: header `EditorHeader` (title `quickGenerate.title`, actions: gallery link button); tabs prompt/chars(badge=characters.length)/refs(badge=enabled refs count, from the same query ReferencePanel uses)/params(`ParameterForm`); footer = `GenerationProgress` (compact) + `NumberStepper` + brand Generate; center `ImageViewer` (onPrev/onNext over `images`, generating from queue state); right `HistoryStrip` (footer link to gallery). Mobile: on history select → `setMobilePane('result')`; on Generate → `'result'`.
- [ ] Step 2: Remove now-unused code (QuickGenerateHeader, PromptPanelLocal, CenterPreview, HistoryPanelLocal, bottom toolbar bits).
- [ ] Step 3: tsc/lint/vitest clean; commit `feat(generate): quick generate on EditorShell`.
