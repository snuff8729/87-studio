# Tag assist: better autocomplete, caret tag info, floating Tag Search, fine categories

Date: 2026-10-31
Status: approved by user (chat; user reviews usage only)
Branch / worktree: `feat/tag-assist` at `../87-studio-tags` (from `main` 7b73ff9)
Reference (concepts/UX only — GPL-3.0, copy no code or data files): DNT-LAB/NAIA2.0 `app/web/remote/js/features/tagAssist.mjs`,
`tagSearchPopup.mjs`, `core/tag_search_index.py`, `core/tag_axis_registry.py`. Research notes:
`C:\Users\User\AppData\Local\Temp\claude\C--Users-User-project-snuff-87-studio\869a17d8-d310-45b4-a8bc-29607034f5c5\scratchpad\n\`
(raw NAIA sources, read for UX ideas only).

## Data we have
`data/danbooru.db` (read-only, ~290MB): `tags` (333k: name, post_count, category 0 general/1 artist/3 copyright/4
character/5 meta, is_deprecated), `wiki_pages` (136k: title, body, other_names), `tag_aliases`, `tag_implications`,
`tag_groups` (12k: tag_group, tag), `tags_fts` (FTS5 over name/other_names/aliases). Server access in
`src/server/functions/danbooru.ts` (`searchTags`, `getDanbooruTagDetail`, …).

## 1. Fine categories (NAIA taxonomy, our own mapping)
- Taxonomy (names/structure follow NAIA's axes): top-level `expression`, `pose_action`, `location`, `object`, `clothing`,
  `characteristic` (body/hair/eyes/ears…), `meta`, `nsfw`, `uncategorized`; plus Danbooru categories for non-general tags
  (`character`, `artist`, `copyright`, `meta`). Fine sub-categories where Danbooru tag groups support them, e.g. clothing:
  `cloth_top`, `cloth_bottom`, `cloth_footwear`, `cloth_headwear`, `cloth_under`, `cloth_swim`, `cloth_accessory`;
  characteristic: `hair_style`, `hair_color`, `bangs`, `eyes`, `ears`, `body_type`, `skin`; expression; pose_action:
  `posture`, `gesture`, `action`; location: `indoor`, `outdoor`, `background`; meta: `composition`, `style`. Final list =
  what the tag groups can actually populate (inspect `tag_groups` group names first; document the mapping table).
- Mapping = our own: rules table in code (`src/lib/tag-categories.ts`: category definitions with en/ko labels + colors,
  and `tag_group` name → category rules), built on server start (lazy, cached in memory) from `danbooru.db.tag_groups`;
  tags in no group → `uncategorized` (general) or their Danbooru category. Expose `getTagCategory(name)` server-side and
  return `{ category, fineCategory }` in every tag search/detail result.
- Colors: Danbooru 5 colors stay for the main category; fine category shown as a small label.

## 2. Description storage, Korean-ready
- New studio DB table `tag_descriptions(tag TEXT, locale TEXT, text TEXT, source TEXT, updated_at, PK(tag, locale))`
  (migration in this branch; number it after the latest on main at implementation time and note it may need renumbering
  at merge). Nothing writes it yet except an internal server fn `setTagDescription` (for future import/translation).
- Description resolution: `tag_descriptions` row for the UI locale → else English summary from `wiki_pages.body` (first
  sentence/paragraph, DText markup stripped: `[[a|b]]`, `h4.`, `[b]`, links, `* ` lists) → else none. One server helper
  used by all three features.

## 3. Autocomplete (CodeMirror, all prompt editors)
- Ranking: exact name > exact alias > prefix (by count) > alias/other_names prefix (by count) > substring fallback for
  ≥3 chars when fewer than the limit (by count). Weight syntax stripped from the query (`1.2::tag::`, `{}`, `[]`, `\(`).
  Space/underscore equivalent. Limit 20.
- Row: tag (category color), small fine-category label, post count (`1.2M`/`12k`), alias hint ("→ ponytail" when matched
  via alias; inserting the alias inserts the canonical tag), "in prompt" mark when the tag already appears in this
  editor's text (token match like `src/lib/prompt-tags.ts`).
- Info panel beside the list for the highlighted row (CodeMirror completion `info`): description, category, aliases
  (few), implies (few). Debounced/cached fetch.
- Keep existing bundle/slot/@{char}/@{outfit}/@{var} completions working (merge in `unifiedCompletion`).

## 4. Caret tag info card
- When the caret rests on a tag token (click or arrow/Home/End keys, not while typing, not while completion is open), after
  ~300ms show a compact card anchored near the caret (CodeMirror tooltip, placed above the line; flips below): tag name
  (color), category + fine category, count, description (3 lines, "more" expands), chips: aliases, implies, implied-by,
  same-group (≤8 each); chip click inserts `, tag` after the current token; Copy button; "Open in tag page".
- Hidden on typing, Esc, blur, or when the token isn't a known tag (unknown → nothing). Toggle in the editor header
  (on by default, persisted `87studio-tag-info`). Right-click context menu unchanged.

## 5. Floating Tag Search window
- Non-modal floating window (no backdrop; page behind stays interactive). Opened by Ctrl/Cmd+Shift+F (global; works while
  typing in a prompt editor; ignored when a modal dialog other than this is open) and by a 🔍 button in the prompt editor
  header (`prompt-editor-header.tsx`) / expanded editor header.
- shadcn Command look: search input, category tabs (All, Character, Artist, Copyright, General + top-level fine
  categories as a scrollable chip row), results list (≤200; substring match for ≥3 chars ASCII / ≥2 non-ASCII, prefix
  otherwise; sorted by post count; exact match pinned first), right/bottom detail pane (description, categories, count,
  aliases, implies, chips) with "Add to prompt" and "Copy". Enter / double-click = add to prompt. ↑/↓ navigate, Esc
  closes.
- **Drag** by the title bar, **resize** from the bottom-right corner, clamp inside the viewport (re-clamp on window
  resize), persist position/size in localStorage `87studio-tag-search-window`, double-click title bar = reset to default
  (bottom-right, ~440×560). Window stays open after adding.
- "Add to prompt" inserts into the **last focused prompt editor** (global registry updated on CodeMirror focus; append
  `, tag` at that editor's cursor, or at the end if it lost its selection; respect existing separators); if none, button
  disabled with hint.
- Mobile (<768): opens as a bottom sheet (~60vh) instead of a floating window.
- The existing `/tags` page and tag gallery dialog stay; add an "Open in Tag Search" entry point where natural, and show
  fine categories in their result rows.

## Verification
Unit tests for pure parts (query normalization, ranking order, DText stripping, category rule mapping). Browser smoke
(new `scripts/smoke/tag-assist.mjs`, mock server, real danbooru.db is required — check how the dev server finds it with
STUDIO_DATA_DIR and copy/link `data/danbooru.db` into the throwaway data dir read-only): autocomplete rows + info,
caret card appears/inserts chip, Tag Search open via shortcut, drag + resize + persist + reset, add to last-focused
editor, category tab filter. Screenshots 1440 + 390.
