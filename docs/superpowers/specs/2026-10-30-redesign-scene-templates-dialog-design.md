# Redesign — Scene Templates Dialog

Date: 2026-10-30
Status: approved by user (brainstorm `templates-1.html` option A; user edits long prompts a lot)
Branch: `redesign/scene-templates` (from main)
File: `src/components/workspace/scene-pack-dialog.tsx` (global scene packs; opened from the workspace header and the rail ⋯ "Scene templates"). Split it into focused components under `src/components/workspace/scene-templates/` if that helps.

## Layout (desktop ≥768)

- Dialog large: ~`w-[min(1200px,94vw)] h-[88vh]`. Header row: title "Scene templates", action "Import SD Studio" (existing import), close ✕. No description paragraph.
- Three panes (resizable with react-resizable-panels like EditorShell; widths persisted in localStorage `87studio-templates-layout`):
  1. **Packs** (~200px, `bg-sidebar`-like): header "Packs {n}" + ＋ (popover: name, optional description, Create). Rows: name + scene count; selected = `--primary` soft. Row ⋯ / right-click: Rename, Edit description, Duplicate (if cheap), Delete (confirm; global templates only — project snapshots unaffected; say so).
  2. **Scenes** (~240px): search input, header "Scenes {n}" + ＋ (popover: name, "copy values from selected scene" checkbox, Enter adds and selects it — same pattern as the workspace add-scene popover). Rows: checkbox (for apply) + name + small key count; selected row highlighted; ↑/↓ moves selection when the list has focus; row ⋯ / right-click: Rename, Duplicate, Move up/down (sort_order), Delete (confirm). Selection of the edited scene is separate from apply checkboxes.
  3. **Editor** (flex): scene name (inline rename on click), ⋯ (duplicate/delete). For each placeholder key: label row (key name, rename key, remove key, `PromptEditorHeader` actions: tag gallery + expand) and a **CodeMirror prompt editor** (lazy, same as workspace prompt inputs: Danbooru autocomplete, bundle highlight, weight highlight) that auto-grows with content (min 2 lines, max ~12 lines then scrolls). "＋ Add key" (popover: key name; suggest keys used by other scenes in the pack and `@{slot:…}` names from the current project's prompts). Debounced autosave (~800ms) with flush on scene switch / dialog close; small "Saved" state indicator.
- **Footer bar** (fixed): "{pack} · {checked}/{total} selected", Select all / none toggle, primary button "Apply {n} scenes to project" (disabled at 0; default all checked when a pack is opened). Applying only the checked scenes requires extending the assign server fn with optional `sceneIds` (default = all, behaviour unchanged when omitted). After apply: toast + close dialog (current behaviour for applying the whole pack — keep whatever it does now with the new scenes, e.g. select first new scene).
- Empty states: no packs (Create pack / Import), pack with no scenes (Add scene), no scene selected.

## Mobile (<768)

Full-screen dialog with a stack: Packs list → Scenes list (back) → Editor (back). Footer apply bar visible on the Scenes step. Header shows the current step title + back button.

## Constraints

- Keep all existing capabilities (pack CRUD, scene CRUD, key editing, import, apply). Remove the inline "add" inputs and the accordion cards.
- shadcn first (Popover, ContextMenu/DropdownMenu, Checkbox, Command if needed), hugeicons, i18n en + ko, dark tokens; `variant="default"` for Apply (brand gradient stays reserved for Generate). Dialog must not trigger Ctrl/Cmd+Enter Generate or Ctrl/Cmd+K palette while open (existing dialog guard should cover it — verify).
- Unit tests only for new pure logic (e.g. key suggestions, sort-order moves). Browser: extend `scripts/smoke/workspace.mjs` (mocked, writes aborted) for the dialog at 1440 and 390; then real writes against a mock-mode dev server with throwaway `STUDIO_DATA_DIR` (see CLAUDE.md) for: create pack, add/rename/duplicate/move/delete scene, add/rename/remove key, edit value (persisted after reopen), apply selected scenes (only those appear in the project).
- Update `.claude/CLAUDE.md`.
