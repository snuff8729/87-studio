# Dark/Light Mode Support

## Overview

Add theme switching (Dark / Light / System) to 87 Studio. Currently the app is dark-only (`<html className="dark">`). The goal is to let users choose their preferred theme, with "System" as the default that follows the OS preference.

## Architecture

### Theme System (`src/lib/theme/`)

Mirror the existing i18n pattern (`src/lib/i18n/`):

```
src/lib/theme/
├── index.ts       # Public API: ThemeProvider, useTheme
├── context.tsx    # React Context + Provider + hook
└── types.ts       # Type definitions
```

**Types:**

```ts
type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'
```

**Context value:**

```ts
interface ThemeContextValue {
  theme: Theme // User's selection (light | dark | system)
  resolvedTheme: ResolvedTheme // Actual applied theme (light | dark)
  setTheme: (theme: Theme) => void
}
```

**Behavior:**

- localStorage key: `87studio-theme`
- Default: `system`
- When `system` is selected: resolve via `matchMedia('(prefers-color-scheme: dark)')`
- Listen to `matchMedia` change events for real-time OS theme changes
- Apply by toggling `dark` class on `<html>` element (Tailwind's existing `@custom-variant dark` handles the rest)

### FOUC Prevention

Add an inline `<script>` in `<head>` (inside `RootDocument`) that reads localStorage and applies the `dark` class before React hydrates. This prevents a flash of wrong theme on page load.

```js
// Inline script (not a module — runs synchronously before paint)
;(function () {
  var t = localStorage.getItem('87studio-theme') || 'system'
  var dark =
    t === 'dark' ||
    (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
})()
```

### Root Layout Changes (`__root.tsx`)

- Remove hardcoded `className="dark"` from `<html>`
- Wrap app with `<ThemeProvider>` alongside `<I18nProvider>`
- Add the FOUC-prevention inline script to `<head>`

### Settings Page UI

Add a "Theme" card to the settings page, positioned between Language and Storage sections. Same pattern as the language selector:

- Three buttons: System / Light / Dark
- Icons from Hugeicons (Sun02Icon, Moon02Icon, Computer01Icon or similar)
- Active button uses `variant="default"`, others `variant="outline"`

### CodeMirror Theme Switching

**Current state:** `prompt-editor.tsx` imports `darkTheme` statically and includes it in extensions.

**Change:**

1. Add a `lightTheme` export in `theme.ts` using light-friendly colors (derived from `:root` CSS variables)
2. Use CodeMirror's `Compartment` API to make the theme extension reconfigurable at runtime
3. `prompt-editor.tsx` reads `resolvedTheme` from `useTheme()` and dispatches a reconfigure effect when the theme changes

### Hardcoded Color Audit

Files with hardcoded colors and their disposition:

| File                                          | Issue                                             | Action                                                                                          |
| --------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `prompt-editor/theme.ts`                      | All oklch values hardcoded for dark               | Add `lightTheme` with light-appropriate colors                                                  |
| `prompt-editor/weight-highlight.ts`           | oklch with alpha overlays                         | **No change needed** — alpha-based overlays work on both light and dark backgrounds             |
| `onboarding/spotlight-backdrop.tsx`           | `bg-black/70` overlay, `hsl(var(--primary))` glow | **No change needed** — overlay is theme-agnostic, glow uses CSS variable                        |
| 14 files with `bg-[...]` etc (33 occurrences) | Arbitrary Tailwind values                         | Review each; replace with semantic classes where appropriate, add `dark:` variants where needed |

### i18n Additions

Add to both `en.ts` and `ko.ts`:

```
settings.theme         → "Theme" / "테마"
settings.themeDesc     → "Choose your preferred theme" / "원하는 테마를 선택하세요"
settings.themeSystem   → "System" / "시스템"
settings.themeLight    → "Light" / "라이트"
settings.themeDark     → "Dark" / "다크"
```

## Files to Create

1. `src/lib/theme/types.ts`
2. `src/lib/theme/context.tsx`
3. `src/lib/theme/index.ts`

## Files to Modify

1. `src/routes/__root.tsx` — Remove hardcoded dark class, add ThemeProvider, FOUC script
2. `src/routes/settings/index.tsx` — Add theme selector card
3. `src/components/prompt-editor/theme.ts` — Add lightTheme
4. `src/components/prompt-editor/prompt-editor.tsx` — Use Compartment for dynamic theme
5. `src/lib/i18n/en.ts` — Add theme translation keys
6. `src/lib/i18n/ko.ts` — Add theme translation keys
7. Various component files — Fix arbitrary color values for light mode compatibility

## Out of Scope

- Custom user-defined themes or accent colors
- Per-page or per-component theme overrides
- Server-side theme persistence (localStorage only, matching i18n pattern)
