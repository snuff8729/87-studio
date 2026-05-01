# Bundle Tag System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tag system to Prompt Bundles for categorization and `#`-prefix tag-based filtering with autocomplete in the Bundles page search bar.

**Architecture:** Two new DB tables (`bundle_tags`, `bundle_tag_assignments`) with a junction pattern. Server functions for CRUD. UI changes to the Bundles page: tag chip input in the detail panel, and `#`-prefix autocomplete filtering in the existing search bar.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start server functions, React 19, shadcn/ui, Tailwind CSS 4, i18n system.

---

### Task 1: DB Schema — Add bundle tag tables

**Files:**
- Modify: `src/server/db/schema.ts:299-325` (after `promptBundles`, before `imageBundles`)

- [ ] **Step 1: Add `bundleTags` and `bundleTagAssignments` tables to schema**

Add these two table definitions in `src/server/db/schema.ts`, right after the `promptBundles` definition (line 308) and before `imageBundles` (line 311):

```typescript
// ─── Bundle Tags ───────────────────────────────────────────────────────────
export const bundleTags = sqliteTable('bundle_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

// ─── Bundle Tag Assignments (junction) ─────────────────────────────────────
export const bundleTagAssignments = sqliteTable(
  'bundle_tag_assignments',
  {
    bundleId: integer('bundle_id')
      .notNull()
      .references(() => promptBundles.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => bundleTags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.bundleId, table.tagId] }),
    index('bundle_tag_assignments_tag_id_idx').on(table.tagId),
  ],
)
```

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`
Expected: A new migration file `src/server/db/migrations/0012_*.sql` is created with `CREATE TABLE bundle_tags` and `CREATE TABLE bundle_tag_assignments`.

- [ ] **Step 3: Apply migration**

Run: `pnpm db:migrate`
Expected: Migration applied successfully, tables created in `data/studio.db`.

- [ ] **Step 4: Verify**

Run: `pnpm build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/db/migrations/
git commit -m "feat: add bundle_tags and bundle_tag_assignments tables"
```

---

### Task 2: Server Functions — `listBundleTags` and `setBundleTags`

**Files:**
- Modify: `src/server/functions/bundles.ts`

- [ ] **Step 1: Add imports for new schema tables**

In `src/server/functions/bundles.ts`, update the import from `'../db/schema'` to include the new tables:

```typescript
import {
  bundleTagAssignments,
  bundleTags,
  generatedImages,
  imageBundles,
  promptBundles,
} from '../db/schema'
```

Also add `inArray` and `notInArray` to the drizzle-orm import:

```typescript
import { asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
```

- [ ] **Step 2: Add `listBundleTags` server function**

Add after the existing `listBundleNames` function:

```typescript
export const listBundleTags = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db
      .select({ id: bundleTags.id, name: bundleTags.name })
      .from(bundleTags)
      .orderBy(asc(bundleTags.name))
      .all()
  },
)
```

- [ ] **Step 3: Add `setBundleTags` server function**

Add after `listBundleTags`:

```typescript
export const setBundleTags = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bundleId: number; tagNames: Array<string> }) => data,
  )
  .handler(async ({ data }) => {
    const { bundleId, tagNames } = data
    const normalizedNames = tagNames
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n.length > 0)

    // Remove duplicates
    const uniqueNames = [...new Set(normalizedNames)]

    // Delete existing assignments for this bundle
    db.delete(bundleTagAssignments)
      .where(eq(bundleTagAssignments.bundleId, bundleId))
      .run()

    if (uniqueNames.length > 0) {
      // Upsert tags — insert missing, get all IDs
      for (const name of uniqueNames) {
        db.insert(bundleTags)
          .values({ name })
          .onConflictDoNothing()
          .run()
      }

      const tagRows = db
        .select({ id: bundleTags.id, name: bundleTags.name })
        .from(bundleTags)
        .where(inArray(bundleTags.name, uniqueNames))
        .all()

      // Insert assignments
      for (const tag of tagRows) {
        db.insert(bundleTagAssignments)
          .values({ bundleId, tagId: tag.id })
          .run()
      }
    }

    // Clean up orphan tags (tags with no assignments)
    const usedTagIds = db
      .selectDistinct({ tagId: bundleTagAssignments.tagId })
      .from(bundleTagAssignments)
      .all()
      .map((r) => r.tagId)

    if (usedTagIds.length === 0) {
      db.delete(bundleTags).run()
    } else {
      db.delete(bundleTags)
        .where(notInArray(bundleTags.id, usedTagIds))
        .run()
    }

    log.info('setBundleTags', 'Bundle tags updated', {
      bundleId,
      tags: uniqueNames,
    })
    return { success: true }
  })
```

- [ ] **Step 4: Extend `listBundles` to include tags**

Replace the existing `listBundles` function with:

```typescript
export const listBundles = createServerFn({ method: 'GET' }).handler(
  async () => {
    const bundles = db
      .select()
      .from(promptBundles)
      .orderBy(asc(promptBundles.name))
      .all()

    return bundles.map((b) => {
      const count = db
        .select({ count: sql<number>`count(*)` })
        .from(imageBundles)
        .where(eq(imageBundles.bundleId, b.id))
        .get()

      let thumbnailPath: string | null = null
      if (b.thumbnailImageId) {
        const img = db
          .select({ thumbnailPath: generatedImages.thumbnailPath })
          .from(generatedImages)
          .where(eq(generatedImages.id, b.thumbnailImageId))
          .get()
        thumbnailPath = img?.thumbnailPath ?? null
      }

      const tags = db
        .select({ id: bundleTags.id, name: bundleTags.name })
        .from(bundleTagAssignments)
        .innerJoin(bundleTags, eq(bundleTagAssignments.tagId, bundleTags.id))
        .where(eq(bundleTagAssignments.bundleId, b.id))
        .orderBy(asc(bundleTags.name))
        .all()

      return { ...b, imageCount: count?.count ?? 0, thumbnailPath, tags }
    })
  },
)
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/functions/bundles.ts
git commit -m "feat: add listBundleTags, setBundleTags server functions and extend listBundles with tags"
```

---

### Task 3: i18n — Add bundle tag translation keys

**Files:**
- Modify: `src/lib/i18n/en.ts:573-600`
- Modify: `src/lib/i18n/ko.ts:581-609`

- [ ] **Step 1: Add English translations**

In `src/lib/i18n/en.ts`, inside the `bundles` object (after `usage` on line 599), add:

```typescript
    tags: 'Tags',
    tagsPlaceholder: 'Add tag...',
    tagAdded: 'Tag added',
    tagRemoved: 'Tag removed',
    searchByTag: 'Type # to filter by tag',
```

- [ ] **Step 2: Add Korean translations**

In `src/lib/i18n/ko.ts`, inside the `bundles` object (after `usage` on line 608), add:

```typescript
    tags: '태그',
    tagsPlaceholder: '태그 추가...',
    tagAdded: '태그가 추가되었습니다',
    tagRemoved: '태그가 제거되었습니다',
    searchByTag: '#을 입력하여 태그로 필터링',
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build succeeds, no TypeScript errors (translation keys type-check).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/ko.ts
git commit -m "feat: add bundle tag i18n keys (en, ko)"
```

---

### Task 4: UI — Tag input in Bundle detail panel

**Files:**
- Modify: `src/routes/bundles/index.tsx`

- [ ] **Step 1: Add imports and state for tags**

At the top of `src/routes/bundles/index.tsx`, add to the icon imports:

```typescript
import { Cancel01Icon } from '@hugeicons/core-free-icons'
```

Add the import for the new server functions:

```typescript
import {
  createBundle,
  deleteBundle,
  getBundle,
  listBundleImages,
  listBundles,
  listBundleTags,
  setBundleTags,
  setBundleThumbnail,
  updateBundle,
} from '@/server/functions/bundles'
```

- [ ] **Step 2: Add tag state and load logic in `BundlesPage`**

Inside the `BundlesPage` component, after the `bundleImages` state declaration (around line 108), add:

```typescript
  // Tag state
  const [allTags, setAllTags] = useState<Array<{ id: number; name: string }>>([])
  const [editTags, setEditTags] = useState<Array<string>>([])
  const [tagInput, setTagInput] = useState('')
  const tagSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
```

Add a function to load all tags, after `refreshList`:

```typescript
  const refreshTags = useCallback(async () => {
    const tags = await listBundleTags()
    setAllTags(tags)
  }, [])

  // Load all tags on mount
  useEffect(() => {
    refreshTags()
  }, [refreshTags])
```

In the `useEffect` that loads detail when `selectedId` changes (around line 115), after `setEditContent(d.content)`, add:

```typescript
      const bundleInList = bundles.find((b) => b.id === selectedId)
      setEditTags(bundleInList?.tags?.map((t: { name: string }) => t.name) ?? [])
      setTagInput('')
```

- [ ] **Step 3: Add tag save handler**

After the `handleContentChange` function, add:

```typescript
  function scheduleTagSave(tags: Array<string>) {
    if (tagSaveTimerRef.current) clearTimeout(tagSaveTimerRef.current)
    tagSaveTimerRef.current = setTimeout(async () => {
      if (!selectedId) return
      try {
        await setBundleTags({ data: { bundleId: selectedId, tagNames: tags } })
        refreshList()
        refreshTags()
      } catch {
        toast.error(t('bundles.updateFailed'))
      }
    }, 800)
  }
```

Also update the cleanup `useEffect` (around line 154) to also clear `tagSaveTimerRef`:

```typescript
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (tagSaveTimerRef.current) clearTimeout(tagSaveTimerRef.current)
    }
  }, [])
```

Add the tag add/remove handlers:

```typescript
  function handleAddTag(tagName: string) {
    const name = tagName.trim().toLowerCase()
    if (!name || editTags.includes(name)) return
    const next = [...editTags, name]
    setEditTags(next)
    setTagInput('')
    scheduleTagSave(next)
  }

  function handleRemoveTag(tagName: string) {
    const next = editTags.filter((t) => t !== tagName)
    setEditTags(next)
    scheduleTagSave(next)
  }
```

- [ ] **Step 4: Add tag input UI in the detail panel**

In the JSX, after the usage hint `<div>` (around line 413) and before the `<Separator />`, add the tag input section:

```tsx
              {/* Tags */}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">
                  {t('bundles.tags')}
                </Label>
                <div className="flex flex-wrap gap-1.5 items-center p-2 rounded-md border border-border bg-background min-h-[38px]">
                  {editTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 bg-secondary text-secondary-foreground rounded-md px-2 py-0.5 text-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                      </button>
                    </span>
                  ))}
                  <div className="relative flex-1 min-w-[80px]">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault()
                          handleAddTag(tagInput)
                        }
                        if (
                          e.key === 'Backspace' &&
                          tagInput === '' &&
                          editTags.length > 0
                        ) {
                          handleRemoveTag(editTags[editTags.length - 1])
                        }
                      }}
                      placeholder={
                        editTags.length === 0 ? t('bundles.tagsPlaceholder') : ''
                      }
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    {tagInput.length > 0 && (
                      <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-md">
                        {allTags
                          .filter(
                            (t) =>
                              t.name.includes(tagInput.toLowerCase()) &&
                              !editTags.includes(t.name),
                          )
                          .slice(0, 8)
                          .map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => handleAddTag(tag.name)}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                            >
                              {tag.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
```

- [ ] **Step 5: Verify in browser**

Run: `pnpm dev`
Open `http://localhost:3000/bundles`, select a bundle, verify:
- Tag input field appears below usage hint
- Can type and add tags via Enter/comma
- Tags show as chips with `×` to remove
- Autocomplete dropdown appears for existing tags
- Backspace on empty input removes last tag

- [ ] **Step 6: Commit**

```bash
git add src/routes/bundles/index.tsx
git commit -m "feat: add tag input with autocomplete to bundle detail panel"
```

---

### Task 5: UI — `#` prefix tag filter in search bar

**Files:**
- Modify: `src/routes/bundles/index.tsx`

- [ ] **Step 1: Replace search state with structured filter state**

In `BundlesPage`, replace the `search` state:

```typescript
  const [search, setSearch] = useState('')
```

with:

```typescript
  const [searchText, setSearchText] = useState('')
  const [filterTags, setFilterTags] = useState<Array<string>>([])
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [tagSearchPart, setTagSearchPart] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Add search input handler**

Add the handler to parse `#` prefix input:

```typescript
  function handleSearchInput(value: string) {
    // Check if we're in tag-search mode (text after last #)
    const hashIdx = value.lastIndexOf('#')
    if (hashIdx >= 0) {
      const afterHash = value.slice(hashIdx + 1)
      // Still typing a tag
      setTagSearchPart(afterHash)
      setSearchText(value.slice(0, hashIdx))
      setShowTagDropdown(true)
    } else {
      setSearchText(value)
      setTagSearchPart('')
      setShowTagDropdown(false)
    }
  }

  function handleSelectFilterTag(tagName: string) {
    if (!filterTags.includes(tagName)) {
      setFilterTags([...filterTags, tagName])
    }
    setTagSearchPart('')
    setShowTagDropdown(false)
    // Reset the input to just the text part
    if (searchInputRef.current) {
      searchInputRef.current.value = searchText
    }
  }

  function handleRemoveFilterTag(tagName: string) {
    setFilterTags(filterTags.filter((t) => t !== tagName))
  }
```

- [ ] **Step 3: Update the filter logic**

Replace the existing `filtered` variable:

```typescript
  const filtered = search
    ? bundles.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : bundles
```

with:

```typescript
  const filtered = bundles.filter((b) => {
    // Tag filter (OR): if any filter tags are set, bundle must have at least one
    if (filterTags.length > 0) {
      const bundleTagNames = b.tags?.map((t: { name: string }) => t.name) ?? []
      const hasMatchingTag = filterTags.some((ft) => bundleTagNames.includes(ft))
      if (!hasMatchingTag) return false
    }
    // Text filter: name must include search text
    if (searchText) {
      if (!b.name.toLowerCase().includes(searchText.toLowerCase())) return false
    }
    return true
  })
```

- [ ] **Step 4: Replace the search bar JSX**

Replace the existing search input `<div className="relative">` block (lines 238-249) with:

```tsx
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              />
              <div className="flex flex-wrap items-center gap-1 pl-8 pr-2 border border-border rounded-md bg-background min-h-[32px]">
                {filterTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 bg-primary/15 text-primary rounded px-1.5 py-0.5 text-xs"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveFilterTag(tag)}
                      className="hover:text-primary/70"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  ref={searchInputRef}
                  defaultValue=""
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Backspace' &&
                      e.currentTarget.value === '' &&
                      filterTags.length > 0
                    ) {
                      handleRemoveFilterTag(filterTags[filterTags.length - 1])
                    }
                    if (e.key === 'Escape') {
                      setShowTagDropdown(false)
                    }
                  }}
                  onBlur={() => {
                    // Delay to allow click on dropdown
                    setTimeout(() => setShowTagDropdown(false), 200)
                  }}
                  placeholder={
                    filterTags.length === 0
                      ? t('bundles.searchBundles')
                      : ''
                  }
                  className="flex-1 min-w-[60px] h-[30px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              {showTagDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
                  {allTags
                    .filter(
                      (t) =>
                        t.name.includes(tagSearchPart.toLowerCase()) &&
                        !filterTags.includes(t.name),
                    )
                    .slice(0, 10)
                    .map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectFilterTag(tag.name)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                      >
                        #{tag.name}
                      </button>
                    ))}
                  {allTags.filter(
                    (t) =>
                      t.name.includes(tagSearchPart.toLowerCase()) &&
                      !filterTags.includes(t.name),
                  ).length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {t('bundles.noBundlesDesc')}
                    </div>
                  )}
                </div>
              )}
            </div>
```

- [ ] **Step 5: Show tags on bundle cards in the list**

In the bundle list card JSX (inside the `filtered.map()` block), after the `<Badge>` for image count and before the closing `</div>` of the info overlay, add tag display:

```tsx
                        {bundle.tags && bundle.tags.length > 0 && (
                          <div className="flex gap-0.5 mt-0.5 flex-wrap">
                            {bundle.tags.slice(0, 2).map((tag: { id: number; name: string }) => (
                              <span
                                key={tag.id}
                                className="text-[9px] bg-white/15 text-white/80 rounded px-1"
                              >
                                {tag.name}
                              </span>
                            ))}
                            {bundle.tags.length > 2 && (
                              <span className="text-[9px] text-white/50">
                                +{bundle.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
```

- [ ] **Step 6: Verify in browser**

Run: `pnpm dev`
Open `http://localhost:3000/bundles`, verify:
- Typing `#` in search bar opens tag dropdown
- Selecting a tag adds it as a chip in the search bar
- Multiple tag chips filter with OR logic
- Text after chips filters bundle name (AND with tags)
- Backspace on empty input removes last tag chip
- Bundle cards show tag labels (max 2, with +N overflow)
- Escape closes the dropdown

- [ ] **Step 7: Commit**

```bash
git add src/routes/bundles/index.tsx
git commit -m "feat: add #-prefix tag filter with autocomplete to bundles search bar"
```

---

### Task 6: Verify and clean up

**Files:**
- All modified files

- [ ] **Step 1: Run type check**

Run: `pnpm build`
Expected: No TypeScript errors.

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All existing tests pass (bundle.test.ts included).

- [ ] **Step 3: Run linter**

Run: `pnpm lint`
Expected: No lint errors in modified files.

- [ ] **Step 4: Full browser test**

Run: `pnpm dev`
Manual verification:
1. Go to `/bundles`, create a bundle
2. Add tags "hair", "color" in the detail panel
3. Create another bundle, add tag "clothing"
4. Type `#` in search bar → see "hair", "color", "clothing" in dropdown
5. Select "hair" → only bundles with "hair" tag shown
6. Add "clothing" tag chip → bundles with "hair" OR "clothing" shown
7. Type text alongside chips → AND filter with name
8. Remove a tag chip → filter updates
9. Remove all tags from a bundle → orphan tags cleaned up (verify dropdown no longer shows them)

- [ ] **Step 5: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: bundle tags polish and cleanup"
```
