# Redesign Phase 1 — Foundation & App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the amber light/dark theme and hand-rolled sidebar/bottom-nav with a dark-only graphite + rose-gradient token set and a shadcn `Sidebar` (collapsible="icon") app shell with breadcrumb header.

**Architecture:** Tokens live in `src/styles.css`; shadcn primitives are added via CLI into `src/components/ui`. The shell is `SidebarProvider > AppSidebar + SidebarInset(AppHeader + content)` in `src/routes/__root.tsx`. Nav data + route predicates are pure functions in `src/components/layout/nav-items.ts` (unit-tested). Editor routes (`/workspace/*`, `/generate`) render inside the inset without AppHeader, keep their own headers, and auto-collapse the sidebar on entry.

**Tech Stack:** TanStack Start/Router, React 19, Tailwind 4, shadcn/ui (radix-maia, hugeicons), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-redesign-phase1-foundation-shell-design.md`

## Global Constraints

- Dark only. No light theme, no theme toggle. `<html lang="en" className="dark">`.
- Accent family only rose→coral: `--brand-from: #ff4d7d`, `--brand-to: #ff8a5c`, `--primary: #ff6b8b`. No other accent hues (stars/favorites may stay yellow).
- shadcn components first, added with the shadcn CLI; never overwrite existing customized files in `src/components/ui` (answer "no" to overwrite prompts / use no-overwrite).
- Icons: hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`), as in existing code.
- All user-facing strings through i18n (`src/lib/i18n/en.ts`, `ko.ts`).
- Subagents do NOT commit; the main session reviews and commits each task.
- Match existing code style (no semicolons, single quotes, 2-space, Prettier).

## Review Focus

1. Navigating between editor sub-routes (`/workspace/1` → `/workspace/1/scenes/3`) after the user manually re-expanded the sidebar must NOT collapse it again; only a non-editor → editor transition collapses. (Test: `shouldAutoCollapse` in Task 4.)
2. Active nav item: `/` is active only on exactly `/`; `/gallery/12` activates Gallery; `/generate` never activates Gallery. (Test: `getActiveNavItem` in Task 4.)
3. Mobile (<768px): opening the sidebar sheet and tapping a nav item must close the sheet. (Manual check in Task 6.)
4. shadcn CLI may try to overwrite customized `button.tsx`, `tooltip.tsx`, `input.tsx`, `separator.tsx`, `skeleton.tsx` — existing files must remain byte-identical except where a task intends changes. (Check in Task 1 via `git diff --stat src/components/ui`.)
5. Editor routes at 390px and 1440px: exactly one scroll container per panel, no page-level scrollbar, onboarding spotlight renders above the sidebar. (Manual check in Task 6.)

---

## Execution waves

- **Wave 1 (parallel):** Task 1, Task 2, Task 3 — disjoint files.
- **Wave 2 (parallel):** Task 4 (shell), Task 5 (docs) — after wave 1 is committed.
- **Wave 3:** Task 6 — main session verification.

---

### Task 1: Add shadcn primitives

**Files:**
- Create (via CLI): `src/components/ui/sidebar.tsx`, `src/components/ui/breadcrumb.tsx`, `src/components/ui/sheet.tsx`, `src/components/ui/scroll-area.tsx`, `src/hooks/use-mobile.ts`
- Must NOT modify: any other existing file in `src/components/ui/`

**Interfaces:**
- Produces: standard shadcn exports — `SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuBadge, SidebarFooter, SidebarRail, SidebarInset, SidebarTrigger, useSidebar` (`useSidebar()` returns `{ state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }`); `Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator`; `Sheet*`; `ScrollArea, ScrollBar`; `useIsMobile(): boolean`.

- [ ] **Step 1:** Run `pnpm dlx shadcn@latest add sidebar breadcrumb sheet scroll-area` from repo root. Decline every overwrite prompt for existing files.
- [ ] **Step 2:** Run `git status --short src/components/ui src/hooks` — Expected: only new files listed (`??`), no `M` lines. If CLI changed an existing file, `git checkout -- <file>`.
- [ ] **Step 3:** Ensure new files use hugeicons, not lucide (the `sidebar` trigger icon, `sheet` close icon, breadcrumb separator/ellipsis). Replace any `lucide-react` import with the equivalent hugeicons icon (`SidebarLeftIcon`, `Cancel01Icon`, `ArrowRight01Icon`, `MoreHorizontalIcon`) via `<HugeiconsIcon icon={...} />`. Expected: `grep -r "lucide" src` returns nothing.
- [ ] **Step 4:** If `sidebar.tsx` uses a `button`/`input` variant or size that local `button.tsx` lacks, adapt the usage in `sidebar.tsx` (not `button.tsx`).
- [ ] **Step 5:** Run `pnpm exec tsc --noEmit -p .` — Expected: no errors in new files.

---

### Task 2: Tokens, brand variant, CodeMirror theme, color audit

**Files:**
- Modify: `src/styles.css` (`:root`, `.dark`, `@theme inline`, add utilities)
- Modify: `src/components/ui/button.tsx` (add `brand` variant)
- Modify: `src/components/prompt-editor/theme.ts` (delete `lightTheme`, CSS-var colors in `darkTheme`)
- Modify: `src/components/workspace/bottom-toolbar.tsx` (GenerateButton → `variant="brand"`)
- Modify: `src/routes/generate/index.tsx` (`QuickGenerateButton` only → `variant="brand"`)
- Modify: other files found by the audit in Step 5 (outside `src/components/ui`, excluding `src/routes/__root.tsx`, `src/routes/settings/index.tsx`, `src/components/prompt-editor/prompt-editor.tsx`, `src/lib/theme/**`, `src/components/layout/**` — those belong to Tasks 3/4)

**Interfaces:**
- Produces: CSS vars `--brand-from`, `--brand-to`, `--brand-gradient`, `--brand-glow`; utility classes `.bg-brand-gradient`, `.shadow-brand-glow`; `buttonVariants({ variant: 'brand' })`.
- Produces: `src/components/prompt-editor/theme.ts` exports only `darkTheme` (no `lightTheme`). Task 3 removes the import of `lightTheme`.

- [ ] **Step 1:** Replace both the light `:root` and `.dark` token blocks with one set of dark values from spec §1 table (define them on `:root, .dark`). Keep `--radius: 0.625rem`. Add brand vars to the same block.
- [ ] **Step 2:** Add to `styles.css` (outside `@theme inline`): `.bg-brand-gradient { background-image: var(--brand-gradient) }` and `.shadow-brand-glow { box-shadow: 0 4px 14px var(--brand-glow) }`, inside `@layer utilities`.
- [ ] **Step 3:** In `button.tsx` add variant `brand: 'bg-brand-gradient text-white shadow-brand-glow hover:brightness-110 active:brightness-95'` (merge with the file's existing class conventions for focus/disabled).
- [ ] **Step 4:** Rewrite `theme.ts`: delete `lightTheme`; in `darkTheme` replace amber/neutral oklch literals with `var(--card)`, `var(--popover)`, `var(--foreground)`, `var(--muted-foreground)`, `var(--border)`, `var(--accent)`, and primary-tinted values as `color-mix(in oklab, var(--primary) 20%, transparent)`. Tag-category completion colors: keep hues but change the two hue-70 (amber) ones (`property`, `tag-meta`) to `#ffb3c2` and `#c9c9cf`.
- [ ] **Step 5:** Audit: `grep -rnE "amber-|orange-|oklch\([^)]* 70\)" src --include=*.tsx --include=*.ts | grep -v components/ui`. For each hit meaning brand/accent → `primary` (or brand utility); rating stars/favorites → `text-yellow-400`/`fill-yellow-400`. Record each changed file in your report.
- [ ] **Step 6:** Apply `variant="brand"` to the workspace GenerateButton and `QuickGenerateButton`.
- [ ] **Step 7:** Run `pnpm exec tsc --noEmit -p .` and `pnpm lint` — Expected: no new errors in touched files (note: `prompt-editor.tsx` will error on the missing `lightTheme` import until Task 3 lands; that single error is expected).

---

### Task 3: Remove theme system (dark only)

**Files:**
- Delete: `src/lib/theme/` (index.ts, context.tsx, types.ts)
- Modify: `src/routes/__root.tsx` (remove `ThemeProvider` wrapper & import; inline script keeps only ui-scale; `<html lang="en" className="dark">`)
- Modify: `src/components/prompt-editor/prompt-editor.tsx` (drop `useTheme`, `lightTheme` import, theme compartment + runtime sync effect; always use `darkTheme`)
- Modify: `src/routes/settings/index.tsx` (remove theme card, `useTheme`, `Theme` import, now-unused icons)
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/ko.ts` (+ `types.ts` if keys are typed there): remove `settings.theme`, `themeDesc`, `themeSystem`, `themeLight`, `themeDark`

**Interfaces:**
- Consumes: `darkTheme` from `src/components/prompt-editor/theme.ts` (Task 2 removes `lightTheme`).
- Produces: `__root.tsx` with no theme provider; `RootComponent` structure otherwise unchanged (Task 4 rewrites the shell part).

- [ ] **Step 1:** Delete `src/lib/theme/` and remove every import of `@/lib/theme` (`grep -rn "@/lib/theme" src` → empty).
- [ ] **Step 2:** Root script body becomes exactly: `(function(){var s=localStorage.getItem('87studio-ui-scale');if(s){document.documentElement.style.fontSize=s+'%'}})()`.
- [ ] **Step 3:** Prompt editor: pass `darkTheme` directly in the extensions array; delete the compartment ref and the sync effect.
- [ ] **Step 4:** Remove theme card + keys; `grep -rn "settings.theme\|87studio-theme" src` → empty.
- [ ] **Step 5:** `pnpm exec tsc --noEmit -p .` and `pnpm lint` — Expected: clean for touched files.

---

### Task 4: App shell (sidebar, header, breadcrumb, editor routes)

**Files:**
- Create: `src/components/layout/nav-items.ts`
- Create: `src/components/layout/__tests__/nav-items.test.ts`
- Create: `src/components/layout/app-sidebar.tsx`
- Create: `src/components/layout/app-header.tsx`
- Create: `src/components/layout/breadcrumb-context.tsx`
- Create: `src/components/layout/sidebar-route-sync.tsx`
- Delete: `src/components/layout/sidebar.tsx`, `src/components/layout/bottom-nav.tsx`
- Modify: `src/routes/__root.tsx` (`RootComponent` shell)
- Modify: `src/components/queue/queue-status-widget.tsx` (export `useQueueSummary` hook or reuse query key so sidebar badge shares the query)
- Modify: `src/components/workspace/workspace-layout.tsx`, `src/routes/workspace/$projectId/index.tsx`, `src/routes/workspace/$projectId/scenes/$sceneId.tsx` (`h-dvh` → `h-full`; add `SidebarTrigger` first in the header)
- Modify: `src/components/workspace/workspace-header.tsx` (prepend `SidebarTrigger`)
- Modify: `src/routes/generate/index.tsx` (`QuickGenerateHeader`: prepend `SidebarTrigger`; root wrapper `h-dvh` → `h-full` if present)
- Modify: `src/routes/queue/index.tsx:713` (drop `min-h-screen bg-background`)
- Modify: `src/routes/gallery/$imageId.tsx` (call `useBreadcrumb` with Gallery → `#{id}`)
- Modify: `src/lib/i18n/en.ts`, `ko.ts` (+ types): add `nav.groupCreate` ("Create" / "생성"), `nav.groupLibrary` ("Library" / "라이브러리")

**Interfaces:**
- Consumes: Task 1 shadcn exports; Task 3's theme-free `__root.tsx`.
- Produces (`nav-items.ts`):
  - `type NavItem = { to: '/' | '/generate' | '/queue' | '/gallery' | '/bundles' | '/tags' | '/metadata' | '/settings'; key: TranslationKeys; icon: IconSvgElement; group: 'create' | 'library' | 'footer' }`
  - `navItems: readonly NavItem[]` — create: `/`, `/generate`, `/queue`; library: `/gallery`, `/bundles`, `/tags`, `/metadata`; footer: `/settings`. Icons = those in the old `sidebar.tsx`.
  - `getActiveNavItem(pathname: string): NavItem | undefined` — `/` exact; others `pathname === to || pathname.startsWith(to + '/')`.
  - `isEditorRoute(pathname: string): boolean` — `/generate` (exact or `/generate/...`) or `/workspace/...`.
  - `shouldAutoCollapse(prev: string | null, next: string): boolean` — `isEditorRoute(next) && !(prev !== null && isEditorRoute(prev))`.
- Produces (`breadcrumb-context.tsx`): `BreadcrumbProvider({ children })`, `useBreadcrumb(items: BreadcrumbEntry[]): void` (sets on mount, clears on unmount), `useBreadcrumbItems(): BreadcrumbEntry[] | null`, `type BreadcrumbEntry = { label: string; to?: string }`.

- [ ] **Step 1: Write the failing test** `nav-items.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getActiveNavItem, isEditorRoute, shouldAutoCollapse } from '../nav-items'

describe('getActiveNavItem', () => {
  it('matches root only exactly', () => {
    expect(getActiveNavItem('/')?.to).toBe('/')
    expect(getActiveNavItem('/gallery')?.to).toBe('/gallery')
  })
  it('matches nested paths by prefix', () => {
    expect(getActiveNavItem('/gallery/12')?.to).toBe('/gallery')
  })
  it('does not match partial segments', () => {
    expect(getActiveNavItem('/generate')?.to).toBe('/generate')
    expect(getActiveNavItem('/galleryx')).toBeUndefined()
  })
  it('returns undefined for workspace', () => {
    expect(getActiveNavItem('/workspace/1')).toBeUndefined()
  })
})

describe('isEditorRoute', () => {
  it.each([
    ['/generate', true],
    ['/workspace/1', true],
    ['/workspace/1/scenes/3', true],
    ['/gallery', false],
    ['/', false],
  ])('%s → %s', (p, v) => expect(isEditorRoute(p)).toBe(v))
})

describe('shouldAutoCollapse', () => {
  it('collapses on entering an editor route', () => {
    expect(shouldAutoCollapse('/gallery', '/generate')).toBe(true)
    expect(shouldAutoCollapse(null, '/workspace/1')).toBe(true)
  })
  it('does not re-collapse between editor routes', () => {
    expect(shouldAutoCollapse('/workspace/1', '/workspace/1/scenes/3')).toBe(false)
    expect(shouldAutoCollapse('/generate', '/workspace/2')).toBe(false)
  })
  it('does nothing for non-editor targets', () => {
    expect(shouldAutoCollapse('/generate', '/gallery')).toBe(false)
  })
})
```

- [ ] **Step 2:** Run `pnpm test -- src/components/layout` — Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `nav-items.ts` per Interfaces. Run tests — Expected: PASS.
- [ ] **Step 4:** `breadcrumb-context.tsx` per Interfaces; provider resets items when pathname changes.
- [ ] **Step 5:** `sidebar-route-sync.tsx`: `SidebarRouteSync(): null` — tracks previous pathname in a ref; on change, if `shouldAutoCollapse(prev, next)` → `setOpen(false)`; if `isMobile` → `setOpenMobile(false)` on every pathname change.
- [ ] **Step 6:** `app-sidebar.tsx`: `AppSidebar()` — `<Sidebar collapsible="icon">`; header with `.bg-brand-gradient` rounded logo square + "87 Studio" (link `/`); two `SidebarGroup`s with `SidebarGroupLabel` (`nav.groupCreate`, `nav.groupLibrary`); `SidebarMenuButton asChild isActive tooltip={label}` wrapping router `Link` (pass `search={{ imageDetail: undefined }}` like existing links); Queue item gets `SidebarMenuBadge` with `globalStats.totalPendingImages` when > 0 (shared `['queue-summary']` query); footer: `QueueStatusWidget` hidden when `state === 'collapsed'`, then Settings item; `<SidebarRail />`.
- [ ] **Step 7:** `app-header.tsx`: `AppHeader()` — `h-12 shrink-0 flex items-center gap-2 border-b px-3`: `SidebarTrigger`, vertical `Separator` (h-4), shadcn `Breadcrumb` rendering `useBreadcrumbItems()` or fallback `[{ label: t(getActiveNavItem(pathname).key) }]`; last item is `BreadcrumbPage`, earlier ones `BreadcrumbLink asChild` + `Link`.
- [ ] **Step 8:** `__root.tsx` `RootComponent`: `TooltipProvider > SidebarProvider > BreadcrumbProvider > SidebarRouteSync + AppSidebar + SidebarInset`. Inset content: editor route → `<div className="h-svh overflow-hidden"><Outlet/></div>` + Toaster top-center; otherwise `AppHeader` + `<div className="p-4 lg:p-6 animate-in fade-in-0 duration-150"><Outlet/></div>` + Toaster bottom-right. Keep `ImageDetailOverlay` and `OnboardingOverlay` outside the inset. Remove old `Sidebar`/`BottomNav` imports and offsets. Delete the two old files.
- [ ] **Step 9:** Editor routes: `h-dvh` → `h-full` in the three files; prepend `<SidebarTrigger className="-ml-1" />` in `workspace-header.tsx`, `QuickGenerateHeader`, and the scene-detail header. Queue page wrapper fix. Gallery `$imageId` breadcrumb.
- [ ] **Step 10:** Ensure onboarding spotlight/tooltip z-index exceeds sidebar (`z-10`/sheet `z-50`): check `src/components/onboarding/spotlight-backdrop.tsx` / `onboarding-overlay.tsx` use ≥ `z-[60]`; raise if lower.
- [ ] **Step 11:** `pnpm test`, `pnpm exec tsc --noEmit -p .`, `pnpm lint`, `pnpm build` — Expected: all pass.

---

### Task 5: Update project docs

**Files:**
- Modify: `.claude/CLAUDE.md`

- [ ] **Step 1:** Update: 스타일링 (dark only, graphite + rose gradient tokens, `variant="brand"` for single primary action, `.bg-brand-gradient`), 기술 스택 UI (shadcn Sidebar/Breadcrumb/Sheet/ScrollArea, ui component count 23 → 27), 프로젝트 구조 (`components/layout/`: `app-sidebar.tsx`, `app-header.tsx`, `breadcrumb-context.tsx`, `sidebar-route-sync.tsx`, `nav-items.ts`; remove `sidebar`/`bottom-nav`; remove `lib/theme/`; add `hooks/use-mobile.ts`), 반응형 디자인 (mobile = offcanvas sidebar sheet via header trigger, no bottom nav), 테스트 table (add `nav-items.ts`). Remove the theme system section entries. Keep Korean prose style.

---

### Task 6: Verification (main session)

- [ ] **Step 1:** `pnpm test && pnpm lint && pnpm build` — Expected: all pass.
- [ ] **Step 2:** `pnpm dev`; in browser at 1440 / 900 / 390 check every route: expand/collapse via trigger, Ctrl+B, rail; entering `/generate` and `/workspace/:id` collapses; re-expand then go to a scene → stays expanded; Queue badge; mobile sheet closes on nav; breadcrumb text; editor routes single scroll per panel; brand gradient on Generate; no amber left; onboarding spotlight above sidebar.
- [ ] **Step 3:** Commit per task, then merge `redesign/phase1-shell` into `main`.
