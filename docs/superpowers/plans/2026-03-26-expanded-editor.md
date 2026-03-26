# Expanded Prompt Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expand-to-fullscreen button to each CodeMirror prompt editor, opening a near-fullscreen Dialog for comfortable multi-line editing.

**Architecture:** A new `ExpandedEditorDialog` component wraps `PromptEditor` inside a Radix UI Dialog. The `PromptPanel` gets expand buttons next to each editor label. Real-time sync via shared `value`/`onChange` props — no separate state management needed.

**Tech Stack:** React, Radix UI Dialog, CodeMirror 6 (existing PromptEditor), Hugeicons, Tailwind CSS, i18n

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/prompt-editor/expanded-editor-dialog.tsx` | Fullscreen Dialog wrapping PromptEditor |
| Modify | `src/components/workspace/prompt-panel.tsx` | Add expand buttons to each editor label row |
| Modify | `src/lib/i18n/en.ts` | Add `workspace.prompt.expand` key |
| Modify | `src/lib/i18n/ko.ts` | Add `workspace.prompt.expand` key |

---

### Task 1: Add i18n keys

**Files:**
- Modify: `src/lib/i18n/en.ts:258` (end of workspace section)
- Modify: `src/lib/i18n/ko.ts` (matching location in workspace section)

- [ ] **Step 1: Add English translation key**

In `src/lib/i18n/en.ts`, add `expandEditor` at the end of the `workspace` object, before the closing `}`:

```typescript
    charNegativePlaceholder: '{{name}} negative...',
    expandEditor: 'Expand editor',
  },
```

- [ ] **Step 2: Add Korean translation key**

In `src/lib/i18n/ko.ts`, add the matching key:

```typescript
    charNegativePlaceholder: '{{name}} 네거티브...',
    expandEditor: '에디터 확대',
  },
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to i18n keys (ko.ts type-checks against en.ts structure via `DeepStringify<typeof en>`)

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/ko.ts
git commit -m "feat: add i18n keys for expanded editor button"
```

---

### Task 2: Create ExpandedEditorDialog component

**Files:**
- Create: `src/components/prompt-editor/expanded-editor-dialog.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/prompt-editor/expanded-editor-dialog.tsx`:

```tsx
import { lazy, Suspense } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

interface ExpandedEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onChange: (value: string) => void
  bundleNames?: Array<{ name: string; content: string }>
}

export function ExpandedEditorDialog({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  bundleNames,
}: ExpandedEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex flex-col max-w-[calc(100%-2rem)] w-[90vw] h-[85vh] sm:max-w-[90vw] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:w-full max-sm:h-full max-sm:max-w-full max-sm:rounded-none"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden [&_.cm-editor]:!h-full [&_.cm-scroller]:!h-full [&_.cm-content]:!min-h-full">
          <Suspense
            fallback={
              <Textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="font-mono text-base h-full resize-none"
              />
            }
          >
            <PromptEditor
              value={value}
              onChange={onChange}
              minHeight="100%"
              bundleNames={bundleNames}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

Key design decisions:
- Dialog uses `flex flex-col` so the editor fills remaining space after the header
- `min-h-0 overflow-hidden` on the editor wrapper prevents flex children from overflowing
- CSS overrides `[&_.cm-editor]:!h-full` ensure CodeMirror fills the container height
- Mobile (`max-sm:`) gets fullscreen positioning with no rounded corners
- Desktop gets `90vw × 85vh`
- Lazy-loads PromptEditor with Textarea fallback (same pattern as PromptPanel)

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/prompt-editor/expanded-editor-dialog.tsx
git commit -m "feat: create ExpandedEditorDialog component"
```

---

### Task 3: Add expand buttons to PromptPanel

**Files:**
- Modify: `src/components/workspace/prompt-panel.tsx`

- [ ] **Step 1: Add imports**

At the top of `prompt-panel.tsx`, add the new imports:

```typescript
import { ArrowExpand01Icon } from '@hugeicons/core-free-icons'
```

And add the ExpandedEditorDialog import:

```typescript
import { ExpandedEditorDialog } from '@/components/prompt-editor/expanded-editor-dialog'
```

- [ ] **Step 2: Add expand state**

Inside the `PromptPanel` component function, after the existing state declarations (around line 92), add:

```typescript
  // Expanded editor dialog
  const [expandTarget, setExpandTarget] = useState<'prompt' | 'negative' | null>(null)
```

- [ ] **Step 3: Add expand buttons to label rows**

Replace the prompt editor label (around lines 371-374):

```tsx
            <Label className="text-sm text-muted-foreground uppercase tracking-wider">
              {isCharacterTab ? t('workspace.characterPrompt') : t('workspace.prompt')}
            </Label>
```

With:

```tsx
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground uppercase tracking-wider">
                {isCharacterTab ? t('workspace.characterPrompt') : t('workspace.prompt')}
              </Label>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setExpandTarget('prompt')}
                title={t('workspace.expandEditor')}
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" />
              </Button>
            </div>
```

Replace the negative prompt label (around lines 404-406):

```tsx
            <Label className="text-sm text-muted-foreground uppercase tracking-wider">
              {isCharacterTab ? t('workspace.charNegative') : t('workspace.negativePrompt')}
            </Label>
```

With:

```tsx
            <div className="flex items-center justify-between">
              <Label className="text-sm text-muted-foreground uppercase tracking-wider">
                {isCharacterTab ? t('workspace.charNegative') : t('workspace.negativePrompt')}
              </Label>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setExpandTarget('negative')}
                title={t('workspace.expandEditor')}
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" />
              </Button>
            </div>
```

- [ ] **Step 4: Add ExpandedEditorDialog at the end of the component**

Just before the closing `</div>` of the component's return (line 436), add:

```tsx
      <ExpandedEditorDialog
        open={expandTarget !== null}
        onOpenChange={(open) => { if (!open) setExpandTarget(null) }}
        title={
          expandTarget === 'prompt'
            ? (isCharacterTab ? t('workspace.characterPrompt') : t('workspace.prompt'))
            : (isCharacterTab ? t('workspace.charNegative') : t('workspace.negativePrompt'))
        }
        value={expandTarget === 'prompt' ? displayPrompt : displayNegative}
        onChange={expandTarget === 'prompt' ? handlePromptChange : handleNegativeChange}
        bundleNames={bundleNames}
      />
```

This reuses the existing `displayPrompt`/`displayNegative` values and `handlePromptChange`/`handleNegativeChange` handlers — the same ones the inline editors use. Real-time sync happens automatically.

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Manual verification**

Run: `cd /Users/user/project/snuff/87-studio && pnpm dev`

Test checklist:
1. Open a project workspace
2. Verify expand button visible next to "Prompt" and "Negative Prompt" labels
3. Click expand button → Dialog opens with near-fullscreen editor
4. Type in expanded editor → text appears in inline editor (behind dialog)
5. Close dialog → inline editor shows updated text
6. Switch to Character tab → expand buttons visible for character prompt/negative
7. Test on narrow viewport (mobile) → dialog goes fullscreen
8. Press ESC → dialog closes

- [ ] **Step 7: Commit**

```bash
git add src/components/workspace/prompt-panel.tsx
git commit -m "feat: add expand buttons to prompt editors in workspace"
```
