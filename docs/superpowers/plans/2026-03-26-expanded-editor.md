# Expanded Prompt Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expand-to-fullscreen button to all text editing fields — CodeMirror prompt editors and plain textareas — for comfortable multi-line editing.

**Architecture:** Two new dialog components: `ExpandedEditorDialog` (CodeMirror) and `ExpandedTextareaDialog` (plain textarea). Each text field gets an expand button in its label row. Real-time sync via shared `value`/`onChange` props.

**Tech Stack:** React, Radix UI Dialog, CodeMirror 6 (existing PromptEditor), Hugeicons, Tailwind CSS, i18n

---

## File Structure

| Action | File                                                      | Responsibility                                    |
| ------ | --------------------------------------------------------- | ------------------------------------------------- |
| Create | `src/components/prompt-editor/expanded-editor-dialog.tsx` | Fullscreen Dialog wrapping PromptEditor           |
| Create | `src/components/common/expanded-textarea-dialog.tsx`      | Fullscreen Dialog wrapping Textarea               |
| Modify | `src/components/workspace/prompt-panel.tsx`               | Add expand buttons to CodeMirror editors          |
| Modify | `src/components/workspace/placeholder-editor.tsx`         | Add expand buttons to placeholder textareas       |
| Modify | `src/components/workspace/scene-pack-dialog.tsx`          | Add expand button to scene placeholder textareas  |
| Modify | `src/components/common/image-detail-overlay.tsx`          | Add expand button to memo textarea                |
| Modify | `src/routes/gallery/$imageId.tsx`                         | Add expand button to memo textarea                |
| Modify | `src/routes/index.tsx`                                    | Add expand button to project description textarea |
| Modify | `src/lib/i18n/en.ts`                                      | Add i18n key                                      |
| Modify | `src/lib/i18n/ko.ts`                                      | Add i18n key                                      |

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
      <DialogContent className="flex flex-col max-w-[calc(100%-2rem)] w-[90vw] h-[85vh] sm:max-w-[90vw] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:w-full max-sm:h-full max-sm:max-w-full max-sm:rounded-none">
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
const [expandTarget, setExpandTarget] = useState<'prompt' | 'negative' | null>(
  null,
)
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
    {isCharacterTab
      ? t('workspace.charNegative')
      : t('workspace.negativePrompt')}
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
  onOpenChange={(open) => {
    if (!open) setExpandTarget(null)
  }}
  title={
    expandTarget === 'prompt'
      ? isCharacterTab
        ? t('workspace.characterPrompt')
        : t('workspace.prompt')
      : isCharacterTab
        ? t('workspace.charNegative')
        : t('workspace.negativePrompt')
  }
  value={expandTarget === 'prompt' ? displayPrompt : displayNegative}
  onChange={
    expandTarget === 'prompt' ? handlePromptChange : handleNegativeChange
  }
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

---

### Task 4: Create ExpandedTextareaDialog component

**Files:**

- Create: `src/components/common/expanded-textarea-dialog.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/common/expanded-textarea-dialog.tsx`:

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface ExpandedTextareaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onBlur?: () => void
}

export function ExpandedTextareaDialog({
  open,
  onOpenChange,
  title,
  value,
  onChange,
  placeholder,
  onBlur,
}: ExpandedTextareaDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && onBlur) onBlur()
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="flex flex-col max-w-[calc(100%-2rem)] w-[90vw] h-[85vh] sm:max-w-[90vw] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:w-full max-sm:h-full max-sm:max-w-full max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-h-0 text-base font-mono resize-none"
          autoFocus
        />
      </DialogContent>
    </Dialog>
  )
}
```

Key design decisions:

- Same Dialog sizing as ExpandedEditorDialog (90vw × 85vh, mobile fullscreen)
- `onBlur` callback fires when dialog closes — useful for memo fields that save on blur
- `flex-1 min-h-0 resize-none` makes Textarea fill the dialog body
- `autoFocus` for immediate editing

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/common/expanded-textarea-dialog.tsx
git commit -m "feat: create ExpandedTextareaDialog component"
```

---

### Task 5: Add expand buttons to PlaceholderEditor

**Files:**

- Modify: `src/components/workspace/placeholder-editor.tsx`

- [ ] **Step 1: Add imports**

At the top of `placeholder-editor.tsx`, add:

```typescript
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowExpand01Icon } from '@hugeicons/core-free-icons'
import { ExpandedTextareaDialog } from '@/components/common/expanded-textarea-dialog'
```

- [ ] **Step 2: Add expand state**

Inside the PlaceholderEditor component, after existing state declarations, add:

```typescript
// Expanded textarea dialog
const [expandTarget, setExpandTarget] = useState<{
  key: string
  owner: 'general' | number
} | null>(null)
```

- [ ] **Step 3: Add expand button to each textarea**

For every `<textarea>` in the component (there are 4 groups: unfilled general, unfilled character, filled general, filled character), add an expand button to the label row. The pattern for each is the same.

For each `<label>` that precedes a `<textarea>`, wrap the label content and add an expand button. Example for the unfilled general section (around line 524):

Replace:

```tsx
<label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
  <StatusDot filled={!!getCellValue(key, 'general')} />
  <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
    {`\\\\${key}\\\\`}
  </span>
</label>
```

With:

```tsx
<div className="flex items-center justify-between mb-1.5">
  <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
    <StatusDot filled={!!getCellValue(key, 'general')} />
    <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
      {`\\\\${key}\\\\`}
    </span>
  </label>
  <button
    type="button"
    onClick={() => setExpandTarget({ key, owner: 'general' })}
    className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
    title={t('workspace.expandEditor')}
  >
    <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
  </button>
</div>
```

Apply this same pattern to all 4 textarea groups:

1. Unfilled general (line ~524) — `owner: 'general'`
2. Unfilled character (line ~549) — `owner: charId`
3. Filled general (line ~598) — `owner: 'general'`
4. Filled character (line ~644) — `owner: charId`

Note: Remove `mb-1.5` from the `<label>` and put it on the wrapper `<div>` instead.

- [ ] **Step 4: Add ExpandedTextareaDialog**

At the end of the component's return JSX (before the final closing tags), add:

```tsx
<ExpandedTextareaDialog
  open={expandTarget !== null}
  onOpenChange={(open) => {
    if (!open) setExpandTarget(null)
  }}
  title={expandTarget ? `\\\\${expandTarget.key}\\\\` : ''}
  value={
    expandTarget
      ? typeof expandTarget.owner === 'number'
        ? getEffectiveCharValue(expandTarget.key, expandTarget.owner)
        : getCellValue(expandTarget.key, 'general')
      : ''
  }
  onChange={(val) => {
    if (expandTarget)
      handleCellChange(expandTarget.owner, expandTarget.key, val)
  }}
  placeholder={
    expandTarget ? t('scene.valueFor', { key: expandTarget.key }) : ''
  }
/>
```

Note: `getCellValue` handles general; `getEffectiveCharValue` handles character values. The `handleCellChange` handler already works for both general and character owners.

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/components/workspace/placeholder-editor.tsx
git commit -m "feat: add expand buttons to placeholder editor textareas"
```

---

### Task 6: Add expand buttons to remaining textarea fields

**Files:**

- Modify: `src/components/workspace/scene-pack-dialog.tsx`
- Modify: `src/components/common/image-detail-overlay.tsx`
- Modify: `src/routes/gallery/$imageId.tsx`
- Modify: `src/routes/index.tsx`

- [ ] **Step 1: ScenePackDialog — add expand button**

In `scene-pack-dialog.tsx`, add imports:

```typescript
import { ArrowExpand01Icon } from '@hugeicons/core-free-icons'
import { ExpandedTextareaDialog } from '@/components/common/expanded-textarea-dialog'
```

In the SceneEditPanel component inside scene-pack-dialog.tsx, add state:

```typescript
const [expandKey, setExpandKey] = useState<string | null>(null)
```

For each placeholder value `<Textarea>` (around line 732), add an expand button to the label span row. Replace the existing key-value row:

```tsx
            <div key={key} className="flex gap-2 items-start">
              <span className="text-sm font-mono text-muted-foreground min-w-20 sm:min-w-24 pt-2.5 shrink-0 inline-block rounded bg-secondary/60 px-2 py-1 text-center truncate">
                {`\\\\${key}\\\\`}
              </span>
              <Textarea
```

With:

```tsx
            <div key={key} className="flex gap-2 items-start">
              <span className="text-sm font-mono text-muted-foreground min-w-20 sm:min-w-24 pt-2.5 shrink-0 inline-block rounded bg-secondary/60 px-2 py-1 text-center truncate">
                {`\\\\${key}\\\\`}
              </span>
              <Textarea
```

Actually, a simpler approach: add an expand button after each Textarea:

After the `<Textarea ... />` for each key (line ~737), add:

```tsx
<button
  type="button"
  onClick={() => setExpandKey(key)}
  className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors mt-2 shrink-0"
  title={t('workspace.expandEditor')}
>
  <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
</button>
```

And add the dialog at the end of SceneEditPanel's return:

```tsx
<ExpandedTextareaDialog
  open={expandKey !== null}
  onOpenChange={(open) => {
    if (!open) setExpandKey(null)
  }}
  title={expandKey ? `\\\\${expandKey}\\\\` : ''}
  value={expandKey ? (values[expandKey] ?? '') : ''}
  onChange={(val) => {
    if (expandKey) handleValueChange(expandKey, val)
  }}
  placeholder={expandKey ? t('templates.valueForKey', { key: expandKey }) : ''}
/>
```

- [ ] **Step 2: image-detail-overlay.tsx — add expand button to memo**

Add imports:

```typescript
import { ArrowExpand01Icon } from '@hugeicons/core-free-icons'
import { ExpandedTextareaDialog } from '@/components/common/expanded-textarea-dialog'
```

Add state in the ImageDetailContent component:

```typescript
const [memoExpanded, setMemoExpanded] = useState(false)
```

Replace the memo label (line ~313):

```tsx
<label className="text-sm text-muted-foreground mb-1.5 block">
  {t('imageDetail.memo')}
</label>
```

With:

```tsx
<div className="flex items-center justify-between mb-1.5">
  <label className="text-sm text-muted-foreground">
    {t('imageDetail.memo')}
  </label>
  <button
    type="button"
    onClick={() => setMemoExpanded(true)}
    className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
    title={t('workspace.expandEditor')}
  >
    <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
  </button>
</div>
```

And add the dialog after the memo section:

```tsx
<ExpandedTextareaDialog
  open={memoExpanded}
  onOpenChange={setMemoExpanded}
  title={t('imageDetail.memo')}
  value={memo}
  onChange={setMemo}
  onBlur={handleSaveMemo}
  placeholder={t('imageDetail.addNote')}
/>
```

- [ ] **Step 3: gallery/$imageId.tsx — add expand button to memo**

Same pattern as Step 2. Add imports, state, expand button in label row, and dialog. The code is essentially identical since this route has the same memo field structure.

Add imports:

```typescript
import { ArrowExpand01Icon } from '@hugeicons/core-free-icons'
import { ExpandedTextareaDialog } from '@/components/common/expanded-textarea-dialog'
```

Add state:

```typescript
const [memoExpanded, setMemoExpanded] = useState(false)
```

Replace the memo label (line ~449-451):

```tsx
<label className="text-sm text-muted-foreground mb-1.5 block">
  {t('imageDetail.memo')}
</label>
```

With:

```tsx
<div className="flex items-center justify-between mb-1.5">
  <label className="text-sm text-muted-foreground">
    {t('imageDetail.memo')}
  </label>
  <button
    type="button"
    onClick={() => setMemoExpanded(true)}
    className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
    title={t('workspace.expandEditor')}
  >
    <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
  </button>
</div>
```

Add dialog after memo section:

```tsx
<ExpandedTextareaDialog
  open={memoExpanded}
  onOpenChange={setMemoExpanded}
  title={t('imageDetail.memo')}
  value={memo}
  onChange={setMemo}
  onBlur={handleSaveMemo}
  placeholder={t('imageDetail.addNote')}
/>
```

- [ ] **Step 4: routes/index.tsx — add expand button to project description**

Add imports:

```typescript
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowExpand01Icon } from '@hugeicons/core-free-icons'
import { ExpandedTextareaDialog } from '@/components/common/expanded-textarea-dialog'
```

Add state (inside the component that has the create project dialog):

```typescript
const [descExpanded, setDescExpanded] = useState(false)
```

Replace the description label (line ~411):

```tsx
<Label>{t('dashboard.descriptionOptional')}</Label>
```

With:

```tsx
<div className="flex items-center justify-between">
  <Label>{t('dashboard.descriptionOptional')}</Label>
  <button
    type="button"
    onClick={() => setDescExpanded(true)}
    className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
    title={t('workspace.expandEditor')}
  >
    <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
  </button>
</div>
```

Add dialog after the Textarea:

```tsx
<ExpandedTextareaDialog
  open={descExpanded}
  onOpenChange={setDescExpanded}
  title={t('dashboard.descriptionOptional')}
  value={description}
  onChange={setDescription}
  placeholder={t('dashboard.briefDescription')}
/>
```

- [ ] **Step 5: Verify TypeScript compilation**

Run: `cd /Users/user/project/snuff/87-studio && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Manual verification**

Run: `cd /Users/user/project/snuff/87-studio && pnpm dev`

Test checklist:

1. PlaceholderEditor: expand buttons visible next to each placeholder label, dialog opens/syncs
2. ScenePackDialog: expand button next to scene placeholder values
3. Image detail overlay: expand button next to memo label
4. Gallery image detail page: expand button next to memo label
5. Dashboard create project dialog: expand button next to description label
6. All dialogs close properly, values persist

- [ ] **Step 7: Commit**

```bash
git add src/components/workspace/scene-pack-dialog.tsx src/components/common/image-detail-overlay.tsx src/routes/gallery/\$imageId.tsx src/routes/index.tsx
git commit -m "feat: add expand buttons to all textarea fields"
```
