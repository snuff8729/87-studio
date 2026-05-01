# Unified Reference Syntax Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate placeholder syntax from `\\\\name\\\\` to `@{slot:name}` and bundle syntax from `@{name}` to `@{bundle:name}`, with unified autocomplete and invalid reference error highlighting.

**Architecture:** Update core regex libraries (placeholder.ts, bundle.ts), then update all consumers (CodeMirror plugins, UI components, tests, i18n, docs). Add a JS data migration script. Unify autocomplete into a single source showing slot → bundle → danbooru priority.

**Tech Stack:** TypeScript, Vitest, CodeMirror 6, Drizzle ORM (SQLite), React 19, TanStack Start.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/placeholder.ts` | Modify | Slot regex `@{slot:name}` |
| `src/lib/bundle.ts` | Modify | Bundle regex `@{bundle:name}` |
| `src/lib/__tests__/placeholder.test.ts` | Modify | Slot tests |
| `src/lib/__tests__/bundle.test.ts` | Modify | Bundle tests |
| `src/components/prompt-editor/placeholder-highlight.ts` | Modify | Slot highlight regex |
| `src/components/prompt-editor/bundle-highlight.ts` | Modify | Bundle highlight regex |
| `src/components/prompt-editor/invalid-ref-highlight.ts` | Create | Error highlight for `@{name}` without prefix |
| `src/components/prompt-editor/bundle-completion.ts` | Rewrite | Unified autocomplete (slot + bundle + danbooru) |
| `src/components/prompt-editor/danbooru-completion.ts` | Modify | Export `searchTags` for unified autocomplete |
| `src/components/prompt-editor/bundle-tooltip.ts` | Modify | Bundle tooltip regex |
| `src/components/prompt-editor/prompt-editor.tsx` | Modify | Wire new plugins, add `slotNames` prop |
| `src/components/prompt-editor/theme.ts` | Modify | Add invalid-ref CSS |
| `src/components/workspace/prompt-panel.tsx` | Modify | Display + pass slotNames |
| `src/components/workspace/placeholder-editor.tsx` | Modify | Display strings |
| `src/components/workspace/scene-detail.tsx` | Modify | Display strings |
| `src/components/workspace/scene-pack-dialog.tsx` | Modify | Display strings |
| `src/components/onboarding/onboarding-overlay.tsx` | Modify | Validation regex |
| `src/server/services/prompt.ts` | Modify | Comment |
| `src/lib/i18n/en.ts` | Modify | Translation strings |
| `src/lib/i18n/ko.ts` | Modify | Translation strings |
| `src/server/db/migrate-syntax.ts` | Create | Data migration script |
| `.claude/CLAUDE.md` | Modify | Docs |
| `README.md` | Modify | Docs |

---

### Task 1: Core — Update placeholder.ts regex and tests (TDD)

**Files:**
- Modify: `src/lib/placeholder.ts`
- Modify: `src/lib/__tests__/placeholder.test.ts`

- [ ] **Step 1: Update tests to use new `@{slot:name}` syntax**

Replace the entire content of `src/lib/__tests__/placeholder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { extractPlaceholders, resolvePlaceholders } from '../placeholder'

describe('extractPlaceholders', () => {
  it('extracts single placeholder', () => {
    expect(extractPlaceholders('hello @{slot:expression}')).toEqual([
      'expression',
    ])
  })

  it('extracts multiple placeholders', () => {
    const result = extractPlaceholders(
      '@{slot:pose}, @{slot:expression}, @{slot:background}',
    )
    expect(result).toEqual(['pose', 'expression', 'background'])
  })

  it('deduplicates repeated placeholders', () => {
    const result = extractPlaceholders('@{slot:pose} and @{slot:pose}')
    expect(result).toEqual(['pose'])
  })

  it('returns empty array when no placeholders', () => {
    expect(extractPlaceholders('no placeholders here')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractPlaceholders('')).toEqual([])
  })

  it('handles placeholders with underscores', () => {
    expect(extractPlaceholders('@{slot:hair_color}')).toEqual(['hair_color'])
  })

  it('handles placeholders with digits', () => {
    expect(extractPlaceholders('@{slot:slot1} @{slot:slot2}')).toEqual([
      'slot1',
      'slot2',
    ])
  })

  it('ignores malformed placeholders (missing closing)', () => {
    expect(extractPlaceholders('@{slot:open')).toEqual([])
  })

  it('handles placeholders adjacent to text', () => {
    expect(extractPlaceholders('text@{slot:key}more')).toEqual(['key'])
  })

  it('does not match bundle references', () => {
    expect(extractPlaceholders('@{bundle:quality}')).toEqual([])
  })

  it('does not match unprefixed references', () => {
    expect(extractPlaceholders('@{expression}')).toEqual([])
  })
})

describe('resolvePlaceholders', () => {
  it('resolves a single placeholder', () => {
    expect(
      resolvePlaceholders('@{slot:expression}', { expression: 'smiling' }),
    ).toBe('smiling')
  })

  it('resolves multiple placeholders', () => {
    const result = resolvePlaceholders('@{slot:pose}, @{slot:expression}', {
      pose: 'standing',
      expression: 'happy',
    })
    expect(result).toBe('standing, happy')
  })

  it('replaces unmatched placeholders with empty string', () => {
    expect(resolvePlaceholders('@{slot:missing}', {})).toBe('')
  })

  it('preserves surrounding text', () => {
    expect(
      resolvePlaceholders('1girl, @{slot:pose}, best quality', {
        pose: 'sitting',
      }),
    ).toBe('1girl, sitting, best quality')
  })

  it('resolves same placeholder multiple times', () => {
    expect(
      resolvePlaceholders('@{slot:x} and @{slot:x}', { x: 'yes' }),
    ).toBe('yes and yes')
  })

  it('handles empty values', () => {
    expect(resolvePlaceholders('@{slot:a}', { a: '' })).toBe('')
  })

  it('returns original string when no placeholders', () => {
    expect(resolvePlaceholders('no change', { key: 'val' })).toBe('no change')
  })

  it('returns empty string for empty template', () => {
    expect(resolvePlaceholders('', { key: 'val' })).toBe('')
  })

  it('does not resolve bundle references', () => {
    expect(
      resolvePlaceholders('@{bundle:quality}', { quality: 'best' }),
    ).toBe('@{bundle:quality}')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/__tests__/placeholder.test.ts`
Expected: Multiple failures (old regex doesn't match new syntax).

- [ ] **Step 3: Update placeholder.ts**

Replace the content of `src/lib/placeholder.ts`:

```typescript
const SLOT_RE = /@\{slot:([^}]+)\}/g

export function extractPlaceholders(template: string): Array<string> {
  const keys = new Set<string>()
  for (const match of template.matchAll(SLOT_RE)) {
    keys.add(match[1])
  }
  return [...keys]
}

export function resolvePlaceholders(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(SLOT_RE, (_, key) => values[key] ?? '')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/__tests__/placeholder.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/placeholder.ts src/lib/__tests__/placeholder.test.ts
git commit -m "feat: migrate placeholder syntax from \\\\name\\\\ to @{slot:name}"
```

---

### Task 2: Core — Update bundle.ts regex and tests (TDD)

**Files:**
- Modify: `src/lib/bundle.ts`
- Modify: `src/lib/__tests__/bundle.test.ts`

- [ ] **Step 1: Update tests to use new `@{bundle:name}` syntax**

Replace the entire content of `src/lib/__tests__/bundle.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { extractBundleReferences, resolveBundles } from '../bundle'

describe('extractBundleReferences', () => {
  it('extracts single bundle reference', () => {
    expect(extractBundleReferences('use @{bundle:quality}')).toEqual([
      'quality',
    ])
  })

  it('extracts multiple bundle references', () => {
    const result = extractBundleReferences(
      '@{bundle:quality}, @{bundle:style}',
    )
    expect(result).toEqual(['quality', 'style'])
  })

  it('deduplicates repeated references', () => {
    expect(
      extractBundleReferences('@{bundle:a} and @{bundle:a}'),
    ).toEqual(['a'])
  })

  it('returns empty array when no references', () => {
    expect(extractBundleReferences('no bundles')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(extractBundleReferences('')).toEqual([])
  })

  it('handles references with spaces in name', () => {
    expect(extractBundleReferences('@{bundle:my bundle}')).toEqual([
      'my bundle',
    ])
  })

  it('handles references with special characters', () => {
    expect(extractBundleReferences('@{bundle:quality-v2}')).toEqual([
      'quality-v2',
    ])
  })

  it('does not match empty braces', () => {
    expect(extractBundleReferences('@{bundle:}')).toEqual([])
  })

  it('handles references adjacent to text', () => {
    expect(extractBundleReferences('prefix@{bundle:name}suffix')).toEqual([
      'name',
    ])
  })

  it('does not match slot references', () => {
    expect(extractBundleReferences('@{slot:expression}')).toEqual([])
  })

  it('does not match unprefixed references', () => {
    expect(extractBundleReferences('@{quality}')).toEqual([])
  })
})

describe('resolveBundles', () => {
  it('resolves a single bundle', () => {
    expect(
      resolveBundles('@{bundle:quality}', {
        quality: 'masterpiece, best quality',
      }),
    ).toBe('masterpiece, best quality')
  })

  it('resolves multiple bundles', () => {
    const result = resolveBundles('@{bundle:quality}, @{bundle:style}', {
      quality: 'masterpiece',
      style: 'anime',
    })
    expect(result).toBe('masterpiece, anime')
  })

  it('replaces unmatched bundles with empty string', () => {
    expect(resolveBundles('@{bundle:missing}', {})).toBe('')
  })

  it('preserves surrounding text', () => {
    expect(
      resolveBundles('1girl, @{bundle:pose}, outdoor', { pose: 'standing' }),
    ).toBe('1girl, standing, outdoor')
  })

  it('resolves same bundle multiple times', () => {
    expect(
      resolveBundles('@{bundle:x} @{bundle:x}', { x: 'val' }),
    ).toBe('val val')
  })

  it('returns original string when no bundles', () => {
    expect(resolveBundles('no change', { key: 'val' })).toBe('no change')
  })

  it('does not resolve slot references', () => {
    expect(
      resolveBundles('@{slot:expression}', { expression: 'smile' }),
    ).toBe('@{slot:expression}')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/__tests__/bundle.test.ts`
Expected: Multiple failures.

- [ ] **Step 3: Update bundle.ts**

Replace the content of `src/lib/bundle.ts`:

```typescript
const BUNDLE_RE = /@\{bundle:([^}]+)\}/g

export function extractBundleReferences(template: string): Array<string> {
  const names = new Set<string>()
  for (const match of template.matchAll(BUNDLE_RE)) {
    if (match[1]) names.add(match[1])
  }
  return [...names]
}

export function resolveBundles(
  template: string,
  bundleMap: Record<string, string>,
): string {
  return template.replace(BUNDLE_RE, (_, name) => bundleMap[name] ?? '')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/__tests__/bundle.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bundle.ts src/lib/__tests__/bundle.test.ts
git commit -m "feat: migrate bundle syntax from @{name} to @{bundle:name}"
```

---

### Task 3: CodeMirror — Update highlight plugins and add invalid-ref highlight

**Files:**
- Modify: `src/components/prompt-editor/placeholder-highlight.ts`
- Modify: `src/components/prompt-editor/bundle-highlight.ts`
- Create: `src/components/prompt-editor/invalid-ref-highlight.ts`
- Modify: `src/components/prompt-editor/theme.ts`
- Modify: `src/components/prompt-editor/prompt-editor.tsx`

- [ ] **Step 1: Update placeholder-highlight.ts regex**

In `src/components/prompt-editor/placeholder-highlight.ts`, change line 9:

```typescript
  const re = /\\\\\w+\\\\/g
```

to:

```typescript
  const re = /@\{slot:[^}]+\}/g
```

- [ ] **Step 2: Update bundle-highlight.ts regex**

In `src/components/prompt-editor/bundle-highlight.ts`, change line 9:

```typescript
  const re = /@\{[^}]+\}/g
```

to:

```typescript
  const re = /@\{bundle:[^}]+\}/g
```

- [ ] **Step 3: Create invalid-ref-highlight.ts**

Create `src/components/prompt-editor/invalid-ref-highlight.ts`:

```typescript
import { Decoration, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

const invalidRefDeco = Decoration.mark({ class: 'cm-invalid-ref-highlight' })

function findInvalidRefs(doc: { toString: () => string }) {
  const decorations: Array<{ from: number; to: number }> = []
  const text = doc.toString()
  const re = /@\{(?!slot:|bundle:)[^}]+\}/g
  let match
  while ((match = re.exec(text)) !== null) {
    decorations.push({ from: match.index, to: match.index + match[0].length })
  }
  return decorations
}

export const invalidRefHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: { state: { doc: { toString: () => string } } }) {
      this.decorations = Decoration.set(
        findInvalidRefs(view.state.doc).map((d) =>
          invalidRefDeco.range(d.from, d.to),
        ),
      )
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = Decoration.set(
          findInvalidRefs(update.state.doc).map((d) =>
            invalidRefDeco.range(d.from, d.to),
          ),
        )
      }
    }
  },
  { decorations: (v) => v.decorations },
)
```

- [ ] **Step 4: Add invalid-ref CSS to theme.ts**

In `src/components/prompt-editor/theme.ts`, in the `darkTheme` styles (after the `.cm-bundle-highlight` block around line 52), add:

```typescript
    // Invalid reference highlight — red error
    '.cm-invalid-ref-highlight': {
      textDecoration: 'wavy underline oklch(0.65 0.2 25)',
      textDecorationSkipInk: 'none',
      backgroundColor: 'oklch(0.65 0.2 25 / 8%)',
      borderRadius: '3px',
    },
```

In the `lightTheme` styles (after the `.cm-bundle-highlight` block around line 154), add:

```typescript
    '.cm-invalid-ref-highlight': {
      textDecoration: 'wavy underline oklch(0.55 0.2 25)',
      textDecorationSkipInk: 'none',
      backgroundColor: 'oklch(0.55 0.2 25 / 8%)',
      borderRadius: '3px',
    },
```

- [ ] **Step 5: Wire invalid-ref-highlight into prompt-editor.tsx**

In `src/components/prompt-editor/prompt-editor.tsx`, add the import:

```typescript
import { invalidRefHighlight } from './invalid-ref-highlight'
```

In the `extensions` array (around line 81), after `weightHighlight`, add:

```typescript
        invalidRefHighlight,
```

- [ ] **Step 6: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/prompt-editor/placeholder-highlight.ts src/components/prompt-editor/bundle-highlight.ts src/components/prompt-editor/invalid-ref-highlight.ts src/components/prompt-editor/theme.ts src/components/prompt-editor/prompt-editor.tsx
git commit -m "feat: update highlight plugins for @{slot:} @{bundle:} and add invalid-ref error highlight"
```

---

### Task 4: CodeMirror — Unified autocomplete and tooltip

**Files:**
- Modify: `src/components/prompt-editor/bundle-completion.ts` (rewrite)
- Modify: `src/components/prompt-editor/danbooru-completion.ts` (export searchTags)
- Modify: `src/components/prompt-editor/bundle-tooltip.ts`
- Modify: `src/components/prompt-editor/prompt-editor.tsx`

- [ ] **Step 1: Export searchTags from danbooru-completion.ts**

In `src/components/prompt-editor/danbooru-completion.ts`, change `function searchTags` (line 25) from a local function to an exported function:

```typescript
export function searchTags(query: string, limit = 15): Array<Completion> {
```

- [ ] **Step 2: Rewrite bundle-completion.ts as unified autocomplete**

Replace the entire content of `src/components/prompt-editor/bundle-completion.ts`:

```typescript
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'
import { searchTags } from './danbooru-completion'

// Module-level cache, updated externally
let bundleNames: Array<{ name: string; content: string }> = []
let slotNames: Array<string> = []

export function setBundleNames(
  names: Array<{ name: string; content: string }>,
) {
  bundleNames = names
}

export function getBundleNames(): Array<{ name: string; content: string }> {
  return bundleNames
}

export function setSlotNames(names: Array<string>) {
  slotNames = names
}

function slotCompletions(query: string): Array<Completion> {
  return slotNames
    .filter((n) => !query || n.toLowerCase().includes(query))
    .slice(0, 10)
    .map((name) => ({
      label: name,
      detail: 'slot',
      type: 'property',
      apply: `@{slot:${name}}`,
      boost: 2,
    }))
}

function bundleCompletions(query: string): Array<Completion> {
  return bundleNames
    .filter((b) => !query || b.name.toLowerCase().includes(query))
    .slice(0, 10)
    .map((b) => ({
      label: b.name,
      detail: b.content.length > 30 ? b.content.slice(0, 30) + '...' : b.content,
      type: 'variable',
      apply: `@{bundle:${b.name}}`,
      boost: 1,
    }))
}

export function unifiedCompletion(
  context: CompletionContext,
): CompletionResult | null {
  const beforeCursor = context.state.sliceDoc(0, context.pos)

  // ── Mode 1: Inside @{ ... } ──
  const openIdx = beforeCursor.lastIndexOf('@{')
  if (openIdx >= 0) {
    const afterOpen = beforeCursor.slice(openIdx + 2)
    if (!afterOpen.includes('}')) {
      const from = openIdx + 2
      const query = afterOpen.toLowerCase()

      // Already typed "slot:" prefix
      if (query.startsWith('slot:')) {
        const nameQuery = query.slice(5)
        const options: Array<Completion> = slotNames
          .filter((n) => !nameQuery || n.toLowerCase().includes(nameQuery))
          .slice(0, 15)
          .map((name) => ({
            label: `slot:${name}`,
            detail: 'slot',
            type: 'property',
            apply: `slot:${name}}`,
          }))
        return options.length > 0 ? { from, options, validFor: /^[^}]*$/ } : null
      }

      // Already typed "bundle:" prefix
      if (query.startsWith('bundle:')) {
        const nameQuery = query.slice(7)
        const options: Array<Completion> = bundleNames
          .filter((b) => !nameQuery || b.name.toLowerCase().includes(nameQuery))
          .slice(0, 15)
          .map((b) => ({
            label: `bundle:${b.name}`,
            detail:
              b.content.length > 30
                ? b.content.slice(0, 30) + '...'
                : b.content,
            type: 'variable',
            apply: `bundle:${b.name}}`,
          }))
        return options.length > 0 ? { from, options, validFor: /^[^}]*$/ } : null
      }

      // No prefix yet — show both slot: and bundle: options
      const options: Array<Completion> = [
        ...slotNames
          .filter((n) => !query || n.toLowerCase().includes(query) || 'slot:'.includes(query))
          .slice(0, 8)
          .map((name) => ({
            label: `slot:${name}`,
            detail: 'slot',
            type: 'property' as const,
            apply: `slot:${name}}`,
            boost: 2,
          })),
        ...bundleNames
          .filter((b) => !query || b.name.toLowerCase().includes(query) || 'bundle:'.includes(query))
          .slice(0, 8)
          .map((b) => ({
            label: `bundle:${b.name}`,
            detail:
              b.content.length > 30
                ? b.content.slice(0, 30) + '...'
                : b.content,
            type: 'variable' as const,
            apply: `bundle:${b.name}}`,
            boost: 1,
          })),
      ]

      return options.length > 0 ? { from, options, validFor: /^[^}]*$/ } : null
    }
  }

  // ── Mode 2: General text (after comma, 2+ chars) ──
  const lastComma = beforeCursor.lastIndexOf(',')
  const afterComma = beforeCursor.slice(lastComma + 1).trimStart()

  if (afterComma.length < 2) return null

  // Don't trigger if we're inside @{...}
  if (afterComma.includes('@{')) return null

  const from = context.pos - afterComma.length
  const query = afterComma.toLowerCase()

  const slots = slotCompletions(query)
  const bundles = bundleCompletions(query)
  const tags = searchTags(afterComma, 10)

  const options = [...slots, ...bundles, ...tags]

  if (options.length === 0) return null

  return {
    from,
    options,
    validFor: /^[^\s,]*$/,
  }
}
```

- [ ] **Step 3: Update prompt-editor.tsx to use unified autocomplete and slotNames**

In `src/components/prompt-editor/prompt-editor.tsx`:

Update the import from bundle-completion:

```typescript
import { setBundleNames, setSlotNames, unifiedCompletion } from './bundle-completion'
```

Remove the import of `danbooruCompletion` (keep `loadTagDatabase`):

```typescript
import { loadTagDatabase } from './danbooru-completion'
```

Update the `PromptEditorProps` interface to add `slotNames`:

```typescript
interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  minHeight?: string
  bundleNames?: Array<{ name: string; content: string }>
  slotNames?: Array<string>
}
```

Update the component destructuring:

```typescript
export function PromptEditor({
  value,
  onChange,
  placeholder,
  minHeight = '200px',
  bundleNames: bundleNamesProp,
  slotNames: slotNamesProp,
}: PromptEditorProps) {
```

Add effect for slotNames (after the bundleNames effect):

```typescript
  useEffect(() => {
    if (slotNamesProp) {
      setSlotNames(slotNamesProp)
    }
  }, [slotNamesProp])
```

Update the `autocompletion` override:

```typescript
        autocompletion({
          override: [unifiedCompletion],
          activateOnTyping: true,
        }),
```

- [ ] **Step 4: Update bundle-tooltip.ts regex**

In `src/components/prompt-editor/bundle-tooltip.ts`, change line 4:

```typescript
const BUNDLE_RE = /@\{([^}]+)\}/g
```

to:

```typescript
const BUNDLE_RE = /@\{bundle:([^}]+)\}/g
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/prompt-editor/bundle-completion.ts src/components/prompt-editor/danbooru-completion.ts src/components/prompt-editor/bundle-tooltip.ts src/components/prompt-editor/prompt-editor.tsx
git commit -m "feat: unified autocomplete (slot + bundle + danbooru) and update tooltip regex"
```

---

### Task 5: Workspace UI — Pass slotNames to PromptEditor and update display strings

**Files:**
- Modify: `src/components/workspace/prompt-panel.tsx`
- Modify: `src/components/workspace/placeholder-editor.tsx`
- Modify: `src/components/workspace/scene-detail.tsx`
- Modify: `src/components/workspace/scene-pack-dialog.tsx`

- [ ] **Step 1: Update prompt-panel.tsx — pass slotNames and update display**

In `src/components/workspace/prompt-panel.tsx`, update the `LazyPromptEditor` props type (around line 44) to include `slotNames`:

```typescript
function LazyPromptEditor(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: string
  bundleNames?: Array<{ name: string; content: string }>
  slotNames?: Array<string>
}) {
```

In both `<LazyPromptEditor>` usages (around lines 456 and 502), add the `slotNames` prop. The slot names are already computed as `promptPlaceholders` and `negativePlaceholders`. Combine all unique slot names from the project:

After the `negativePlaceholders` memo (around line 227), add:

```typescript
  const allSlotNames = useMemo(
    () => [...new Set([...promptPlaceholders, ...negativePlaceholders])],
    [promptPlaceholders, negativePlaceholders],
  )
```

Then pass to both editors:

```typescript
              <LazyPromptEditor
                ...
                slotNames={allSlotNames}
              />
```

Update the 2 display strings (lines 479 and 524) from `{`\\\\${p}\\\\`}` to:

```typescript
                    {`@{slot:${p}}`}
```

- [ ] **Step 2: Update placeholder-editor.tsx — 5 display strings**

In `src/components/workspace/placeholder-editor.tsx`, replace all 5 occurrences of `` `\\\\${key}\\\\` `` and `` `\\\\${expandTarget.key}\\\\` `` with:

- Lines 719, 764, 834, 907: `{`\\\\${key}\\\\`}` → `{`@{slot:${key}}`}`
- Line 1133: `{`\\\\${expandTarget.key}\\\\`}` → `{`@{slot:${expandTarget.key}}`}`

Use `replace_all` with:
- old: `` `\\\\${key}\\\\` ``  → new: `` `@{slot:${key}}` ``
- old: `` `\\\\${expandTarget.key}\\\\` `` → new: `` `@{slot:${expandTarget.key}}` ``

- [ ] **Step 3: Update scene-detail.tsx — 2 display strings**

In `src/components/workspace/scene-detail.tsx`, replace both occurrences (lines 458 and 504):

- old: `` `\\\\${key}\\\\` `` → new: `` `@{slot:${key}}` ``

- [ ] **Step 4: Update scene-pack-dialog.tsx — 3 display strings**

In `src/components/workspace/scene-pack-dialog.tsx`, replace all 3 occurrences:

- Lines 642, 807: `` `\\\\${k}\\\\` `` or `` `\\\\${key}\\\\` `` → `` `@{slot:${k}}` `` or `` `@{slot:${key}}` ``
- Line 860: `` `\\\\${expandKey}\\\\` `` → `` `@{slot:${expandKey}}` ``

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/workspace/prompt-panel.tsx src/components/workspace/placeholder-editor.tsx src/components/workspace/scene-detail.tsx src/components/workspace/scene-pack-dialog.tsx
git commit -m "feat: update workspace UI display strings to @{slot:name} syntax"
```

---

### Task 6: Onboarding, i18n, server comment

**Files:**
- Modify: `src/components/onboarding/onboarding-overlay.tsx`
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/ko.ts`
- Modify: `src/server/services/prompt.ts`

- [ ] **Step 1: Update onboarding validation regex**

In `src/components/onboarding/onboarding-overlay.tsx`, line 17, change:

```typescript
      return /\\\\.+?\\\\/.test(text)
```

to:

```typescript
      return /@\{slot:.+?\}/.test(text)
```

- [ ] **Step 2: Update English i18n strings**

In `src/lib/i18n/en.ts`, replace these 5 strings:

Line 263: `'Enter general prompt with \\\\placeholders\\\\...'`
→ `'Enter general prompt with @{slot:placeholders}...'`

Line 264: `'{{name}} prompt with \\\\placeholders\\\\...'`
→ `'{{name}} prompt with @{slot:placeholders}...'`

Line 475: `'Add \\\\placeholders\\\\ to your prompts to create key slots.'`
→ `'Add @{slot:name} to your prompts to create key slots.'`

Line 631: `'Write your image generation prompt. Use \\\\placeholder\\\\ syntax to create variable slots that can change per scene. For example: "1girl, \\\\expression\\\\, \\\\background\\\\"'`
→ `'Write your image generation prompt. Use @{slot:name} syntax to create variable slots that can change per scene. For example: "1girl, @{slot:expression}, @{slot:background}"'`

Line 646: `'Fill in the placeholder values for your scene. These values replace the \\\\placeholders\\\\ in your prompt.'`
→ `'Fill in the placeholder values for your scene. These values replace the @{slot:name} references in your prompt.'`

- [ ] **Step 3: Update Korean i18n strings**

In `src/lib/i18n/ko.ts`, replace these 5 strings:

Line 268: `'\\\\placeholders\\\\를 포함한 일반 프롬프트를 입력하세요...'`
→ `'@{slot:placeholders}를 포함한 일반 프롬프트를 입력하세요...'`

Line 270: `'{{name}} 프롬프트 (\\\\placeholders\\\\ 사용 가능)...'`
→ `'{{name}} 프롬프트 (@{slot:placeholders} 사용 가능)...'`

Line 483: `'프롬프트에 \\\\placeholders\\\\를 추가하여 키 슬롯을 만드세요.'`
→ `'프롬프트에 @{slot:name}를 추가하여 키 슬롯을 만드세요.'`

Line 640: `'이미지 생성 프롬프트를 작성하세요. \\\\placeholder\\\\ 구문을 사용하여 씬마다 변경되는 변수 슬롯을 만들 수 있습니다. 예: "1girl, \\\\expression\\\\, \\\\background\\\\"'`
→ `'이미지 생성 프롬프트를 작성하세요. @{slot:name} 구문을 사용하여 씬마다 변경되는 변수 슬롯을 만들 수 있습니다. 예: "1girl, @{slot:expression}, @{slot:background}"'`

Line 655: `'씬의 플레이스홀더 값을 입력하세요. 이 값들이 프롬프트의 \\\\placeholders\\\\를 대체합니다.'`
→ `'씬의 플레이스홀더 값을 입력하세요. 이 값들이 프롬프트의 @{slot:name}를 대체합니다.'`

- [ ] **Step 4: Update server comment**

In `src/server/services/prompt.ts`, line 84, change:

```typescript
  // 1) Resolve @{bundles} first, then \\placeholders\\
```

to:

```typescript
  // 1) Resolve @{bundle:...} first, then @{slot:...}
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/onboarding-overlay.tsx src/lib/i18n/en.ts src/lib/i18n/ko.ts src/server/services/prompt.ts
git commit -m "feat: update onboarding, i18n, and server comments for unified syntax"
```

---

### Task 7: Data migration script

**Files:**
- Create: `src/server/db/migrate-syntax.ts`

This script migrates existing DB data from old syntax to new syntax. It runs as a one-time script after the code changes.

- [ ] **Step 1: Create migrate-syntax.ts**

Create `src/server/db/migrate-syntax.ts`:

```typescript
/**
 * One-time data migration: old placeholder/bundle syntax → new unified syntax.
 *
 * Placeholder: \\\\name\\\\ → @{slot:name}
 * Bundle: @{name} → @{bundle:name}  (only for refs NOT already prefixed)
 *
 * Run: npx tsx src/server/db/migrate-syntax.ts
 */

import Database from 'better-sqlite3'
import { resolve } from 'path'

const DB_PATH = resolve(process.cwd(), 'data/studio.db')

const LEGACY_PLACEHOLDER_RE = /\\\\(\w+)\\\\/g
const LEGACY_BUNDLE_RE = /@\{(?!slot:|bundle:)([^}]+)\}/g

function migratePlaceholders(text: string): string {
  return text.replace(LEGACY_PLACEHOLDER_RE, (_, name) => `@{slot:${name}}`)
}

function migrateBundleRefs(text: string): string {
  return text.replace(LEGACY_BUNDLE_RE, (_, name) => `@{bundle:${name}}`)
}

function migrateText(text: string): string {
  // Order matters: placeholders first (they use \\), then bundles (they use @{})
  return migrateBundleRefs(migratePlaceholders(text))
}

function migrateJsonValues(json: string): string {
  if (!json || json === '{}') return json
  try {
    const obj = JSON.parse(json) as Record<string, string>
    const migrated: Record<string, string> = {}
    for (const [key, value] of Object.entries(obj)) {
      migrated[key] = typeof value === 'string' ? migrateText(value) : value
    }
    return JSON.stringify(migrated)
  } catch {
    return json
  }
}

function main() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  let totalUpdated = 0

  // ── Text columns (prompt fields) ──
  const textColumns = [
    { table: 'projects', columns: ['general_prompt', 'negative_prompt'] },
    { table: 'characters', columns: ['char_prompt', 'char_negative'] },
    { table: 'prompt_bundles', columns: ['content'] },
  ]

  for (const { table, columns } of textColumns) {
    const rows = db.prepare(`SELECT id, ${columns.join(', ')} FROM ${table}`).all() as Array<Record<string, any>>
    for (const row of rows) {
      const updates: Record<string, string> = {}
      let changed = false
      for (const col of columns) {
        const original = row[col] ?? ''
        const migrated = migrateText(original)
        if (migrated !== original) {
          updates[col] = migrated
          changed = true
        }
      }
      if (changed) {
        const setClauses = Object.keys(updates).map((c) => `${c} = ?`).join(', ')
        const values = Object.values(updates)
        db.prepare(`UPDATE ${table} SET ${setClauses} WHERE id = ?`).run(...values, row.id)
        totalUpdated++
      }
    }
  }

  // ── JSON columns (placeholder values) ──
  const jsonColumns = [
    { table: 'scenes', column: 'placeholders', pk: 'id' },
    { table: 'project_scenes', column: 'placeholders', pk: 'id' },
    { table: 'character_scene_overrides', column: 'placeholders', pk: 'id' },
  ]

  for (const { table, column, pk } of jsonColumns) {
    const rows = db.prepare(`SELECT ${pk}, ${column} FROM ${table}`).all() as Array<Record<string, any>>
    for (const row of rows) {
      const original = row[column] ?? '{}'
      const migrated = migrateJsonValues(original)
      if (migrated !== original) {
        db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${pk} = ?`).run(migrated, row[pk])
        totalUpdated++
      }
    }
  }

  console.log(`Migration complete. ${totalUpdated} rows updated.`)
  db.close()
}

main()
```

- [ ] **Step 2: Run the migration**

Run: `npx tsx src/server/db/migrate-syntax.ts`
Expected: `Migration complete. N rows updated.` (N depends on existing data).

- [ ] **Step 3: Commit**

```bash
git add src/server/db/migrate-syntax.ts
git commit -m "feat: add one-time data migration script for unified reference syntax"
```

---

### Task 8: Update Bundles page — old @{name} references in autocomplete/display

**Files:**
- Modify: `src/routes/bundles/index.tsx`
- Modify: `src/lib/use-bundles.ts`

- [ ] **Step 1: Update usage hint in bundles page**

In `src/routes/bundles/index.tsx`, update the usage hint display (around line 580-581):

```typescript
                <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                  @{'{' + detail.name + '}'}
                </code>
```

Change to:

```typescript
                <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                  {'@{bundle:' + detail.name + '}'}
                </code>
```

- [ ] **Step 2: Update copy usage function**

In the same file, update `handleCopyUsage` (around line 273):

```typescript
  function handleCopyUsage(name: string) {
    navigator.clipboard.writeText(`@{${name}}`)
```

Change to:

```typescript
  function handleCopyUsage(name: string) {
    navigator.clipboard.writeText(`@{bundle:${name}}`)
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/routes/bundles/index.tsx
git commit -m "feat: update bundles page usage hint to @{bundle:name} syntax"
```

---

### Task 9: Update documentation

**Files:**
- Modify: `.claude/CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

Replace all occurrences of `\\placeholder\\` with `@{slot:placeholder}` in `.claude/CLAUDE.md`:

- Line 53: `` `\\placeholder\\` 구문 하이라이팅`` → `` `@{slot:name}` 구문 하이라이팅``
- Line 123: `` # \\placeholder\\ 하이라이팅`` → `` # @{slot:name} 하이라이팅``
- Line 172: `` # \\placeholder\\ 파싱/치환 유틸`` → `` # @{slot:name} 파싱/치환 유틸``
- Line 214: `` `\\placeholder\\` 형식의 플레이스홀더`` → `` `@{slot:name}` 형식의 플레이스홀더``
- Line 222: `` `\\placeholder\\` 사용 가능`` → `` `@{slot:name}` 사용 가능``
- Lines 301-302: `` `\\placeholder\\`를`` → `` `@{slot:name}`를``
- Line 305: Update nested placeholder note
- Line 373: `` `\\placeholder\\` 구문 하이라이팅`` → `` `@{slot:name}` 구문 하이라이팅``

Also update any `@{name}` bundle references to `@{bundle:name}` where applicable.

- [ ] **Step 2: Update README.md**

- Line 9: `` `\\placeholder\\` 구문으로`` → `` `@{slot:name}` 구문으로``
- Line 67: `` `\\placeholder\\` 추출/치환`` → `` `@{slot:name}` 추출/치환``

- [ ] **Step 3: Commit**

```bash
git add .claude/CLAUDE.md README.md
git commit -m "docs: update documentation for unified @{class:name} reference syntax"
```

---

### Task 10: Final verification

**Files:**
- All modified files

- [ ] **Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: No errors.

- [ ] **Step 3: Run linter**

Run: `pnpm lint`
Expected: No new lint errors.

- [ ] **Step 4: Verify no old syntax remains in source**

Run: `grep -r '\\\\\\\\' src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.test.ts'`
Expected: No results (old `\\\\name\\\\` syntax fully removed from source, may remain only in test files for legacy format testing if any).

- [ ] **Step 5: Browser verification**

Run: `pnpm dev`

Verify:
1. Open workspace, check prompt editor shows `@{slot:name}` with amber highlight
2. Check `@{bundle:name}` shows with teal highlight
3. Type `@{expression}` (no prefix) → red wavy underline
4. Type text after comma → autocomplete shows slots first, then bundles, then danbooru tags
5. Type `@{` → dropdown shows `slot:` and `bundle:` options
6. Go to bundles page → usage hint shows `@{bundle:name}`
7. Scene detail → placeholder labels show `@{slot:name}`

- [ ] **Step 6: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: unified reference syntax polish"
```
