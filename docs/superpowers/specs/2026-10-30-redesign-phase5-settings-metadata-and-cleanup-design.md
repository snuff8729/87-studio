# Redesign Phase 5 — Settings, Metadata, and Cleanup

Date: 2026-10-30
Status: user asked to "do everything mentioned" (no mockup round; designs follow established phase 1–4 patterns)
Branch: `redesign/phase5` (from main)

## A. Settings (`/settings`)

- Uses the phase 4 header frame (title in app header; no in-page title).
- Desktop (≥1024): left sticky section nav (General, Generation, Appearance, Storage, Help) + right column of section cards (max-w ~720px), scroll-spy highlights the active section; clicking scrolls. Below 1024: single column, sections stacked, nav becomes a horizontal scrollable chip row at the top (sticky).
- Section content = all existing settings, regrouped: General (NAI API key — masked input, show/hide, save, status badge valid/not set), Generation (delay 0–30s slider + numeric input), Appearance (language, UI scale), Storage (stats tiles + orphan cleanup with confirm), Help (restart onboarding, if it exists today; app version/license link if available). Nothing removed.
- Each card: title, one-line description, controls; consistent row layout (label left / control right on desktop, stacked on mobile). Save feedback via existing toasts.

## B. Metadata inspector (`/metadata`)

- Header actions: "Create project" (existing flow) and any existing secondary actions (e.g. send to Quick Generate) — icon-only with aria-label on mobile (already).
- Empty: large drop zone filling the content area (dashed, icon, "Drop an NAI image or click to choose"), paste from clipboard if supported today.
- Loaded: two panes on desktop — left image preview (fit, checkerboard-free dark bg, file name, size, "Replace" button), right tabs: Prompt (positive/negative with copy buttons, read-only prompt-editor styling), Characters (V4 captions, per-character copy), Parameters (key/value grid: model, size, steps, scale, sampler, seed with copy, etc.), Vibe/References (if present), Raw (JSON, copy). Mobile: stacked, image on top (max 40vh).
- Dropping a new image anywhere on the page replaces the current one.
- Keep the import-to-project dialog and field selection as they are (style tidy only).

## C. Fixes

1. **Tag-bookmark upload images not served in production**: `/api/tag-images/` is mapped only in the vite dev plugin (`vite.config.ts serveDataFiles`). Make the production server serve `data/tag-images` exactly like `/api/images` etc. Verify with the built server.
2. **Editor routes +4px document height** (CodeMirror 2px body divs or similar): editor routes (`/generate`, `/workspace/*`) must have `document.scrollingElement.scrollHeight === innerHeight` at 1440 and 390. Find the actual cause.
3. **Scene board not virtualized**: virtualize the board/selection grid (pack group headers + card rows) with @tanstack/react-virtual, keeping card size slider, grouping, selection, keyboard/click behaviour. 120+ scenes must scroll smoothly.
4. **Onboarding step "edit scene" auto-satisfied** because a scene is auto-selected: make that step require a real user action (e.g. user clicks a scene row / edits a placeholder), and verify all 9 steps in order.
5. **Remove unused `next-themes`** dependency: package.json + hand-edit `pnpm-lock.yaml` (remove importer entry and the package block if unused elsewhere) + local `npm.cmd uninstall next-themes` with the bundled npm (do NOT run pnpm). Ensure no imports remain (sonner shadcn wrapper may import it — replace with fixed `theme="dark"`).

## D. Features

1. **Gallery min win-rate filter**: add to "＋ Filter" (presets ≥50/60/70/80%, only images with ≥1 match count), URL param, server query in `listImages` (wins/(wins+losses)). Download dialog already supports win rate — reuse its semantics.
2. **Gallery bulk tag**: selection header action "Tag" → popover to add existing/new tags and remove tags on selected images (server fn bulk add/remove on image_tags).
3. **Add gallery images to a tag bookmark** (server fn `addBookmarkImageFromGallery` exists but has no UI): image detail (overlay and `/gallery/$imageId`) action "Add to tag bookmark" → command popover to pick a bookmark (search) or create one; gallery selection header action does the same for many. Bookmark detail shows them (source 'gallery').

## Constraints

- shadcn first, hugeicons, i18n en + ko, dark tokens; header frame from phase 4 (`usePageHeader`, `HeaderButton`).
- Unit tests only for new pure logic (e.g. win-rate filter helper). Smoke: extend `scripts/smoke/browse.mjs` (settings + metadata pages, gallery win-rate chip, bulk tag popover, add-to-bookmark) and keep `scripts/smoke/workspace.mjs` passing; check C2 height assertion and C3 board scroll there. Desktop 1440 + mobile 390. Never click an enabled Generate; abort writes in smoke runs.
- Update `.claude/CLAUDE.md` (also mention the demo: `scripts/demo/*`, `npm run demo`, `npm run demo:seed`).
