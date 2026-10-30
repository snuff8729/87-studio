# Character Parts Library (characters, outfit items, presets, axes)

Date: 2026-10-30
Status: approved by user (brainstorm in chat; user reviews usage only)
Branch / worktree: `feat/character-parts` at `../87-studio-parts` (from `main`)

## Goal

A character's description is split into **fragments** with **conditions**, so one well-written character + outfit
library assembles the right prompt for every scene (front/side/back, face-only drops the outfit, jacket zipped/open…),
across projects. Scenes only declare **context** (axis values); matching fragments are included automatically.

## Concepts (user-facing)

- **Axis**: a dimension with ordered values. **The first value is the default.**
  - **Global axes** (shared by everything, always shown in scenes). Seeded: `View: Front · Side · Back`,
    `Framing: Full body · Upper body · Face` (user-editable names/values; can add new global axes, e.g. Pose).
  - **Local axes** belong to one library character or one outfit item (e.g. padding `Zipper: Closed · Open`,
    character `Hair: Ponytail · Down`). Only shown where that character/item is used.
- **Library character**: name, description, fragments, local axes.
- **Outfit item**: name, description, **item condition** (applies to all its fragments), fragments, local axes.
- **Preset (코디)**: named ordered list of outfit items.
- **Fragment**: prompt text (supports `@{bundle:…}`, `@{slot:…}`) + condition `{axisId: [allowedValueIds]}`.
  Empty condition = always. A fragment may only reference global axes and its owner's local axes.
- **Project character slot** (existing `characters` row) can link a library character (live link), have a default
  outfit (ordered item list), and default values for local axes. **Detach** = copy the linked character and the
  slot's outfit items into project-only copies (hidden from the global library list), relink everything in the project.
- **Scene**: values for global axes. **Per character in a scene**: override any axis (global or local) and optionally
  replace the outfit for this scene only.
- **Global scene template** (`scenes`): values for global axes, copied into project scenes on apply (snapshot).

## Composition rules (pure module `src/lib/character-parts.ts`, unit-tested)

1. Effective value per axis = axis default (first value) ← slot default (local axes only) ← scene `axis_values`
   (global axes) ← character override `axis_values`. Unknown axis ids / value ids are ignored at every layer.
2. Condition matching: a fragment (or item) passes when, for every axis in its condition that still exists, the effective
   value is in the allowed list. Allowed ids that no longer exist are dropped; if an axis's list becomes empty that
   axis is ignored (treated as no condition).
3. Item passes its item condition → its fragments are evaluated; otherwise the whole item is skipped.
4. `char` = passing character fragments in order; `outfit` = items in outfit order × passing fragments in order.
   Fragment text is trimmed and trailing/leading commas stripped; empty ones skipped; joined with `, `.
5. Placement in the slot's free prompt (`char_prompt`): `@{char}` / `@{outfit}` tokens are replaced in place;
   a part whose token is absent is prepended, final order `char, outfit, free prompt`; empty pieces never leave
   dangling commas. A slot with no library character and no outfit: tokens become `''`, nothing prepended
   (= today's behaviour exactly).
6. After placement the existing pipeline runs unchanged (`@{bundle:…}` then `@{slot:…}`), so fragments can use both.
   `char_negative`, general prompt, negative prompt: unchanged. Quick Generate: unchanged.
7. Resolved prompts are stored as today (`resolved_prompts`), so existing images stay reproducible.

Exports (names fixed, other tasks code against them):
```ts
type AxisValues = Record<string, number>            // axisId → valueId (JSON keys are strings)
type Condition = Record<string, Array<number>>       // axisId → allowed valueIds
interface PartsAxis { id: number; name: string; ownerCharacterId: number | null; ownerItemId: number | null; values: Array<{ id: number; name: string }> }
interface PartsFragment { id: number; text: string; conditions: Condition }
interface PartsCharacter { id: number; fragments: Array<PartsFragment> }
interface PartsItem { id: number; conditions: Condition; fragments: Array<PartsFragment> }
effectiveAxisValues(axes: Array<PartsAxis>, layers: Array<AxisValues | null | undefined>): AxisValues
matchesCondition(cond: Condition, values: AxisValues, axes: Array<PartsAxis>): boolean
composeParts(args: { axes; character: PartsCharacter | null; items: Array<PartsItem>; values: AxisValues }): { char: string; outfit: string }
applyParts(freePrompt: string, parts: { char: string; outfit: string }): string
relevantAxes(axes, characterId: number | null, itemIds: Array<number>): Array<PartsAxis>  // global + those locals
```

## Data (drizzle migration `0015_character_parts`; renumber at merge if another 0015 lands first)

New tables:
- `library_characters`: id, name NOT NULL, description, project_id (FK projects CASCADE, NULL = global), source_id
  (int, detached-from), thumbnail_image_id, sort_order, created_at, updated_at.
- `outfit_items`: same columns + `conditions` TEXT DEFAULT '{}'.
- `outfit_presets`: id, name NOT NULL, description, item_ids TEXT DEFAULT '[]', sort_order, timestamps.
- `library_axes`: id, name NOT NULL, owner_character_id (FK library_characters CASCADE, null), owner_item_id
  (FK outfit_items CASCADE, null), sort_order. Global iff both owners null.
- `library_axis_values`: id, axis_id (FK library_axes CASCADE), name NOT NULL, sort_order.
- `fragments`: id, character_id (FK library_characters CASCADE, null), item_id (FK outfit_items CASCADE, null),
  text DEFAULT '', conditions DEFAULT '{}', sort_order, timestamps.

New columns:
- `characters`: `library_character_id` (FK library_characters SET NULL), `outfit_item_ids` TEXT DEFAULT '[]',
  `axis_values` TEXT DEFAULT '{}' (local-axis defaults).
- `project_scenes.axis_values` TEXT DEFAULT '{}'; `scenes.axis_values` TEXT DEFAULT '{}'.
- `character_scene_overrides`: `axis_values` TEXT DEFAULT '{}', `outfit_item_ids` TEXT NULL (NULL = slot default).

Seed in the migration: the two global axes and their values in the order above.

Cleanup: deleting an axis value / axis removes those ids from fragment & item conditions (server side). Missing outfit
item ids in JSON lists are ignored at read time and dropped on the next save.

Copy points: everywhere project-scene placeholders/overrides are copied, also copy `axis_values` /
`outfit_item_ids` (assignScenePack ← `scenes.axis_values`, addProjectScene `copyFromSceneId`, duplicate scene,
convert-to-template → `scenes.axis_values`, scene templates duplicate scene). Project delete cascades project-only
library rows.

## Server functions (`src/server/functions/library.ts` unless noted)

- `getLibrary({ projectId? })` → `{ axes: PartsAxis[] (global + all local), characters, items, presets }` with
  fragments, item conditions; project-only rows included only for that `projectId`, each row has `projectId`.
  Query key `['library', projectId ?? null]`; mutations invalidate `['library']`.
- Characters/items: `createLibraryCharacter`, `updateLibraryCharacter({id,name?,description?})`,
  `deleteLibraryCharacter`, `duplicateLibraryCharacter` (copies fragments + local axes, remaps ids) and the same
  four for items (+ `conditions` in update). `getLibraryUsage({ kind: 'character' | 'item', id })` → `{ slots, projects }`.
- Fragments: `createFragment({ characterId? , itemId?, text?, conditions? })`, `updateFragment({id,text?,conditions?})`,
  `deleteFragment`, `reorderFragments({ ids })`.
- Axes: `createAxis({ name, ownerCharacterId?, ownerItemId?, values: string[] })`, `renameAxis`, `deleteAxis`,
  `reorderAxes`, `createAxisValue`, `renameAxisValue`, `deleteAxisValue`, `reorderAxisValues`.
- Presets: `createPreset`, `updatePreset({id,name?,itemIds?})`, `deletePreset`.
- `detachCharacterSlot({ characterSlotId })`: copy linked character (if global) and every global item used by the slot
  (default outfit + this project's override lists for that slot) into project-only copies (fragments, local axes,
  conditions remapped), relink slot/overrides, remap local-axis ids in slot `axis_values` and override `axis_values`.
  One transaction.
- `characters.ts` `updateCharacter` also accepts `libraryCharacterId` (nullable), `outfitItemIds`, `axisValues`.
- `project-scenes.ts`: `updateSceneParts({ sceneId, axisValues })`, `bulkSetSceneAxisValues({ sceneIds, axisValues })`
  (merge: given keys set, others untouched), `updateCharacterOverrideParts({ sceneId, characterId, axisValues?,
  outfitItemIds? /* null = reset to default */ })` (upsert override row).
- `scenes.ts` (global): scene update accepts `axisValues`.
- Workspace data (`workspace.ts`) returns the new slot/scene/override fields; `previewPrompts` already exists and is used
  for the scene preview.

## UI

Shared components (`src/components/parts/`):
- `AxisSegmented` — one axis as a segmented control; optional "inherit" first option with a label (e.g. "Scene",
  "Default"); default value marked; compact on mobile (wraps).
- `OutfitItemsEditor` — ordered chips (× remove, ↑/↓ or drag reorder), ＋ item combobox (global + project-only group),
  "Load preset" menu (replaces list), "Save as preset" (name popover).

### Library page `/characters` (sidebar Library group, "Characters" / "캐릭터")
- Tabs Characters · Outfits · Presets · Axes (`?tab=&id=`), `MasterDetail` per tab (`87studio-master-detail:characters-<tab>`);
  list = search + ＋ New + rows (name, fragment count / item count); ⋯/right-click: Rename, Duplicate, Delete (confirm
  with usage count "used by N characters in M projects").
- Character / item detail: name (inline rename), description, **local axes** row (chips "Zipper: Closed · Open", click
  → edit values/rename/delete, ＋ Axis popover with name + comma values), item only: **item condition** chips
  ("Only when Framing: Upper body, Full body"), **fragments** list: each row = lazy prompt editor (1 line, auto-grow),
  condition chips (popover: per relevant axis a checkbox list; none checked = no condition; chip label
  "View: Front, Side"), ↑/↓, delete; ＋ Add fragment. Autosave 800 ms, flushed on switch/leave.
  **Preview** box: `AxisSegmented` per relevant axis (start at defaults) → composed text.
  Project-only rows (opened via link from a workspace) show a "Project only: <project>" badge.
- Presets: name + `OutfitItemsEditor` (without preset menu).
- Axes: global axes list; each axis: rename, values as chips (add / rename / delete / reorder, first = "default" badge),
  reorder axes, delete with confirm.

### Workspace Chars tab (`CharactersEditor` gets an optional `parts` render slot above the prompt; Quick Generate unchanged)
- "Library character" combobox (None / global / project-only), status badge Linked / Project only, Detach (confirm:
  "Make project-only copies of this character and its outfit; library edits will no longer affect this project"),
  "Edit in library" link → `/characters?tab=…&id=…`.
- "Default outfit" `OutfitItemsEditor`.
- Local axes of the linked character + default outfit items: `AxisSegmented` each (slot defaults).
- Prompt editor: `@{char}` / `@{outfit}` highlighted (like slots) + autocomplete; hint under the prompt when linked:
  "Character/outfit description is added before this prompt. Write @{char} / @{outfit} to place it."
- Saves via the existing debounced character save + pending-saves.

### Scene view (workspace) — section "Parts" above placeholders
- Shown when at least one slot has a library character or outfit items.
- Scene row: `AxisSegmented` per global axis.
- Per character (collapsible row, summary "follows scene · default outfit" / "View: Back · Zipper: Open · outfit
  replaced"): global axes with inherit option "Scene", local axes (character + effective outfit items) with inherit
  "Default", outfit: "Default outfit" vs "Replace for this scene" → `OutfitItemsEditor`, "Reset" button.
- "Final prompt preview" (collapsible, per character + general) via `previewPrompts`, refreshed after saves.
- Debounced save 800 ms, registered with pending-saves, flushed on scene switch / Generate.
- Selection mode ⋯ → "Set view/framing…" dialog: per global axis select (Keep / value) → `bulkSetSceneAxisValues`.
- Scene templates dialog editor: `AxisSegmented` row per global axis above keys, same autosave/flush as keys.

i18n namespaces: `parts.*` (shared), `library.*`, `charParts.*`, `sceneParts.*` in both `en.ts` and `ko.ts`.

## Out of scope
Item occlusion rules; gallery filter by axis; parts in Quick Generate; parts in negative prompts.

## Tasks
- **A (first)**: migration + schema + pure module & tests + server functions + `synthesizePrompts` integration + copy
  points + workspace data + shared `parts` components + `@{char}`/`@{outfit}` editor highlight/autocomplete + i18n `parts`.
- **B / C / D in parallel after A**: B library page + nav; C Chars tab; D scene view section, bulk dialog, templates editor.
- **Final**: one whole-branch review, smoke run (NAI_MOCK demo server), commit, merge to main.
