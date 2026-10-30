# Redesign Phase 1 — Foundation & App Shell

Date: 2026-10-30
Status: approved (brainstorming session)

## Context

The whole UI (look + layout) is being redesigned in 5 phases:

1. **Foundation + app shell** ← this spec
2. `EditorShell` + Quick Generate (left tabbed panel w/ fixed Generate footer, center viewer, right vertical history, resizable)
3. Workspace on `EditorShell` (Scenes tab master / selected-scene detail, merge scene-detail route)
4. Browse pages (gallery, bundles, tags, queue, dashboard)
5. Settings, metadata

Decisions made with the user:

- **Tone**: neutral graphite dark base + Rose→Coral gradient accent. One accent family only (no secondary signal colors).
- **Dark only**: light mode and the theme toggle are removed. UI scale setting stays.
- **References**: shadcn Blocks (sidebar-07 collapsible icon sidebar, tidy density).
- **Global nav**: shadcn `Sidebar` with `collapsible="icon"` + top header with breadcrumb.
- **Components**: use shadcn/ui first (added through the shadcn CLI into `src/components/ui`); custom only when shadcn has none.

## 1. Tokens (`src/styles.css`)

Remove the light `:root` block; `:root` holds the dark values (keep the `.dark` selector working by defining the same values for both `:root` and `.dark`, or just `:root` if nothing depends on `.dark` variables). Neutral graphite = zero chroma.

| Token | Value |
|---|---|
| `--background` | `#111113` |
| `--foreground` | `#f2f2f3` |
| `--card` / `--card-foreground` | `#18181b` / `#f2f2f3` |
| `--popover` / `--popover-foreground` | `#1c1c20` / `#f2f2f3` |
| `--primary` / `--primary-foreground` | `#ff6b8b` / `#ffffff` |
| `--secondary` / `--secondary-foreground` | `#1f1f23` / `#e6e6e8` |
| `--muted` / `--muted-foreground` | `#1f1f23` / `#8c8c94` |
| `--accent` / `--accent-foreground` | `#26262b` / `#f2f2f3` |
| `--destructive` | `#f0524f` |
| `--border` | `rgb(255 255 255 / 8%)` |
| `--input` | `rgb(255 255 255 / 12%)` |
| `--ring` | `rgb(255 107 139 / 50%)` |
| `--chart-1..5` | `#ff6b8b`, `#ff8a5c`, `#ff4d7d`, `#ffb3c2`, `#c2415d` |
| `--sidebar` | `#0c0c0e` |
| `--sidebar-foreground` | `#f2f2f3` |
| `--sidebar-primary` / `-foreground` | `#ff6b8b` / `#ffffff` |
| `--sidebar-accent` / `-foreground` | `rgb(255 107 139 / 14%)` / `#ffd0da` (active/hover nav item) |
| `--sidebar-border` | `rgb(255 255 255 / 8%)` |
| `--sidebar-ring` | `rgb(255 107 139 / 50%)` |

Values may be written as oklch equivalents; hex is the source of truth.

New brand tokens (also exposed via `@theme inline` so Tailwind utilities work):

- `--brand-from: #ff4d7d`, `--brand-to: #ff8a5c`
- `--brand-gradient: linear-gradient(135deg, var(--brand-from), var(--brand-to))`
- `--brand-glow: rgb(255 77 125 / 32%)`
- Utility classes in `styles.css`: `.bg-brand-gradient` (background-image) and `.shadow-brand-glow` (`box-shadow: 0 4px 14px var(--brand-glow)`).

**Button**: add `variant="brand"` to `src/components/ui/button.tsx` — brand gradient bg, white text, brand glow, hover slightly brighter (e.g. `brightness-110`). Reserved for the single primary action of a screen (Generate). Phase 1 applies it to the existing Generate buttons (workspace `bottom-toolbar.tsx` GenerateButton, quick generate `QuickGenerateButton`). Other `default` buttons stay solid `--primary`.

**Hardcoded colors**: audit `amber-*`, `orange-*`, `yellow-*` and hardcoded `oklch(... 70)` hue usages in `src/` (outside `components/ui`). Those meaning "brand/accent" → `primary`/brand tokens. Star ratings / favorites stay yellow (`#ffd166`-ish / existing yellow utility).

**CodeMirror theme** (`src/components/prompt-editor/theme.ts`): delete `lightTheme`; rewrite `darkTheme` colors to reference CSS variables (`var(--card)`, `var(--foreground)`, `var(--border)`, `var(--primary)` …) instead of amber-hued oklch literals. Keep tag-category completion colors (they encode Danbooru categories) but use neutral, non-amber hues where they were amber. `prompt-editor.tsx` always uses `darkTheme` (drop `useTheme` and the theme compartment sync).

## 2. Theme removal

- Delete `src/lib/theme/` and `ThemeProvider` usage in `__root.tsx`.
- Root inline script: keep only the UI-scale part; `<html lang="en" className="dark">`.
- Settings page: remove the theme card; remove `settings.theme*` i18n keys from `en.ts`/`ko.ts`/`types.ts` (if typed).
- Remove any `87studio-theme` localStorage reads.
- Remaining references to `dark:` Tailwind variants are harmless; leave them.

## 3. shadcn components

Add via CLI (`pnpm dlx shadcn@latest add sidebar breadcrumb sheet scroll-area`), matching `components.json` style `radix-maia` and hugeicons. `sidebar` brings `use-mobile` hook (`src/hooks/use-mobile.ts`) and may update `input`, `separator`, `skeleton`, `tooltip`, `sheet` — review any overwritten existing ui files and keep local customizations (e.g. `button.tsx` variants, `number-stepper.tsx` untouched). If the CLI cannot run offline, hand-port the official radix sidebar-07 sources adapted to this style.

`resizable` / `toggle-group` are deferred to phase 2.

## 4. App shell

```
SidebarProvider (defaultOpen from shadcn sidebar cookie)
├─ AppSidebar  (src/components/layout/app-sidebar.tsx, collapsible="icon")
│   ├─ SidebarHeader: gradient logo square + "87 Studio" (link to /)
│   ├─ SidebarGroup "Create":  Projects (/) · Quick Generate (/generate) · Queue (/queue, SidebarMenuBadge = pending image count when > 0)
│   ├─ SidebarGroup "Library": Gallery · Bundles · Tags · Metadata
│   ├─ SidebarFooter: QueueStatusWidget (expanded: current widget; collapsed: hidden — the Queue badge covers it) · Settings
│   └─ SidebarRail
└─ SidebarInset
    ├─ AppHeader (src/components/layout/app-header.tsx): SidebarTrigger │ Separator │ Breadcrumb │ right slot (empty in phase 1)
    └─ page content
```

- Nav items keep existing icons and i18n keys (`nav.*`); group labels get new i18n keys (`nav.groupCreate`, `nav.groupLibrary`). Active state via router pathname (`/` exact, others prefix). Tooltips on collapsed icons (built into `SidebarMenuButton tooltip`).
- **Auto-collapse on editor routes**: when the pathname enters `/workspace` or `/generate`, call `setOpen(false)` once on entry (not on every render; user may re-expand while there). Leaving does not auto-expand; the cookie/user state rules elsewhere. Implement as a small effect component inside `SidebarProvider`.
- **Breadcrumb**: `src/components/layout/breadcrumb-context.tsx` exposing `BreadcrumbProvider` and `useBreadcrumb(items: { label: string; to?: string }[])`. Default (when no page sets it): the active nav item's label. Phase 1 wires dynamic crumbs for: gallery image detail (`Gallery / #id`), and nothing else required. Breadcrumb resets on route change.
- **Content area for normal routes**: `<div className="p-4 lg:p-6 animate-in fade-in-0 duration-150"><Outlet/></div>` inside `SidebarInset`. Toaster `bottom-right`.
- **Editor routes (`/workspace/*`, `/generate`) — transitional**: render inside `SidebarInset` *without* `AppHeader` and without padding; container `h-svh overflow-hidden`. Replace `h-dvh` with `h-full` in `workspace-layout.tsx`, `routes/workspace/$projectId/index.tsx`, `routes/workspace/$projectId/scenes/$sceneId.tsx`. Their existing headers get a `SidebarTrigger` as the first item (`workspace-header.tsx`, `QuickGenerateHeader` in `routes/generate/index.tsx`, scene detail header). Their mobile left/right panel drawers keep working (fixed positioning offsets `top-12` remain valid since header height is unchanged). Toaster `top-center` as today.
- Gallery image detail route (`/gallery/$imageId`) and `ImageDetailOverlay` use `h-dvh` full-screen; keep as-is (overlay covers sidebar).
- Queue page uses `min-h-screen bg-background` wrapper — remove `min-h-screen` so it sits in the inset normally.

## 5. Mobile / tablet

- `< md` (shadcn `useIsMobile`, 768px): sidebar becomes an offcanvas Sheet opened by the header `SidebarTrigger` (and the trigger in editor headers). **Delete `bottom-nav.tsx`**, remove `pb-16` offsets.
- Tablet/desktop: icon/expanded per user state.
- Close the mobile sheet on navigation (`setOpenMobile(false)` on pathname change).

## 6. Cleanup

- Delete `src/components/layout/sidebar.tsx`, `src/components/layout/bottom-nav.tsx`.
- Remove `lg:ml-56`, `pb-16 lg:pb-0` from root.
- Onboarding: existing anchors are not on the old sidebar; verify steps still resolve (project card, new project btn, api-key-section, prompt-editor, add-scene-btn, scene-edit-tab, placeholder-editor, generation-controls). Spotlight z-index must sit above the sidebar.
- Update `.claude/CLAUDE.md`: styling (dark only, tokens, brand variant), structure (`layout/app-sidebar.tsx`, `app-header.tsx`, `breadcrumb-context.tsx`, removed theme dir), UI component count.

## 7. Verification

- `pnpm lint`, `pnpm test`, `pnpm build` pass; `tsc --noEmit` clean for touched files.
- Run `pnpm dev`; check every route at 1440 / 900 / 390 widths: sidebar expand/collapse (button, Ctrl+B, rail), auto-collapse entering `/generate` and `/workspace/:id`, Queue badge, mobile sheet open/close on navigate, breadcrumb text, editor routes fill the viewport with no double scrollbars, Generate buttons use brand gradient, no leftover amber accents.

## Out of scope

Page-internal layouts (phases 2–5), resizable panels, new Quick Generate/Workspace structure, light theme.
