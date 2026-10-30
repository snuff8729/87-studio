# Character Parts: nested areas + fragment areas, outfit variables, preset images

Date: 2026-10-31
Status: approved by user (chat; user reviews usage only)
Builds on: `2026-10-30-character-parts-design.md`, `2026-10-31-parts-occlusion-and-gallery-axes-design.md`,
`2026-10-31-unified-list-editing-design.md` (use its shared list components for all new list UIs)

## 1. Nested body areas + fragment-level areas (partial occlusion)

- `library_areas.parent_id` (nullable, FK library_areas SET NULL). **One level only**: an area with children cannot get a
  parent; a child cannot have children. Seed (only if an area named "Top" exists and the names are free): Neck, Chest,
  Arms with parent Top.
- Covering an area covers its children. Covering a child does not cover the parent.
- `fragments.area_ids` TEXT DEFAULT '[]' (outfit item fragments only; empty = inherit the item's areas).
- Occlusion per fragment: a fragment's effective areas = own areas or else the item's areas. A fragment is hidden when it
  has ≥1 effective area and all of them are covered (after expanding covered parents to children) by matching cover rules
  of items later in the outfit that pass their item condition. Fragments without effective areas are never hidden.
- Item fully hidden = it passes its item condition but all of its condition-matching fragments are hidden (an item with no
  matching fragments is simply empty, not "hidden"). Partially hidden = some hidden. Hidden/partially hidden items still
  cover others (unchanged).
- Pure API (`src/lib/character-parts.ts`): `visibleItems` → per item `{ itemId, hiddenFragmentIds, fully: boolean,
  coveredBy }`; `composeParts` keeps `hiddenItemIds` (fully hidden) and adds `partial: [{ itemId, fragmentIds, coveredBy }]`;
  `contributingItemIds` = items with ≥1 output fragment (unchanged meaning). Unit tests for parent expansion, child-only
  cover, fragment inherit vs own areas, full vs partial.
- UI: Body areas list shows children indented under their parent (drag reorders within the same parent; row menu
  "Set parent ▸ None / <top-level areas>"). Fragment rows of outfit items get an optional "Areas" chip button (popover with
  grouped area chips; empty = "inherits item"). Area pickers everywhere group children under parents. Scene Parts:
  "Partly covered" badge with tooltip "<fragment text> — covered by <item>" lines; fully hidden keeps "Covered".
- Area delete: children become top-level (parent SET NULL); ids removed from items, fragments, rules (existing cleanup
  extended to fragments.area_ids).

## 2. Outfit item variables (colors etc.)

- `outfit_items.variables` TEXT DEFAULT '[]': `[{ name, default }]`, names unique per item (trimmed, case-sensitive).
  Fragment text token `@{var:<name>}` (item fragments only; in a character fragment it is stripped).
- Outfit lists become **entries**: `[{ id: number, vars?: Record<string, string> }]` stored in the existing columns
  `characters.outfit_item_ids`, `character_scene_overrides.outfit_item_ids`, `outfit_presets.item_ids`. Parsers accept the
  old `number[]` form too (tolerant read; new writes use entries). Server functions keep accepting `number[]` and also
  accept entries.
- Value resolution per entry: entry `vars[name]` if non-empty, else item default; unknown var → ''. Substitution happens
  inside composition before bundles/slots (so values may contain `@{bundle:…}`).
- UI: item detail "Variables" list (name + default, shared list component, rename keeps fragment tokens in sync by
  rewriting `@{var:old}` → `@{var:new}` in that item's fragments). Fragment editor: `@{var:…}` highlighting + autocomplete
  with the item's variable names; unknown var warned. `OutfitItemsEditor` rows show one small input per variable
  (placeholder = default; danbooru autocomplete if cheap, else plain input) — in slot default outfit, scene "replace for
  this scene", and preset detail. Loading a preset copies its entries (with vars). "Save as preset" saves entries.
- Copy/detach/duplicate keep variables and entry values (remap item ids only).

## 3. Preset ↔ images

- Image link kind `'preset'` in `image_library_links`. At image save, for each parts character: its effective outfit
  entries (scene override or slot default, before occlusion) are compared to every preset (global + that project's):
  match when the item id sequence is identical (same order) and every resolved variable value is identical (resolve
  defaults on both sides). Matching presets are linked.
- `outfit_presets.thumbnail_image_id` (new column). `getLibrary` presets get `imageCount` + `thumbnailPath`;
  `listLibraryImages` accepts kind `'preset'`; `updatePreset` accepts `thumbnailImageId`; deletePreset removes links;
  image delete clears pinned preset thumbnails.
- Gallery/export filter `?outfitPreset=<id>` (chip "Preset: <name>"); image overlay prev/next over a preset list.
- Library Presets tab: list thumbnails + "Images (N)" section + set/reset thumbnail + View in gallery (same components as
  characters/items).

## Data
One migration `0018_parts_nested_vars_presets`: `library_areas.parent_id`, seed children, `fragments.area_ids`,
`outfit_items.variables`, `outfit_presets.thumbnail_image_id`.

## Verification
Unit tests (pure), extend `scripts/smoke/parts.mjs`: partial cover (jacket open covers Arms → sleeves fragment gone,
shirt base stays, "Partly covered" badge), parent cover (closed → Top covers children), variables (preset A red / B white
→ preview text), preset image links + gallery chip.

## Polish (from list-UI review)
- Library item/character detail: replace the top-right "＋ Add fragment" button with the shared bottom add row
  ("＋ Add fragment"), like every other list.
- Axis detail: "Delete axis" becomes a small ghost destructive button (size sm), not large text.

## Note
Another branch (`feat/tag-assist`) may also add a migration; whichever merges second renumbers.
