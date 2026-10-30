# Redesign Phase 3 — Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workspace on `EditorShell`: Scenes tab (master) + selected-scene center (placeholders + images) + history; scene-detail route merged.

**Architecture:** New presentational components in `src/components/workspace/` (`scenes-tab.tsx`, `scene-card.tsx`, `scene-view.tsx`, `reserve-summary.ts`) built from existing pieces (`SceneMatrix` list items, `ReserveGrid`, `PlaceholderEditor`, `SceneDetail`); the route keeps all state and composes them in `EditorShell`.

**Tech Stack:** TanStack Start/Router, React 19, Tailwind 4, shadcn/ui + hugeicons, react-resizable-panels, @tanstack/react-virtual, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-redesign-phase3-workspace-design.md`

## Global Constraints

- Prepend `C:/Users/User/project/snuff/87-studio/runtime/node` to PATH. Tools: `npx.cmd vitest run`, `node.exe node_modules/typescript/bin/tsc --noEmit -p .` (baseline errors only: editor-context-menu.tsx, bundles/index.tsx, tags/index.tsx, tag-bookmarks.ts), `npx.cmd eslint <files>`, `npx.cmd prettier --write <files>`. Never `pnpm install/add`, never any build (user's server on :3000 serves `.output`).
- Worktree agents: your worktree starts at an OLD commit — first `git reset --hard redesign/phase3-workspace` (branch exists in the shared repo) before writing code.
- shadcn components first (Tabs, ScrollArea, Slider, DropdownMenu, ContextMenu, Checkbox, Collapsible if present else simple state); hugeicons; i18n en/ko (ko typed from en); dark tokens; selection = `--primary`; Generate = `Button variant="brand"`.
- Never click an enabled Generate in browser checks (paid API).
- Style: no semicolons, single quotes, Prettier.

## Review Focus

1. Deleting the currently selected scene → center falls back to the board (no crash, `?scene` cleared).
2. `?scene=` pointing to a scene of another project / nonexistent id → board.
3. 0 scenes, 1 scene, 300+ scenes (virtualized list) in both list and cards view.
4. Reserve count edits in tab, board and select-mode bulk set all update the same `sceneCounts` state and the footer summary.
5. Placeholder edits autosave exactly as before (no lost edits when switching scenes quickly).

## Waves

- Wave 1 (parallel worktrees): Task 1, Task 2.
- Wave 2 (main checkout): Task 3.

### Task 1: ScenesTab + SceneCard + reserveSummary

**Files:** Create `src/components/workspace/{scenes-tab.tsx,scene-card.tsx,reserve-summary.ts}`, `src/components/workspace/__tests__/reserve-summary.test.ts`; i18n keys under `scene.*` as needed.

**Interfaces (produces):**
- `reserveSummary(sceneIds: number[], counts: Record<number, number>, defaultCount: number): { scenes: number; images: number }` — a scene's count is `counts[id] ?? defaultCount`; scenes counted when count > 0.
- `SceneCard({ scene, count, onCountChange, selected, onSelect, size: 'sm'|'md'|'lg', menu: ReactNode, selectMode?, checked?, onCheckedChange? })` and `SceneRow({ ...same, compact list row })`, where `scene: { id: number; name: string; packName: string; thumbnailPath: string | null; imageCount: number }`.
- `ScenesTab(props)` — props: everything `ScenePanel` currently receives for list/reserve behaviour (`scenePacks`, `projectId`, `sceneCounts`, `defaultCount`, `onDefaultCountChange`, `onSceneCountChange`, `onAddScene`, `onDeleteScene`, `onRenameScene`, `onDuplicateScene`, `sortBy`, `onSortByChange`, `searchQuery`, `onSearchQueryChange`, `selectedSceneId`, `onSelectedSceneChange`) plus `exportDialog?: (sceneIds: number[]) => ReactNode`. Read `src/components/workspace/scene-panel.tsx` and `scene-matrix.tsx` for the exact existing types and reuse them (export shared types from `scene-card.tsx`).
- View mode + size persisted in localStorage `87studio-scenes-tab:<projectId>` (SSR-safe).

- [ ] Step 1: failing test `reserve-summary.test.ts`: empty → {0,0}; counts {1:3,2:0}, ids [1,2,3], default 2 → {scenes:2, images:5}; default 0 with no counts → {0,0}.
- [ ] Step 2: run → FAIL; implement; → PASS.
- [ ] Step 3: build SceneCard/SceneRow/ScenesTab per spec "Scenes tab" (reuse existing list item / reserve card markup and menus from scene-matrix/scene-panel; bulk bar inside the tab).
- [ ] Step 4: tsc/lint/vitest; commit `feat(workspace): scenes tab with list/cards and reserve counts`.

### Task 2: SceneView + SceneBoard

**Files:** Create `src/components/workspace/scene-view.tsx`; modify `src/components/workspace/scene-detail.tsx` only as needed (size slider instead of GridSizeToggle in images header; bulk bar anchored to the center panel via `absolute`/sticky instead of viewport `fixed`).

**Interfaces (produces):**
- `SceneView(props)` — renders scene header + collapsible placeholders section (`PlaceholderEditor`) + images (`SceneDetail hidePlaceholders`). Props: union of what `SceneMatrix` passes to `PlaceholderEditor` for the selected scene and what `routes/workspace/$projectId/scenes/$sceneId.tsx` passes to `SceneDetail` (read both files; reuse their types). Collapse state key `87studio-scene-placeholders-open:<projectId>`.
- `SceneBoard({ scenes, sceneCounts, defaultCount, onSceneCountChange, onSelect, onAddScene, scenePackDialog: ReactNode })` — card grid + empty state. Use `SceneCard` from Task 1 if available; since Task 1 runs in parallel, implement the board with a local minimal card and leave `// TODO(task3): use SceneCard` — Task 3 swaps it.
- Document the final `SceneViewProps` in your report.

- [ ] Step 1: build per spec "Center"; no route changes.
- [ ] Step 2: tsc/lint/vitest; commit `feat(workspace): scene view with placeholders and images`.

### Task 3: Compose workspace route

**Files:** Modify `src/routes/workspace/$projectId/index.tsx`, `src/routes/workspace/$projectId/scenes/$sceneId.tsx` (redirect), `src/components/workspace/prompt-panel.tsx` (add `section?: 'prompt' | 'characters'` to render one part), `src/routes/generate/index.tsx` (Ctrl/Cmd+Enter), `src/lib/onboarding/steps.ts` + anchors, links to the scene route elsewhere (`grep -rn "scenes/\$sceneId\|/scenes/" src`), i18n, `.claude/CLAUDE.md` (structure + workspace description). Delete unused files listed in the spec.

- [ ] Step 1: Compose `EditorShell id="workspace"` per spec (header, 5 tabs + badges, footer summary via `reserveSummary`, center SceneView/SceneBoard, right HistoryStrip → imageDetail). Replace SceneBoard's local card with `SceneCard`.
- [ ] Step 2: Redirect route; update links; onboarding; Ctrl/Cmd+Enter for both routes (shared small hook `useGenerateShortcut(onGenerate, enabled)` in `src/components/editor-shell/`).
- [ ] Step 3: Delete dead files; tsc/lint/vitest.
- [ ] Step 4: Browser verification per spec "Verification" (dev :3100 + playwright-core in the scratchpad `pw` folder); screenshots + log in report.
- [ ] Step 5: Commit(s) `feat(workspace): workspace on EditorShell` (+ separate `fix(...)` commits for anything found in the browser).
