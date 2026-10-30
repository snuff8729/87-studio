# Character Parts: Outfit Occlusion + Gallery Axis Filter

Date: 2026-10-31
Status: approved by user (chat; user reviews usage only)
Builds on: `2026-10-30-character-parts-design.md`
Branch / worktree: `feat/parts-occlusion-gallery` at `../87-studio-occl` (from `main` 6615070)

## 1. Outfit occlusion (area-based)

User-facing:
- **Body areas**: a global editable list managed in Library › Axes tab (section "Body areas"). Seeded: Top, Bottom,
  Outerwear, Shoes, Headwear, Accessory. Rename / add / delete / reorder.
- An outfit item has **areas** (zero or more; e.g. a dress = Top + Bottom).
- An outfit item has **cover rules**: list of `{ condition, areaIds }` — "when <condition> → covers <areas>". Condition
  uses the same editor/semantics as fragment conditions (global axes + this item's local axes; empty = always).
  Example padding: `Zipper: Closed → covers Top`; `View: Back → covers Top`.
  Deleting an axis drops every cover rule whose condition referenced it (a rule never silently becomes "always
  covers"); deleting a single axis value keeps the rule with that value removed (empty list = never matches).
- Outfit order = inner → outer. An item is **hidden** when it has ≥1 area and every one of its areas is covered by a
  matching cover rule of some item **later** in the outfit list that itself passes its item condition (an outer item
  that is hidden by something even further out still covers — it is still worn). Items without areas are never hidden.
- Hidden items contribute no fragments.
- UI: item detail gets an "Areas" chip picker and a "Covers" rules list (＋ rule: condition chips + area chips, delete).
  The item Preview box stays item-only (no occlusion). Scene Parts section: outfit chips of hidden items are shown dimmed
  with a "Covered" / "가려짐" badge and tooltip naming the covering item; the final prompt preview already reflects it.
  Chars tab default-outfit chips: no change (occlusion depends on scene values).

Composition (pure, `src/lib/character-parts.ts`, unit-tested):
- `PartsItem` gains `areaIds: Array<number>` and `coverRules: Array<{ conditions: Condition; areaIds: Array<number> }>`.
- New `visibleItems(items, values, axes): { visible: Array<PartsItem>; hidden: Array<{ itemId: number; coveredBy: Array<number> }> }`.
  `composeParts` uses it (items failing their item condition are neither visible nor able to cover). `composeParts`
  additionally returns `hiddenItemIds` (keep existing `char` / `outfit` fields).
- Unknown area ids ignored.

Data (migration `0017_parts_occlusion_gallery`, together with section 2):
- New table `library_areas`: id, name NOT NULL, sort_order. Seeded with the six names above in order.
- `outfit_items`: `area_ids` TEXT DEFAULT '[]', `cover_rules` TEXT DEFAULT '[]'.
- Deleting an area removes its id from all items' `area_ids` and from every rule's `areaIds` (rules left with no areas
  are removed). Deleting an axis / axis value cleans rule conditions exactly like fragment conditions (same "never" rule
  for an emptied list).
- Duplicate item, detach, duplicate project copy `area_ids` / `cover_rules` (remap local-axis ids inside rule conditions).

Server: `getLibrary` returns `areas` and items with `areaIds` / `coverRules`; `updateOutfitItem` accepts them;
`createArea`, `renameArea`, `deleteArea`, `reorderAreas`.

## 2. Gallery filter by axis values

- At enqueue, `synthesizePrompts` records per character the effective axis values; `ResolvedPrompts.characterPrompts[]`
  gains `axisValues?: AxisValues` (only for slots that use parts). Stored in the job's resolved prompts as today.
- New table `image_axis_values`: image_id (FK generated_images CASCADE), axis_id (FK library_axes CASCADE), value_id
  (FK library_axis_values CASCADE), PK(image_id, axis_id, value_id), index (axis_id, value_id). When an image is saved,
  insert the distinct (axis, value) pairs of **global** axes across all characters of its job (mock path identical).
- Old images have no rows → never match an axis filter (documented, no backfill).
- `listImages` (and anything reusing the gallery filter, e.g. export/download if it shares the filter object) accepts
  `axes: Array<{ axisId: number; valueId: number }>`: AND across entries; an image matches an entry when it has that row
  (i.e. any character had that value). Must stay compatible with pagination / prev-next keysets.
- Gallery UI: "＋ Filter" gets one entry per global axis ("View", "Framing", …) → pick a value → chip "View: Back"
  (removable). URL search param `axis=<axisId>:<valueId>` (comma-separated for several). Image detail prev/next respects it.

## 3. Images per library character / outfit item + thumbnails (added 2026-10-31)

Like bundles (`image_bundles`) and tag bookmarks:
- New table `image_library_links`: image_id (FK generated_images CASCADE), kind ('character' | 'item'),
  ref_id (int; library_characters.id or outfit_items.id — no FK across two tables; delete rows in
  deleteLibraryCharacter / deleteOutfitItem), PK(image_id, kind, ref_id), index (kind, ref_id).
- Recorded at image save from the job's resolved prompts: `ResolvedPrompts.characterPrompts[]` gains
  `libraryCharacterId?` and `outfitItemIds?` = items that actually contributed ≥1 fragment (passed item condition,
  not hidden by occlusion, ≥1 fragment matched). Linked character recorded whenever the slot is linked.
  Old images: no rows (no backfill). Project-only copies link to their own ids.
- Server: `listImages` filter `libraryCharacterId` / `outfitItemId` (same keyset compatibility as other filters);
  `getLibrary` rows include `imageCount` and `thumbnailPath` (thumbnail image if set and exists, else latest linked
  image); `listLibraryImages({ kind, id, limit })` latest N; `updateLibraryCharacter` / `updateOutfitItem` already accept
  `thumbnailImageId` (null = reset to auto).
- UI (library page): list rows show the thumbnail; detail shows "Images (N)" grid of the latest 24 (click → image
  detail overlay with prev/next over that list, like the tag bookmark "images with this tag" section), "View in gallery"
  → `/gallery?libraryCharacter=<id>` / `?outfitItem=<id>`, and "Set as thumbnail" / "Reset thumbnail" (same pattern as
  bundle thumbnails). Gallery shows the filter as a removable chip with the character/item name.

## Tasks
- **F (first)**: migration 0017 (both sections) + schema + pure logic & tests + server functions/cleanup/copy points +
  synthesize/enqueue/image-save recording + `listImages` filter + i18n namespace stubs as needed.
- **Then in parallel**: **L** library UI (areas section, item areas + cover rules) + scene Parts "Covered" display;
  **G** gallery filter UI (+ export if it uses the same filters).
- **Final**: one review, extend `scripts/smoke/parts.mjs` (occlusion + gallery filter), commit, merge.
