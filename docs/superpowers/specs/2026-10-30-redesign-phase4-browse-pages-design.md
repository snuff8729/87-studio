# Redesign Phase 4 — Browse Pages

Date: 2026-10-30
Status: approved by user (brainstorm `browse-1.html`: 1-A, 2-A, 3-A, 4 as proposed)
Branch: `redesign/phase4-browse` (from main)

Pages: dashboard `/`, gallery `/gallery` (+ `/gallery/$imageId`), bundles `/bundles`, tags `/tags`, queue `/queue`. Settings and metadata are phase 5 but must keep working (they also use `PageHeader`; migrate them to the new frame mechanically so nothing looks broken — no redesign).

## 1-A Page frame: title and actions in the app header

- Extend the header mechanism (`src/components/layout/breadcrumb-context.tsx`, `app-header.tsx`): a page can set, besides breadcrumb items, an optional **count** (muted, after the last crumb) and **actions** (ReactNode, right-aligned in the header). Suggested API: `usePageHeader({ items?, count?, actions? })` (keep `useBreadcrumb` working or migrate callers). Actions must not cause render loops (store via ref/portal or a stable setter; e.g. render actions through a portal target in the header). Header height stays h-12; at mobile widths actions collapse to icon buttons / an overflow menu, never wrap.
- Remove in-page big titles and description paragraphs on these pages (`PageHeader` component deleted or reduced to nothing once no caller uses it). The default title is the nav item label (already the case).
- Content: full width with consistent padding (`p-4 md:p-6`), no centered narrow columns (dashboard and queue currently use them).
- Selection mode on browse pages follows the workspace 4-A pattern: while selecting, the header actions area is replaced by a selection header ("{n} selected", select all, actions, ✕). This replaces the floating bulk bars (fixes the deferred "floating bars centered on viewport" issue). Reuse/generalise `src/components/workspace/scene-selection-header.tsx` if it fits.

## 2-A Dashboard (`/`): cover card grid

- Header: "Projects {n}", actions: search (filters by name, client-side), "＋ New project" (`variant="default"`; brand gradient stays reserved for Generate).
- Running strip: only when a job is running/pending — one card row: status dot, project · scene label, progress bar (brand gradient), done/total, link to `/queue`. Uses the existing queue data/hooks.
- Grid of project cards (auto-fill, min ~220px): cover image (project thumbnail or latest image, 3:2, placeholder icon when none), name, "{scenes} scenes · {images} images · {relative updated}" and a ⋯ menu with existing project actions (rename/duplicate/delete — whatever exists today). Last cell: dashed "＋ New project" card. Click → workspace.
- Remove the "recent images" section and the dashboard's own logo/title/settings link.
- Empty state: welcome + New project + link to metadata import. Keep onboarding anchors on the new-project button(s).

## 3-A Gallery: filter chip toolbar

- Header: "Gallery {count}", actions: Select, Export (download dialog).
- Toolbar row under the header: active filter chips (`--primary` soft, label + ✕), "＋ Filter" dropdown offering Project, Scene (when a project is chosen; global-scene cross-project if supported today), Favorites, Min rating, Min win rate (if supported), Tag; then right side: sort dropdown and a card size slider (same component/behaviour as workspace scene image grid; replaces S/M/L `GridSizeToggle`, persisted).
- Filters stay in URL search params as today; all existing filter capabilities must remain reachable.
- Grid: infinite scroll as today; card hover shows favorite toggle + rating; favorites marked with a small ★ badge.
- Select mode: selection header (see frame) with Favorite, Tag, Download, Delete (whatever bulk actions exist today).
- `/gallery/$imageId` detail: adopt the frame (breadcrumb Gallery › image, actions in header), keep content, tidy density only.

## 4 Bundles, Tags, Queue

- **Bundles / Tags**: keep master–detail. List pane resizable (react-resizable-panels like EditorShell; persisted), rows with thumbnail + name + tag chips; detail uses `PromptEditorHeader` + prompt editor styling as in workspace. Search + "＋ New" at the top of the list pane. Mobile: list → detail navigation (detail with back button), no side-by-side.
- **Queue**: full width. Top: "Now generating" card (current job's latest image preview if available, project · scene label, progress bar, done/total, cancel). Below: pending batches list (existing actions kept: reorder if it exists, cancel), then completed/failed history collapsed by default with counts. Empty state as today but full width.

## Constraints

- shadcn first, hugeicons, i18n en + ko, dark tokens; `variant="brand"` only for Generate.
- Keep all existing functionality; this is layout/visual work. No DB or server changes unless strictly needed.
- Lean process: unit tests only for new pure logic. Add `scripts/smoke/browse.mjs` (reusable, same conventions as `scripts/smoke/workspace.mjs`: mock data by intercepting server-fn responses — the local DB has 1 project and 0 images — e.g. 12 projects, 300 gallery images, a running queue, 10 bundles, 10 tag bookmarks; abort all writes) checking each page at 1440 and 390: header title/count/actions present and not wrapping, no in-page title, gallery filter add/remove chip updates URL, size slider, select mode header, dashboard running strip, queue now-generating card, bundles/tags mobile list→detail, no console errors.
- Update `.claude/CLAUDE.md`.
