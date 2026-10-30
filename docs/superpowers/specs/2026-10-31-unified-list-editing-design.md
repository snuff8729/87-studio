# Unified list editing (reorder / add / delete)

Date: 2026-10-31
Status: approved by user (chat; user reviews usage only)
Branch / worktree: `feat/list-ui` at `../87-studio-lists` (from `main` 7b73ff9)

## Problem
List editing UIs are inconsistent and noisy: always-on full-width inputs, per-row ↑↓✕ buttons, a detached add input +
button, tiny chips with arrows, and "Move up/down" only via menus. The queue page's dnd-kit drag (handle) is the model.

## Shared pattern (one set of components, `src/components/common/sortable-list/` or similar)
- **Drag to reorder** with a handle `⠿` (dnd-kit, same libs as `src/routes/queue/index.tsx`; pointer + touch + keyboard
  sensors; vertical or horizontal strategy). Handle visible on row hover/focus on desktop, always visible on touch
  (<768 / coarse pointer). No ↑↓ buttons in rows.
- **Delete**: ✕ (ghost icon button) appears on row hover/focus (always visible on touch). Optional confirm hook (e.g.
  "Used by 3 fragments").
- **Inline rename** (name lists): the label is text; click → inline input; Enter/blur saves, Esc cancels; empty name
  reverts.
- **Add row** at the bottom: "＋ Add …" ghost row; click → inline input in place; Enter adds and keeps a fresh input open
  for the next one; Esc / blur on empty closes. For item lists the add row opens the existing item combobox.
- Rows compact (h-8/9, text-sm), list max width ~ 28–32rem where it's a standalone list (not full-bleed).
- Optimistic local order + serialized saves (existing `use-serial-save` pattern) so rapid drags compose.
- Accessible: handle is a button with aria-label, keyboard reorder via dnd-kit KeyboardSensor; rows focusable.

## Where it applies
1. **Name lists**: global axis values (`src/components/library/axis-editor.tsx`), local axis values (character/item local
   axes, `local-axes.tsx`), body areas (`areas-editor.tsx`). Axis name itself: inline-editable title. First value keeps the
   "Default" badge (order = default). Areas/axes delete confirms keep their usage counts.
2. **Item lists**: `src/components/parts/outfit-items-editor.tsx` (slot default outfit, scene "replace for this scene",
   preset detail) → vertical list "inner → outer" caption, row = handle · item name · small area names · (Covered badge
   when provided) · ✕; bottom row "＋ Add item" (combobox) + "Load preset" / "Save as preset" actions where enabled.
3. **Rich rows**: library fragments (`fragment-row.tsx` / `owner-detail.tsx`): drop ↑↓🗑 buttons → hover handle (left) +
   ✕ (right), drag to reorder (`reorderFragments`). Cover rules (`item-occlusion.tsx`): no handle (order meaningless),
   hover ✕, bottom "＋ Rule" row.
4. **Menu-only reorder → add drag** (keep the ⋯ "Move up/down / left/right" menu items as touch/keyboard fallback):
   scene templates dialog packs pane + scenes pane (`scene-templates/*`, server `reorderScenes`; packs: use existing pack
   reorder if any, else leave packs menu-only and report), character chip tabs (`characters-editor.tsx`, horizontal drag,
   workspace `moveCharacter` and Quick Generate local `moveItem` — implement as repeated moves or a new reorder fn).
   **Excluded**: workspace scene rail pack order (virtualized list) stays menu-only.

## Non-goals
No behaviour changes beyond the editing UI. Scene rail, queue unchanged.

## Verification
tsc/eslint/vitest; existing smokes `scripts/smoke/parts.mjs`, `templates.mjs`, `workspace.mjs` (update selectors that
targeted the removed ↑↓ buttons — prefer adding drag + keyboard-reorder checks), screenshots 1440 + 390.
