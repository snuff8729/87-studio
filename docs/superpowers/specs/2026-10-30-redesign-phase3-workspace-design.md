# Redesign Phase 3 — Workspace on EditorShell

Date: 2026-10-30
Status: approved layout (brainstorm mockup `layout-workspace.html` option B + card size control); details decided by Claude under the user's "proceed without dev questions" instruction.

## Goal

Rebuild `/workspace/$projectId` on `EditorShell` (phase 2) with the B layout: the left **Scenes** tab is the master list (with reserve counts), the center always shows the **selected scene** (placeholders + its images), the right is project history. Merge the separate scene-detail route into it.

## Decided UX

**Header (`EditorHeader`)**: title = project thumbnail (if any) + project name + save status text (saving/saved/error, as today in `WorkspaceHeader`). Actions: Scene packs (existing `ScenePackDialog` trigger), Import (SD Studio `ImportDialog`), Export (`DownloadDialog`), then shell panel toggles.

**Left tabs** (order): **Scenes** (badge = scene count) · **Prompt** (general + negative prompt) · **Chars** (badge = characters count; character prompts/negatives + add/remove, as in `PromptPanel` today) · **Refs** (badge = enabled refs of the active mode, like Quick Generate) · **Params** (`ParameterForm`). Default tab: Scenes.

**Footer (fixed)**: compact `GenerationProgress`; one row: "N scenes · M images" summary (scenes with count > 0, total images) + brand Generate button labelled "Generate M" (disabled when M = 0), same `handleGenerate` as today. The per-scene default count stepper moves to the Scenes tab toolbar ("Default ×N").

**Scenes tab**:
- Toolbar: scene-pack filter (All / each pack), search toggle, sort menu (existing sort options), view toggle **List ↔ Cards**, size slider (cards only; 3 steps sm/md/lg mapped to min card width 96/128/168px), "Default ×N" stepper, select-mode toggle, add-scene (+).
- List view: rows grouped by scene pack (collapsible group header with pack name + count). Row: 36×48 thumbnail, name, image count, reserve stepper (− n +; empty/0 muted, >0 tinted `--primary`). Click row → select scene. Row menu (… / right-click): rename, duplicate, delete (confirm).
- Cards view: responsive grid of thumbnail cards (name, image count, reserve stepper), same menu.
- Select mode: checkboxes; bulk bar inside the tab bottom (above footer) — set count for selected, export selected, clear — replacing the old viewport-fixed bar.
- Selected scene: `--primary` ring/background; keyboard ↑/↓ moves selection when the list has focus.
- Virtualize the list when > 100 scenes (existing VirtualSceneList approach).
- Onboarding anchors: `data-onboarding="add-scene-btn"` on +, `data-onboarding="scene-item"` on rows/cards.

**Center (selected scene, `SceneView`)**:
- Scene header row: pack name / scene name (inline rename), image count, actions: Compare, Tournament, Convert to template, reset/set thumbnail (existing scene-detail actions).
- **Placeholders section** (collapsible, default open, remembered per project in localStorage): `PlaceholderEditor` for general placeholders and per-character overrides (existing component, `data-onboarding="placeholder-editor"`). Max height 45% of center with its own scroll when open.
- **Images section**: `SceneDetail` image grid (hidePlaceholders) with its sort, select mode, bulk actions; size control = slider (sm/md/lg) in the section header (replaces GridSizeToggle there). Bulk action bar anchored to the bottom of the center panel (not viewport).
- No scene selected (or project has no scenes): **Scene board** — card grid of all scenes (same cards as Scenes tab cards view, larger) with reserve steppers; empty state with "Add scene pack" / "Add scene" buttons.
- Selection is the `?scene=<id>` search param (existing). Invalid id → board.

**Right**: `HistoryStrip` (from phase 2) over project images; click → opens existing image detail overlay (`imageDetail` search param). Footer link: "View all in gallery" (gallery filtered by project).

**Route merge**: `/workspace/$projectId/scenes/$sceneId` becomes a redirect to `/workspace/$projectId?scene=$sceneId` (keep the file as a thin `beforeLoad` redirect so old links work). Any links to the scene route elsewhere (gallery, dashboard, onboarding) point to the search-param form.

**Shortcut**: `Ctrl/Cmd+Enter` triggers Generate on both Quick Generate and Workspace (works even while typing in prompt editors; ignored when Generate is disabled or a dialog is open). This also addresses "left panel collapsed hides Generate".

**Mobile**: EditorShell pane switcher (Edit = left tabs, Result = SceneView, History). Selecting a scene in the Scenes tab switches to Result.

**Onboarding**: steps that targeted `scene-edit-tab` now target the Scenes tab trigger (`data-onboarding="scenes-tab"`) / `scene-item`; `generation-controls` anchor moves to the footer Generate row; verify all 9 steps resolve.

## Architecture

```
src/components/workspace/
  scenes-tab.tsx          ScenesTab (list/cards, toolbar, select mode, bulk bar)
  scene-card.tsx          SceneCard + SceneRow (shared by tab and board)
  scene-view.tsx          SceneView (header + placeholders section + images) and SceneBoard
  reserve-summary.ts      pure: reserveSummary(scenes, counts, defaultCount) → { scenes, images }
  __tests__/reserve-summary.test.ts
src/routes/workspace/$projectId/index.tsx   state + composition on EditorShell
src/routes/workspace/$projectId/scenes/$sceneId.tsx  redirect only
```

Removed when unused afterwards: `workspace-layout.tsx`, `bottom-toolbar.tsx`, `workspace-header.tsx`, `scene-panel.tsx`, `scene-matrix.tsx`, `scene-placeholder-panel.tsx`, `history-panel.tsx` (keep any still imported elsewhere).

## Verification

vitest (incl. reserve-summary), tsc baseline-only, lint no new errors in touched files, `npm run build` (after stopping the user's :3000 server), headless Chrome on dev :3100 at 1440/900/390 with a real project (DB has project 1): tabs + badges, scene select ↔ `?scene=`, reserve steppers update footer summary, list/cards + size, placeholders collapse persists, images section renders, board when no scene, old scene URL redirects, Ctrl+Enter wiring (do NOT actually trigger generation — assert via a spy/route interception that the generate server call would be made, or verify the handler is reached with the button disabled), mobile pane switching, no console errors. Never click an enabled Generate.
