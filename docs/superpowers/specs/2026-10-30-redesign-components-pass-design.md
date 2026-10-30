# Redesign — Component Pass 1

Date: 2026-10-30
Status: approved by user (brainstorm `components-1.html`: 1-A, 2-A, 3-A, 4-A; direct fixes agreed in chat)
Branch: `redesign/components-pass` (from main 3bc239b)

## Direct fixes

1. **Expanded prompt dialog fills its height.** `ExpandedEditorDialog` (`src/components/prompt-editor/expanded-editor-dialog.tsx`): the CodeMirror editor must occupy the whole dialog body regardless of text length (no shrinking to content); clicking anywhere in the empty area focuses the editor at end. Applies to every caller (Quick Generate prompt/negative/characters, workspace prompt/characters, scene pack dialog, bundles). Verify in the browser that `.cm-editor` height ≈ body height with a 1-line prompt, desktop and mobile.
2. **Tag-bookmark (tag gallery) button on every prompt input.** Today only workspace general/negative (`PromptEditorHeader onOpenTagGallery`) and a few dialogs have it. Add it — same `PromptEditorHeader` + `TagGalleryDialog` behaviour as workspace — to: Quick Generate prompt + negative, Quick Generate character prompt + negative, workspace character prompt + negative, placeholder inputs where a prompt editor header exists, and the `ExpandedEditorDialog` header. Reuse; don't duplicate dialog wiring per call site if a small shared hook/component fits.
3. **Rail width: manual only.** Remove auto-compact entirely (the "Compact automatically when narrow" ⋯ item, `RAIL_AUTO_COMPACT_BELOW`, the width rule). The rail header toggle switches 216 ↔ 56px; the choice persists at `87studio-scene-rail:<projectId>`; default expanded. Update `scene-rail-prefs.ts` + its tests, i18n, `.claude/CLAUDE.md`.
4. **Prompt preview auto-scroll.** In `placeholder-editor.tsx`, opening Prompt Preview scrolls its section into view (smooth, `block: 'nearest'`-style so it ends fully visible) once its content has rendered.
5. **Thumbnail selection in scene mode too.** Scene selection state is lifted to the route and shared by rail and board (switching modes keeps the selection). When select mode is on in scene mode, the center (where SceneView is) shows the **selection grid**: the board's card grid (pack groups, card size slider, respecting the rail's search + filter) with checkboxes; clicking a card toggles it. The rail stays visible with its checkboxes in sync. Leaving select mode returns to the selected scene's SceneView. Board mode select works the same way on the board grid.

## Decided designs

### 1-A Characters: chip tabs (Quick Generate Chars tab and workspace Chars tab — one shared component)

- Header row: "Characters {n}".
- Chip row (wraps): one chip per character (name, selected = `--primary` soft bg + border like other selections; no per-character colors), then a "＋ Add" chip, and a ⋯ menu for the selected character: Rename, Duplicate, Move left, Move right, Delete (confirm). Add creates "Character N" immediately and selects it (no popover asking for a name); its name field gets focus.
- Below: the selected character's editor — Name input; "Prompt" `PromptEditorHeader` (tag gallery + expand) + editor (comfortable min height ~ 8 lines); "Negative" collapsible, collapsed by default when empty, open when it has content (header shows "(empty)" when collapsed and empty).
- Empty state (0 characters): short hint + "Add character" button.
- Workspace: keeps existing debounced save + pending-saves flush registration, and the safety logic around deletion/just-added ids. Move left/right swaps `slot_index` (add a server fn if missing; respect UNIQUE(project_id, slot_index) by using a temporary index inside one transaction). Duplicate = create + copy prompt/negative (+ character_scene_overrides copied if a server-side helper is simple; otherwise prompt/negative only — note in report).
- Quick Generate: local state; reorder/duplicate implemented on the local array; persistence unchanged.

### 2-A Add scene: ＋ popover

- Rail header ＋ (and board toolbar ＋, empty-state "Add scene") opens a shadcn `Popover` anchored to the button: title "New scene", name input (autofocus), Pack select (project scene packs; default = pack of the currently selected scene, else first; include "New pack…" only if creating a pack is already supported cheaply — otherwise omit), checkbox "Copy values from current scene ({name})" (default on when a scene is selected), Cancel / Add (Enter submits, Esc closes). Duplicate name in pack → inline error, no toast spam.
- After add: new scene selected (`?scene=`, push), rail scrolls to it, popover closes. The old inline input row in the list is removed.
- Mobile: same popover from the scenes sheet header.
- Keep `data-onboarding="add-scene-btn"` on the ＋ button; onboarding step for adding a scene must still advance.

### 3-A Filter inside search

- The rail search input gets a trailing filter button. Filter = All: icon-only, muted. Filter active: label chip in `--primary` soft style ("Reserved" / "No images"). Click → small dropdown menu: All {n} · Reserved {n} · No images {n} (checked item). Remove the chip row. Board toolbar uses the same search+filter component. Compact rail: hidden (as today).

### 4-A Selection header

- While select mode is on, the rail header is replaced by a selection header (`--primary` soft background): ✕ (exit), "{n} selected", select-all toggle, then icon buttons: **Set count** (popover: stepper/number + Apply), **Export**, and ⋯ (Save as template, Reset count to default/0 — whichever the current bulk "reset" does, Delete with confirm). Always one line at 216px; nothing wraps. Disabled when n = 0.
- The old bottom bulk bar of the rail is removed. Board mode / selection grid toolbar shows the same selection header component in place of its toolbar.
- Compact rail in select mode: header shows ✕ and count badge only; actions available from the selection grid header in the center.

## Constraints

- shadcn first (Popover, DropdownMenu, Collapsible exist), hugeicons, i18n en + ko, dark tokens, no new deps.
- Lean process: pure-logic unit tests only (rail prefs update; any new pure helper e.g. slot swap / selection helpers). Browser check via `scripts/smoke/workspace.mjs` (extend it for: add-scene popover, filter dropdown, selection header no-wrap at 216px, selection grid in scene mode, expanded dialog height) plus Quick Generate chars at desktop 1440 and mobile 390. Never click an enabled Generate; abort write requests in browser checks (mock responses where a flow needs them).
- Update `.claude/CLAUDE.md` for changed behaviour.
