# Dark/Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dark/light/system theme switching to 87 Studio, mirroring the existing i18n pattern.

**Architecture:** A `ThemeProvider` React context (modeled after `I18nProvider`) stores the user's theme choice in localStorage, resolves `system` via `matchMedia`, and toggles the `dark` class on `<html>`. A FOUC-prevention inline script applies the correct class before React hydrates. CodeMirror themes are swapped at runtime via the Compartment API.

**Tech Stack:** React 19 Context, Tailwind CSS 4 dark variant, CodeMirror 6 Compartment, Hugeicons, localStorage.

---

## File Structure

**Create:**

- `src/lib/theme/types.ts` — Theme and ResolvedTheme type definitions
- `src/lib/theme/context.tsx` — ThemeProvider, useTheme hook, FOUC script helper
- `src/lib/theme/index.ts` — Public re-exports

**Modify:**

- `src/lib/i18n/en.ts` — Add theme translation keys
- `src/lib/i18n/ko.ts` — Add theme translation keys
- `src/routes/__root.tsx` — Remove hardcoded `dark`, wrap with ThemeProvider, add FOUC script
- `src/routes/settings/index.tsx` — Add theme selector card
- `src/components/prompt-editor/theme.ts` — Add lightTheme export
- `src/components/prompt-editor/prompt-editor.tsx` — Dynamic theme switching via Compartment

---

### Task 1: Theme Type Definitions

**Files:**

- Create: `src/lib/theme/types.ts`

- [ ] **Step 1: Create type definitions**

```ts
// src/lib/theme/types.ts
export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/theme/types.ts
git commit -m "feat(theme): add theme type definitions"
```

---

### Task 2: Theme Context and Provider

**Files:**

- Create: `src/lib/theme/context.tsx`

- [ ] **Step 1: Create ThemeProvider and useTheme hook**

```tsx
// src/lib/theme/context.tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react'
import type { Theme, ResolvedTheme } from './types'

const STORAGE_KEY = '87studio-theme'
const DEFAULT_THEME: Theme = 'system'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light'
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system')
    return stored
  return DEFAULT_THEME
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') return getSystemTheme()
  return theme
}

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getInitialTheme()),
  )

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }, [])

  // Apply dark class to <html> and track resolved theme
  useEffect(() => {
    const resolved = resolveTheme(theme)
    setResolvedTheme(resolved)
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [theme])

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    const mq = window.matchMedia(MEDIA_QUERY)
    function handleChange() {
      if (theme === 'system') {
        const resolved = getSystemTheme()
        setResolvedTheme(resolved)
        document.documentElement.classList.toggle('dark', resolved === 'dark')
      }
    }
    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
  }, [theme])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/theme/context.tsx
git commit -m "feat(theme): add ThemeProvider context and useTheme hook"
```

---

### Task 3: Theme Public API

**Files:**

- Create: `src/lib/theme/index.ts`

- [ ] **Step 1: Create public exports**

```ts
// src/lib/theme/index.ts
export { ThemeProvider, useTheme } from './context'
export type { Theme, ResolvedTheme } from './types'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/theme/index.ts
git commit -m "feat(theme): add public API exports"
```

---

### Task 4: i18n Translation Keys

**Files:**

- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/ko.ts`

- [ ] **Step 1: Add theme keys to English translations**

In `src/lib/i18n/en.ts`, inside the `settings` object, after the `languageDesc` entry (line ~84), add:

```ts
    theme: 'Theme',
    themeDesc: 'Choose the display theme for the interface',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
```

- [ ] **Step 2: Add theme keys to Korean translations**

In `src/lib/i18n/ko.ts`, inside the `settings` object, after the `languageDesc` entry (line ~87), add:

```ts
    theme: '테마',
    themeDesc: '인터페이스 표시 테마를 선택합니다',
    themeSystem: '시스템',
    themeLight: '라이트',
    themeDark: '다크',
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to i18n keys

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/ko.ts
git commit -m "feat(theme): add i18n translation keys for theme settings"
```

---

### Task 5: Root Layout Integration

**Files:**

- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Add FOUC-prevention script and ThemeProvider**

In `src/routes/__root.tsx`:

1. Add import at top:

```ts
import { ThemeProvider } from '@/lib/theme'
```

2. Replace the `RootDocument` function (lines 87-98). Change `className="dark"` to no class, and add inline FOUC script:

```tsx
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('87studio-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d)})()`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

3. In `RootComponent`, wrap the content with `<ThemeProvider>` alongside `<I18nProvider>`:

```tsx
function RootComponent() {
  const routerState = useRouterState()
  const { pathname } = routerState.location
  const isWorkspace = pathname.startsWith('/workspace')
  const isGenerate = pathname.startsWith('/generate')
  const isImageDetail = /^\/gallery\/\d+/.test(pathname)

  return (
    <ThemeProvider>
      <I18nProvider>
        <OnboardingProvider>
          {isWorkspace || isImageDetail || isGenerate ? (
            <TooltipProvider delayDuration={300}>
              <Outlet />
              <Toaster richColors position="top-center" />
            </TooltipProvider>
          ) : (
            <TooltipProvider delayDuration={300}>
              <Sidebar />
              <main className="lg:ml-56 min-h-screen pb-16 lg:pb-0">
                <div className="p-4 lg:p-6">
                  <div className="animate-in fade-in-0 duration-150">
                    <Outlet />
                  </div>
                </div>
              </main>
              <BottomNav />
              <Toaster richColors position="bottom-right" />
            </TooltipProvider>
          )}
          <OnboardingOverlay />
        </OnboardingProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
```

- [ ] **Step 2: Verify the app starts without errors**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat(theme): integrate ThemeProvider in root layout with FOUC prevention"
```

---

### Task 6: Settings Page Theme Selector

**Files:**

- Modify: `src/routes/settings/index.tsx`

- [ ] **Step 1: Add theme selector card**

In `src/routes/settings/index.tsx`:

1. Add imports at top:

```ts
import { HugeiconsIcon } from '@hugeicons/react'
import { Sun02Icon, Moon02Icon, ComputerIcon } from '@hugeicons/core-free-icons'
import { useTheme } from '@/lib/theme'
import type { Theme } from '@/lib/theme'
```

2. Inside `SettingsPage` function, add after the `const onboarding = ...` line:

```ts
const { theme, setTheme } = useTheme()
```

3. Add theme card between the Language card and the Storage card (after the closing `</Card>` of the Language section, before the Storage `<Card>`):

```tsx
<Card>
  <CardHeader>
    <CardTitle>{t('settings.theme')}</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">{t('settings.themeDesc')}</p>
    <div className="flex gap-2">
      {(
        [
          ['system', t('settings.themeSystem'), ComputerIcon],
          ['light', t('settings.themeLight'), Sun02Icon],
          ['dark', t('settings.themeDark'), Moon02Icon],
        ] as const
      ).map(([value, label, icon]) => (
        <Button
          key={value}
          variant={theme === value ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTheme(value as Theme)}
          className="gap-1.5"
        >
          <HugeiconsIcon icon={icon} size={16} />
          {label}
        </Button>
      ))}
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/settings/index.tsx
git commit -m "feat(theme): add theme selector to settings page"
```

---

### Task 7: CodeMirror Light Theme

**Files:**

- Modify: `src/components/prompt-editor/theme.ts`

- [ ] **Step 1: Add lightTheme export**

In `src/components/prompt-editor/theme.ts`, add after the existing `darkTheme` export (after line 103):

```ts
export const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'oklch(0.985 0 0)',
      color: 'oklch(0.205 0 0)',
      borderRadius: '0.5rem',
      border: '1px solid oklch(0.922 0 0)',
      fontSize: '13px',
    },
    '.cm-content': {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      padding: '8px 0',
      caretColor: 'oklch(0.205 0 0)',
    },
    '.cm-cursor': {
      borderLeftColor: 'oklch(0.205 0 0)',
    },
    '&.cm-focused': {
      outline: '2px solid oklch(0.45 0.12 70 / 50%)',
      outlineOffset: '-1px',
    },
    '.cm-gutters': {
      backgroundColor: 'oklch(0.985 0 0)',
      color: 'oklch(0.556 0 0)',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'oklch(0.45 0.12 70 / 8%)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'oklch(0.45 0.12 70 / 20%) !important',
    },
    '.cm-line': {
      padding: '0 8px',
    },
    // Placeholder highlight — amber signature
    '.cm-placeholder-highlight': {
      backgroundColor: 'oklch(0.45 0.12 70 / 12%)',
      borderRadius: '3px',
      padding: '1px 0',
      border: '1px solid oklch(0.45 0.12 70 / 25%)',
    },
    // Bundle highlight — teal/cyan signature
    '.cm-bundle-highlight': {
      backgroundColor: 'oklch(0.45 0.12 200 / 12%)',
      borderRadius: '3px',
      padding: '1px 0',
      border: '1px solid oklch(0.45 0.12 200 / 25%)',
    },
    // Autocomplete styling
    '.cm-tooltip-autocomplete': {
      backgroundColor: 'oklch(0.985 0 0)',
      border: '1px solid oklch(0.922 0 0)',
      borderRadius: '0.5rem',
      maxHeight: '180px',
      overflowY: 'auto',
    },
    '.cm-tooltip-autocomplete ul li': {
      padding: '4px 8px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'oklch(0.97 0 0)',
    },
    '.cm-completionLabel': {
      color: 'oklch(0.205 0 0)',
    },
    '.cm-completionDetail': {
      color: 'oklch(0.556 0 0)',
      fontStyle: 'normal',
      marginLeft: '8px',
    },
    // Bundle hover tooltip — compact card
    '.cm-tooltip-bundle-preview': {
      backgroundColor: 'oklch(0.985 0 0)',
      border: '1px solid oklch(0.922 0 0)',
      borderRadius: '8px',
      padding: '8px 10px',
      maxWidth: '320px',
      fontSize: '11px',
      lineHeight: '1.5',
      boxShadow: '0 4px 12px oklch(0 0 0 / 10%)',
    },
    '.cm-tooltip-bundle-name': {
      color: 'oklch(0.45 0.12 200)',
      fontWeight: '600',
      fontSize: '12px',
    },
    '.cm-tooltip-bundle-sep': {
      height: '1px',
      backgroundColor: 'oklch(0 0 0 / 8%)',
      margin: '5px 0',
    },
    '.cm-tooltip-bundle-content': {
      color: 'oklch(0.35 0.01 80)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    },
  },
  { dark: false },
)
```

- [ ] **Step 2: Commit**

```bash
git add src/components/prompt-editor/theme.ts
git commit -m "feat(theme): add CodeMirror light theme"
```

---

### Task 8: CodeMirror Dynamic Theme Switching

**Files:**

- Modify: `src/components/prompt-editor/prompt-editor.tsx`

- [ ] **Step 1: Add Compartment-based dynamic theme switching**

In `src/components/prompt-editor/prompt-editor.tsx`:

1. Update imports — add `Compartment`:

```ts
import {
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
```

becomes:

```ts
import {
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  Compartment,
} from '@codemirror/view'
```

2. Import both themes and useTheme:

```ts
import { darkTheme } from './theme'
```

becomes:

```ts
import { darkTheme, lightTheme } from './theme'
import { useTheme } from '@/lib/theme'
```

3. Inside the `PromptEditor` component, before the `containerRef`:

```ts
const { resolvedTheme } = useTheme()
```

4. Add a ref for the compartment after `onChangeRef`:

```ts
const themeCompartmentRef = useRef(new Compartment())
```

5. In the `EditorState.create` extensions array, replace the static `darkTheme` (line 69) with:

```ts
        themeCompartmentRef.current.of(resolvedTheme === 'dark' ? darkTheme : lightTheme),
```

6. Add a new `useEffect` after the value sync effect (after line 122) to handle theme changes:

```ts
// Sync theme changes at runtime
useEffect(() => {
  const view = viewRef.current
  if (!view) return
  view.dispatch({
    effects: themeCompartmentRef.current.reconfigure(
      resolvedTheme === 'dark' ? darkTheme : lightTheme,
    ),
  })
}, [resolvedTheme])
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/prompt-editor/prompt-editor.tsx
git commit -m "feat(theme): dynamic CodeMirror theme switching via Compartment"
```

---

### Task 9: Verify and Final Commit

- [ ] **Step 1: Run TypeScript check**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 2: Run linter**

Run: `cd /Users/user/project/snuff/87-studio && pnpm lint 2>&1 | tail -10`
Expected: No new errors

- [ ] **Step 3: Run tests**

Run: `cd /Users/user/project/snuff/87-studio && pnpm test 2>&1 | tail -10`
Expected: All existing tests pass

- [ ] **Step 4: Manual smoke test checklist**

Run: `cd /Users/user/project/snuff/87-studio && pnpm dev`

Verify in browser:

1. Default theme follows OS setting (system mode)
2. Settings page shows Theme card with System/Light/Dark buttons
3. Clicking Light applies light theme immediately (no flash)
4. Clicking Dark applies dark theme immediately
5. Clicking System follows OS preference
6. Theme persists after page refresh (no FOUC)
7. CodeMirror editors switch theme correctly
8. All shadcn/ui components render correctly in both themes
9. Sidebar, bottom nav, toasts look correct in light mode
