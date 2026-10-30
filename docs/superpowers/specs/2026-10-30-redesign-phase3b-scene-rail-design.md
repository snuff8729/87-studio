# Redesign Phase 3b — Workspace Scene Rail (remove left/center duplication)

Date: 2026-10-30
Status: approved by user (brainstorm `workspace-v3.html` option 1-B, plus compact-mode mitigation for width)

## Problem

Phase 3 put the scene list in the left "Scenes" tab and a scene board in the center: the same scenes appeared twice, and the Scenes tab competed with the Prompt tab for the same slot.

## Decided UX

**Left panel** = common template only, identical to Quick Generate: tabs **Prompt · Chars · Refs · Params** (the Scenes tab is removed). Footer unchanged ("N scenes · M images" + Generate M).

**Center** = scene area, two modes:

1. **Scene mode (default)**: `[SceneRail | SceneView]`.
   - **SceneRail** (inside the center, left edge, `bg-sidebar`, border-r):
     - Header: "Scenes {count}", ▦ board toggle, ＋ add scene (`data-onboarding="add-scene-btn"`), overflow menu (sort, select mode, default ×N stepper, scene templates).
     - Search input (filters by name, auto-expands groups with matches).
     - Filter chips: **All · Reserved {n} · No images {n}**.
     - Pack groups (collapsible header "▾ Pack name · count", collapse state persisted), rows: 28×36 thumb, name (truncate), reserve stepper (compact; muted at 0, `--primary` tint > 0), row menu (rename / duplicate / delete) on hover "…" and right-click. Selected row `--primary` soft background. `data-onboarding="scene-item"` on rows.
     - Virtualized (reuse ScenesTab's virtual list).
     - Select mode: checkboxes + bulk bar at the rail bottom (set count / export / delete / clear).
     - **Two widths**: expanded 216px and **compact 56px** (thumbnail + count badge, name in tooltip; header shows only ▦ / ＋ / expand toggle; search and filters hidden). A toggle button in the rail header switches widths. **Auto-compact** when the center panel is narrower than 720px, unless the user explicitly expanded it in this session; explicit choice persisted at `87studio-scene-rail:<projectId>` (`'expanded' | 'compact' | null`).
     - ↑/↓ moves selection when the rail has focus (replace navigation).
   - **SceneView**: unchanged from phase 3 (header with "← Scenes" removed — the rail is always there; keep Compare / Tournament / Save as template; placeholders section; images).
2. **Board mode** (▦ toggled on, persisted in search param `view=board`): rail hidden; center shows the existing SceneBoard (card grid with steppers), now grouped by pack with group headers, with search + filter chips + card size slider in its toolbar. Clicking a card selects the scene and returns to scene mode. Toolbar has "Close board" (×).

**Scene palette (Ctrl/Cmd+K)** on the workspace route: shadcn `Command` dialog listing all scenes (name + pack + reserve count), fuzzy search, Enter selects (scene mode). Works everywhere on the page, including while focus is in a CodeMirror prompt editor (verify CodeMirror has no conflicting Ctrl+K binding in our setup), except when another dialog is open.

**Empty project** (0 scenes): center shows the empty state (add scene pack / add scene) with the rail hidden.

**No selection** in scene mode (e.g. after deleting the selected scene, or first visit): auto-select the first scene in rail order (replace navigation). `?scene=` invalid → first scene.

**Mobile (<768)**: rail hidden. The Result pane gets a top bar "Scenes ▾ {current scene}" button that opens a bottom `Sheet` with the full rail (search, filters, groups, steppers); choosing a scene closes the sheet. Board mode reachable from the sheet header.

**Onboarding**: step that targeted `scenes-tab` now targets the rail header (`data-onboarding="scene-rail"`); `scene-item`, `add-scene-btn` stay on rail. Verify all 9 steps.

## Architecture

```
src/components/workspace/
  scene-rail.tsx            SceneRail (expanded/compact, toolbar, search, filters, groups, select mode)
  scene-rail-prefs.ts       pure: parse/serialize rail prefs; shouldCompact(centerWidth, userPref)
  scene-filters.ts          pure: filterScenes(scenes, { query, filter }, counts, defaultCount)
  scene-palette.tsx         Ctrl/Cmd+K Command dialog
  __tests__/scene-rail-prefs.test.ts, __tests__/scene-filters.test.ts
src/components/ui/command.tsx   shadcn (cmdk) — install with bundled npm, hand-port if CLI fails
```

`scenes-tab.tsx` is refactored into / replaced by `scene-rail.tsx` (reuse its virtual list, menus, select mode, prefs code); delete what's unused. `SceneBoard` gains pack grouping + search/filter toolbar using `filterScenes`.

## Verification

vitest (new pure modules), tsc baseline-only, lint no new errors in touched files, `npm run build`, headless Chrome on dev :3100 at 1440/1024/390 with project 1 plus a **mocked scene list of 128 scenes in 6 packs** (intercept the workspace data response): rail expanded/compact toggle + auto-compact at narrow center + persistence, search/filter chips, group collapse, virtual scroll, ↑/↓, Ctrl+K palette select, board toggle hides rail and returns on card click, mobile scenes sheet, onboarding steps, no console errors. Never click an enabled Generate; abort all write requests in browser checks.
