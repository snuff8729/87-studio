# Redesign Phase 3b — Scene Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move scene navigation from the left "Scenes" tab into a center SceneRail (expanded/compact), make the board an explicit mode, add a Ctrl/Cmd+K scene palette; left tabs become identical to Quick Generate.

**Spec:** `docs/superpowers/specs/2026-10-30-redesign-phase3b-scene-rail-design.md`

## Global Constraints

- Prepend `C:/Users/User/project/snuff/87-studio/runtime/node` to PATH. Tools: `npx.cmd vitest run`, `node.exe node_modules/typescript/bin/tsc --noEmit -p .` (baseline errors only: editor-context-menu.tsx, bundles/index.tsx, tags/index.tsx, tag-bookmarks.ts), `npx.cmd eslint <files>`, `npx.cmd prettier --write <files>`.
- New dependency (`cmdk` for shadcn `command`): `npm.cmd install cmdk@<version shadcn command expects>` with the bundled npm; add the matching entry to `pnpm-lock.yaml` by hand (do NOT run `pnpm install --lockfile-only`; it bumps nitro). Never `pnpm install/add`, never any build (user's server on :3000 serves `.output`).
- shadcn first; hugeicons; i18n en/ko (ko typed from en); dark tokens; selection `--primary`.
- Browser checks: dev `runtime/node/node.exe node_modules/vite/bin/vite.js dev --port 3100 --strictPort`; playwright-core at `C:/Users/User/AppData/Local/Temp/claude/C--Users-User-project-snuff-87-studio/ebff346b-7e74-48c9-a979-5cbd5b9c3f0b/scratchpad/pw`. Never click an enabled Generate; abort all write requests; stop the dev server afterwards.
- Style: no semicolons, single quotes, Prettier.

## Review Focus

1. Auto-compact must not fight the user: an explicit expand/compact choice wins over the width rule; no flicker loop while resizing around 720px.
2. Filters + search + collapsed groups combined: selected scene hidden by a filter stays selected in SceneView; ↑/↓ moves within visible rows only.
3. Auto-select first scene must not create history spam or loops (replace navigation; only when no valid selection).
4. Board mode via `view=board` survives reload and back/forward; card click returns to scene mode with that scene.
5. Ctrl/Cmd+K must not fire while another dialog is open, must not conflict with Ctrl/Cmd+Enter.

### Task 1: Pure modules + command component

**Files:** `src/components/workspace/scene-rail-prefs.ts`, `scene-filters.ts`, tests in `src/components/workspace/__tests__/`; `src/components/ui/command.tsx`; package.json/package-lock (local)/pnpm-lock.yaml.

**Interfaces:**
- `type RailPref = 'expanded' | 'compact' | null`; `parseRailPref(raw: string | null): RailPref`; `shouldCompact(centerWidth: number, pref: RailPref): boolean` = `pref === 'compact' || (pref === null && centerWidth < 720)`; `RAIL_WIDTH_EXPANDED = 216`, `RAIL_WIDTH_COMPACT = 56`, `RAIL_AUTO_COMPACT_BELOW = 720`.
- `type SceneFilter = 'all' | 'reserved' | 'noImages'`; `filterScenes<T extends { id: number; name: string; imageCount: number }>(scenes: T[], opts: { query: string; filter: SceneFilter }, counts: Record<number, number>, defaultCount: number): T[]` — query = case-insensitive substring on name (trimmed; empty = no filter); reserved = effective count (`counts[id] ?? defaultCount`) > 0; noImages = imageCount === 0. Also `countByFilter(...)` returning `{ all, reserved, noImages }` for chip labels.

- [ ] Tests first (RED), then implement (GREEN): parseRailPref invalid → null; shouldCompact cases (null/719 → true, null/720 → false, 'expanded'/300 → false, 'compact'/2000 → true); filterScenes cases for query (case, trim), each filter, combination, defaultCount effect; countByFilter.
- [ ] Add shadcn command (hand-port if CLI fails), hugeicons for icons.

### Task 2: SceneRail, palette, board mode, route composition

**Files:** create `src/components/workspace/scene-rail.tsx`, `scene-palette.tsx`; modify `scene-view.tsx` (remove "← Scenes" button; SceneBoard grouping + toolbar using filterScenes/countByFilter), `src/routes/workspace/$projectId/index.tsx` (remove Scenes tab; center = rail + view / board; `view=board` search param; auto-select first scene; Ctrl/Cmd+K; mobile scenes sheet), onboarding (`scene-rail` anchor), i18n, `.claude/CLAUDE.md`; delete `scenes-tab.tsx` / `scene-card.tsx` parts no longer used (keep shared pieces actually imported, e.g. ReserveStepper/SceneMenuItems — move them if needed).

- [ ] Implement per spec "Decided UX".
- [ ] tsc / lint / vitest.
- [ ] Browser verification per spec "Verification" (mock 128 scenes / 6 packs by intercepting the workspace data server-fn response).
- [ ] Commits: `feat(workspace): scene rail and board mode`, plus `fix(...)` commits for browser findings.
