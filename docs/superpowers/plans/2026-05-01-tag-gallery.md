# Danbooru Tag Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personal danbooru tag bookmarking system with thumbnails, memos, and category tagging — accessible via independent page (`/tags`) and workspace side panel.

**Architecture:** 4 new DB tables in studio.db (bookmarks, images, tags, assignments). Server functions for CRUD + image upload. Split-panel page following Bundles pattern. Workspace panel as a slide-over sheet triggered from prompt panel.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start server functions, React 19, shadcn/ui, sharp (thumbnails), Tailwind CSS 4.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/server/db/schema.ts` | Modify | 4 new tables |
| `src/server/functions/tag-bookmarks.ts` | Create | Bookmark CRUD, image management, tags |
| `src/routes/tags/index.tsx` | Create | Tag gallery page |
| `src/components/workspace/tag-gallery-panel.tsx` | Create | Workspace side panel |
| `src/components/workspace/prompt-panel.tsx` | Modify | Add tag gallery toggle button |
| `src/components/layout/sidebar.tsx` | Modify | Add nav item |
| `src/components/layout/bottom-nav.tsx` | Modify | Add nav item |
| `src/lib/i18n/en.ts` | Modify | Translation keys |
| `src/lib/i18n/ko.ts` | Modify | Translation keys |
| DB migration | Generated | Schema migration |

---

### Task 1: DB Schema — Add tag bookmark tables

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Add 4 new tables to schema.ts**

Add after the `bundleTagAssignments` table (before `imageBundles`):

```typescript
// ─── Tag Bookmarks ─────────────────────────────────────────────────────────
export const tagBookmarks = sqliteTable('tag_bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  memo: text('memo'),
  thumbnailImageId: integer('thumbnail_image_id'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Tag Bookmark Images ───────────────────────────────────────────────────
export const tagBookmarkImages = sqliteTable(
  'tag_bookmark_images',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => tagBookmarks.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'gallery' | 'upload'
    galleryImageId: integer('gallery_image_id'),
    filePath: text('file_path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at').default(sql`(datetime('now'))`),
  },
  (table) => [
    index('tag_bookmark_images_bookmark_id_idx').on(table.bookmarkId),
  ],
)

// ─── Tag Bookmark Tags (classification) ────────────────────────────────────
export const tagBookmarkTags = sqliteTable('tag_bookmark_tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

// ─── Tag Bookmark Tag Assignments ──────────────────────────────────────────
export const tagBookmarkTagAssignments = sqliteTable(
  'tag_bookmark_tag_assignments',
  {
    bookmarkId: integer('bookmark_id')
      .notNull()
      .references(() => tagBookmarks.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tagBookmarkTags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.bookmarkId, table.tagId] }),
    index('tag_bookmark_tag_assignments_tag_id_idx').on(table.tagId),
  ],
)
```

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`

- [ ] **Step 3: Apply migration**

Run: `pnpm db:migrate`

- [ ] **Step 4: Verify build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/db/migrations/
git commit -m "feat: add tag bookmark tables (bookmarks, images, tags, assignments)"
```

---

### Task 2: Server Functions — Tag bookmark CRUD and image management

**Files:**
- Create: `src/server/functions/tag-bookmarks.ts`

- [ ] **Step 1: Create the server functions file**

Create `src/server/functions/tag-bookmarks.ts`:

```typescript
import { createServerFn } from '@tanstack/react-start'
import { asc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { mkdirSync, unlinkSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { db } from '../db'
import {
  tagBookmarkImages,
  tagBookmarkTagAssignments,
  tagBookmarkTags,
  tagBookmarks,
  generatedImages,
} from '../db/schema'
import { generateThumbnail } from '../services/image'
import { createLogger } from '../services/logger'

const log = createLogger('fn.tagBookmarks')
const TAG_IMAGES_DIR = './data/tag-images'

function normalizePath(p: string): string {
  return p.replaceAll('\\', '/')
}

// ── Bookmark CRUD ──

export const listTagBookmarks = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { search?: string; tags?: Array<string> } | undefined) =>
      data ?? {},
  )
  .handler(async ({ data }) => {
    const allBookmarks = db
      .select()
      .from(tagBookmarks)
      .orderBy(asc(tagBookmarks.name))
      .all()

    return allBookmarks
      .map((b) => {
        const tags = db
          .select({ id: tagBookmarkTags.id, name: tagBookmarkTags.name })
          .from(tagBookmarkTagAssignments)
          .innerJoin(
            tagBookmarkTags,
            eq(tagBookmarkTagAssignments.tagId, tagBookmarkTags.id),
          )
          .where(eq(tagBookmarkTagAssignments.bookmarkId, b.id))
          .orderBy(asc(tagBookmarkTags.name))
          .all()

        // Get thumbnail path
        let thumbnailPath: string | null = null
        if (b.thumbnailImageId) {
          const img = db
            .select({ thumbnailPath: tagBookmarkImages.thumbnailPath })
            .from(tagBookmarkImages)
            .where(eq(tagBookmarkImages.id, b.thumbnailImageId))
            .get()
          thumbnailPath = img?.thumbnailPath ?? null
        }

        const imageCount = db
          .select({ count: sql<number>`count(*)` })
          .from(tagBookmarkImages)
          .where(eq(tagBookmarkImages.bookmarkId, b.id))
          .get()

        return { ...b, tags, thumbnailPath, imageCount: imageCount?.count ?? 0 }
      })
      .filter((b) => {
        if (data.tags && data.tags.length > 0) {
          const bTagNames = b.tags.map((t) => t.name)
          if (!data.tags.some((ft) => bTagNames.includes(ft))) return false
        }
        if (data.search) {
          if (!b.name.toLowerCase().includes(data.search.toLowerCase()))
            return false
        }
        return true
      })
  })

export const getTagBookmark = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const bookmark = db
      .select()
      .from(tagBookmarks)
      .where(eq(tagBookmarks.id, id))
      .get()
    if (!bookmark) throw new Error('Bookmark not found')

    const images = db
      .select()
      .from(tagBookmarkImages)
      .where(eq(tagBookmarkImages.bookmarkId, id))
      .orderBy(asc(tagBookmarkImages.sortOrder))
      .all()

    const tags = db
      .select({ id: tagBookmarkTags.id, name: tagBookmarkTags.name })
      .from(tagBookmarkTagAssignments)
      .innerJoin(
        tagBookmarkTags,
        eq(tagBookmarkTagAssignments.tagId, tagBookmarkTags.id),
      )
      .where(eq(tagBookmarkTagAssignments.bookmarkId, id))
      .orderBy(asc(tagBookmarkTags.name))
      .all()

    return { ...bookmark, images, tags }
  })

export const createTagBookmark = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; memo?: string }) => data)
  .handler(async ({ data }) => {
    const result = db
      .insert(tagBookmarks)
      .values({ name: data.name.trim(), memo: data.memo })
      .returning()
      .get()
    log.info('create', 'Tag bookmark created', {
      id: result.id,
      name: data.name,
    })
    return result
  })

export const updateTagBookmark = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; memo?: string }) => data)
  .handler(async ({ data }) => {
    db.update(tagBookmarks)
      .set({ memo: data.memo, updatedAt: new Date().toISOString() })
      .where(eq(tagBookmarks.id, data.id))
      .run()
    return { success: true }
  })

export const deleteTagBookmark = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    // Delete uploaded image files
    const uploadedImages = db
      .select()
      .from(tagBookmarkImages)
      .where(eq(tagBookmarkImages.bookmarkId, id))
      .all()
      .filter((img) => img.source === 'upload')

    for (const img of uploadedImages) {
      try {
        if (existsSync(img.filePath)) unlinkSync(img.filePath)
        if (img.thumbnailPath && existsSync(img.thumbnailPath))
          unlinkSync(img.thumbnailPath)
      } catch {
        // ignore cleanup errors
      }
    }

    db.delete(tagBookmarks).where(eq(tagBookmarks.id, id)).run()
    log.info('delete', 'Tag bookmark deleted', { id })
    return { success: true }
  })

// ── Image management ──

export const addBookmarkImageFromGallery = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bookmarkId: number; galleryImageId: number }) => data,
  )
  .handler(async ({ data }) => {
    const img = db
      .select()
      .from(generatedImages)
      .where(eq(generatedImages.id, data.galleryImageId))
      .get()
    if (!img) throw new Error('Image not found')

    const result = db
      .insert(tagBookmarkImages)
      .values({
        bookmarkId: data.bookmarkId,
        source: 'gallery',
        galleryImageId: data.galleryImageId,
        filePath: img.filePath,
        thumbnailPath: img.thumbnailPath,
      })
      .returning()
      .get()
    return result
  })

export const addBookmarkImageUpload = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bookmarkId: number; imageData: string; filename: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const buffer = Buffer.from(data.imageData, 'base64')
    const uuid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const ext = data.filename.split('.').pop() || 'png'

    const dir = join(TAG_IMAGES_DIR, String(data.bookmarkId))
    mkdirSync(dir, { recursive: true })

    const filePath = normalizePath(join(dir, `${uuid}.${ext}`))
    const thumbnailPath = normalizePath(join(dir, `${uuid}_thumb.png`))

    writeFileSync(filePath, buffer)
    await generateThumbnail(filePath, thumbnailPath)

    const result = db
      .insert(tagBookmarkImages)
      .values({
        bookmarkId: data.bookmarkId,
        source: 'upload',
        filePath,
        thumbnailPath,
      })
      .returning()
      .get()
    return result
  })

export const removeBookmarkImage = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const img = db
      .select()
      .from(tagBookmarkImages)
      .where(eq(tagBookmarkImages.id, id))
      .get()
    if (!img) return { success: true }

    if (img.source === 'upload') {
      try {
        if (existsSync(img.filePath)) unlinkSync(img.filePath)
        if (img.thumbnailPath && existsSync(img.thumbnailPath))
          unlinkSync(img.thumbnailPath)
      } catch {
        // ignore
      }
    }

    db.delete(tagBookmarkImages).where(eq(tagBookmarkImages.id, id)).run()
    return { success: true }
  })

export const setBookmarkThumbnail = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bookmarkId: number; imageId: number }) => data,
  )
  .handler(async ({ data }) => {
    db.update(tagBookmarks)
      .set({
        thumbnailImageId: data.imageId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tagBookmarks.id, data.bookmarkId))
      .run()
    return { success: true }
  })

// ── Classification tags ──

export const listBookmarkTags = createServerFn({ method: 'GET' }).handler(
  async () => {
    return db
      .select({ id: tagBookmarkTags.id, name: tagBookmarkTags.name })
      .from(tagBookmarkTags)
      .orderBy(asc(tagBookmarkTags.name))
      .all()
  },
)

export const setBookmarkTags = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { bookmarkId: number; tagNames: Array<string> }) => data,
  )
  .handler(async ({ data }) => {
    const { bookmarkId, tagNames } = data
    const uniqueNames = [
      ...new Set(
        tagNames
          .map((n) => n.trim().toLowerCase())
          .filter((n) => n.length > 0),
      ),
    ]

    db.delete(tagBookmarkTagAssignments)
      .where(eq(tagBookmarkTagAssignments.bookmarkId, bookmarkId))
      .run()

    if (uniqueNames.length > 0) {
      for (const name of uniqueNames) {
        db.insert(tagBookmarkTags)
          .values({ name })
          .onConflictDoNothing()
          .run()
      }

      const tagRows = db
        .select({ id: tagBookmarkTags.id })
        .from(tagBookmarkTags)
        .where(inArray(tagBookmarkTags.name, uniqueNames))
        .all()

      for (const tag of tagRows) {
        db.insert(tagBookmarkTagAssignments)
          .values({ bookmarkId, tagId: tag.id })
          .run()
      }
    }

    // Clean orphan tags
    const usedTagIds = db
      .selectDistinct({ tagId: tagBookmarkTagAssignments.tagId })
      .from(tagBookmarkTagAssignments)
      .all()
      .map((r) => r.tagId)

    if (usedTagIds.length === 0) {
      db.delete(tagBookmarkTags).run()
    } else {
      db.delete(tagBookmarkTags)
        .where(notInArray(tagBookmarkTags.id, usedTagIds))
        .run()
    }

    return { success: true }
  })
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/server/functions/tag-bookmarks.ts
git commit -m "feat: add tag bookmark server functions (CRUD, images, tags)"
```

---

### Task 3: i18n — Add translation keys

**Files:**
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/lib/i18n/ko.ts`

- [ ] **Step 1: Add English translations**

In `src/lib/i18n/en.ts`, add a `tagGallery` section after the `bundles` section:

```typescript
  tagGallery: {
    title: 'Tag Gallery',
    description: 'Browse and bookmark danbooru tags with thumbnails and memos.',
    noBookmarks: 'No bookmarks yet',
    noBookmarksDesc: 'Search for a danbooru tag and bookmark it to get started.',
    addBookmark: 'Add Bookmark',
    searchDanbooru: 'Search danbooru tags...',
    customName: 'Custom name',
    bookmarkCreated: 'Bookmark created',
    createFailed: 'Failed to create bookmark',
    bookmarkDeleted: 'Bookmark deleted',
    deleteFailed: 'Failed to delete bookmark',
    deleteBookmark: 'Delete Bookmark',
    deleteBookmarkDesc: 'Delete "{{name}}"? This cannot be undone.',
    memo: 'Memo',
    memoPlaceholder: 'Add notes about this tag...',
    memoSaved: 'Memo saved',
    tags: 'Tags',
    tagsPlaceholder: 'Add tag...',
    noMatchingTags: 'No matching tags',
    createTagHint: 'Press Enter to create "{{name}}"',
    images: 'Images',
    noImages: 'No images yet.',
    addFromGallery: 'From Gallery',
    uploadImage: 'Upload',
    setThumbnail: 'Set Thumbnail',
    thumbnailSet: 'Thumbnail set',
    removeImage: 'Remove',
    imageRemoved: 'Image removed',
    searchBookmarks: 'Search bookmarks...',
    selectBookmark: 'Select a bookmark to view details',
    postCount: '{{count}} posts',
    insertTag: 'Insert into prompt',
    openFullPage: 'Open Tag Gallery',
    panelTitle: 'Tag Gallery',
  },
```

Also add to the `nav` section:

```typescript
    tags: 'Tags',
```

- [ ] **Step 2: Add Korean translations**

In `src/lib/i18n/ko.ts`, add a matching `tagGallery` section:

```typescript
  tagGallery: {
    title: '태그 갤러리',
    description: '단부루 태그를 썸네일과 메모와 함께 북마크하고 관리합니다.',
    noBookmarks: '북마크가 없습니다',
    noBookmarksDesc: '단부루 태그를 검색하고 북마크하여 시작하세요.',
    addBookmark: '북마크 추가',
    searchDanbooru: '단부루 태그 검색...',
    customName: '직접 입력',
    bookmarkCreated: '북마크가 생성되었습니다',
    createFailed: '북마크 생성에 실패했습니다',
    bookmarkDeleted: '북마크가 삭제되었습니다',
    deleteFailed: '북마크 삭제에 실패했습니다',
    deleteBookmark: '북마크 삭제',
    deleteBookmarkDesc: '"{{name}}"을(를) 삭제하시겠습니까? 되돌릴 수 없습니다.',
    memo: '메모',
    memoPlaceholder: '이 태그에 대한 메모를 입력하세요...',
    memoSaved: '메모가 저장되었습니다',
    tags: '태그',
    tagsPlaceholder: '태그 추가...',
    noMatchingTags: '일치하는 태그 없음',
    createTagHint: 'Enter를 눌러 "{{name}}" 생성',
    images: '이미지',
    noImages: '아직 이미지가 없습니다.',
    addFromGallery: '갤러리에서',
    uploadImage: '업로드',
    setThumbnail: '썸네일 설정',
    thumbnailSet: '썸네일이 설정되었습니다',
    removeImage: '제거',
    imageRemoved: '이미지가 제거되었습니다',
    searchBookmarks: '북마크 검색...',
    selectBookmark: '상세 정보를 보려면 북마크를 선택하세요',
    postCount: '{{count}}개 게시물',
    insertTag: '프롬프트에 삽입',
    openFullPage: '태그 갤러리 열기',
    panelTitle: '태그 갤러리',
  },
```

Also add to the `nav` section:

```typescript
    tags: '태그',
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/en.ts src/lib/i18n/ko.ts
git commit -m "feat: add tag gallery i18n keys (en, ko)"
```

---

### Task 4: Navigation — Add Tags to sidebar and bottom nav

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/bottom-nav.tsx`

- [ ] **Step 1: Update sidebar.tsx**

Add `BookmarkCheck01Icon` to the hugeicons import:

```typescript
import {
  BookmarkCheck01Icon,
  FileSearchIcon,
  Home03Icon,
  Image02Icon,
  MagicWand01Icon,
  Package01Icon,
  Settings02Icon,
  TimeQuarter02Icon,
} from '@hugeicons/core-free-icons'
```

Add the tags nav item after the bundles item in the `navItems` array:

```typescript
  {
    to: '/tags',
    key: 'nav.tags' as TranslationKeys,
    icon: BookmarkCheck01Icon,
  },
```

- [ ] **Step 2: Update bottom-nav.tsx**

Same changes — add `BookmarkCheck01Icon` to import and add the nav item after bundles.

- [ ] **Step 3: Verify build**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/layout/bottom-nav.tsx
git commit -m "feat: add Tags nav item to sidebar and bottom nav"
```

---

### Task 5: Tag Gallery Page (`/tags`)

**Files:**
- Create: `src/routes/tags/index.tsx`

This is the largest task. The page follows the Bundles page pattern: split-panel layout, left list with search/filter, right detail panel.

- [ ] **Step 1: Create the tag gallery page**

Create `src/routes/tags/index.tsx` (full component — modeled after `/bundles` page but adapted for tag bookmarks):

```typescript
import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
  Image02Icon,
  Search01Icon,
  Upload04Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageHeader } from '@/components/common/page-header'
import { useTranslation } from '@/lib/i18n'
import {
  listTagBookmarks,
  getTagBookmark,
  createTagBookmark,
  updateTagBookmark,
  deleteTagBookmark,
  addBookmarkImageFromGallery,
  addBookmarkImageUpload,
  removeBookmarkImage,
  setBookmarkThumbnail,
  listBookmarkTags,
  setBookmarkTags,
} from '@/server/functions/tag-bookmarks'
import { searchDanbooruTags } from '@/server/functions/danbooru'

export const Route = createFileRoute('/tags/')({
  component: TagGalleryPage,
  loader: () => listTagBookmarks({ data: {} }),
})

function TagGalleryPage() {
  const initialBookmarks = Route.useLoaderData()
  const { t } = useTranslation()

  const [bookmarks, setBookmarks] = useState(initialBookmarks)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Search/filter state (same pattern as bundles)
  const [searchText, setSearchText] = useState('')
  const [filterTags, setFilterTags] = useState<Array<string>>([])
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [tagSearchPart, setTagSearchPart] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // All classification tags
  const [allTags, setAllTags] = useState<Array<{ id: number; name: string }>>([])

  // Detail state
  const [detail, setDetail] = useState<{
    id: number
    name: string
    memo: string | null
    thumbnailImageId: number | null
    images: Array<{
      id: number
      source: string
      filePath: string
      thumbnailPath: string | null
    }>
    tags: Array<{ id: number; name: string }>
  } | null>(null)

  const [editMemo, setEditMemo] = useState('')
  const [editTags, setEditTags] = useState<Array<string>>([])
  const [tagInput, setTagInput] = useState('')
  const memoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const tagTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Create dialog state
  const [creating, setCreating] = useState(false)
  const [createQuery, setCreateQuery] = useState('')
  const [searchResults, setSearchResults] = useState<
    Array<{ name: string; postCount: number; category: number }>
  >([])
  const [isCustom, setIsCustom] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Sync loader
  useEffect(() => {
    setBookmarks(initialBookmarks)
  }, [initialBookmarks])

  // Load tags on mount
  const refreshTags = useCallback(async () => {
    setAllTags(await listBookmarkTags())
  }, [])
  useEffect(() => {
    refreshTags()
  }, [refreshTags])

  // Load detail
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null)
      return
    }
    getTagBookmark({ data: selectedId }).then((d) => {
      setDetail(d)
      setEditMemo(d.memo ?? '')
      setEditTags(d.tags.map((t) => t.name))
      setTagInput('')
    })
  }, [selectedId])

  const refreshList = useCallback(async () => {
    setBookmarks(await listTagBookmarks({ data: {} }))
  }, [])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (memoTimerRef.current) clearTimeout(memoTimerRef.current)
      if (tagTimerRef.current) clearTimeout(tagTimerRef.current)
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  // ── Handlers ──

  function handleMemoChange(memo: string) {
    setEditMemo(memo)
    if (memoTimerRef.current) clearTimeout(memoTimerRef.current)
    memoTimerRef.current = setTimeout(async () => {
      if (!selectedId) return
      try {
        await updateTagBookmark({ data: { id: selectedId, memo } })
      } catch {
        toast.error(t('tagGallery.memoSaved'))
      }
    }, 800)
  }

  function scheduleTagSave(tags: Array<string>) {
    if (tagTimerRef.current) clearTimeout(tagTimerRef.current)
    tagTimerRef.current = setTimeout(async () => {
      if (!selectedId) return
      try {
        await setBookmarkTags({
          data: { bookmarkId: selectedId, tagNames: tags },
        })
        refreshList()
        refreshTags()
      } catch {
        toast.error(t('bundles.updateFailed'))
      }
    }, 800)
  }

  function handleAddTag(name: string) {
    const n = name.trim().toLowerCase()
    if (!n || editTags.includes(n)) return
    const next = [...editTags, n]
    setEditTags(next)
    setTagInput('')
    scheduleTagSave(next)
  }

  function handleRemoveTag(name: string) {
    const next = editTags.filter((t) => t !== name)
    setEditTags(next)
    scheduleTagSave(next)
  }

  async function handleCreate(name: string) {
    try {
      const result = await createTagBookmark({ data: { name: name.trim() } })
      toast.success(t('tagGallery.bookmarkCreated'))
      setCreating(false)
      setCreateQuery('')
      setSearchResults([])
      await refreshList()
      setSelectedId(result.id)
    } catch {
      toast.error(t('tagGallery.createFailed'))
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTagBookmark({ data: id })
      toast.success(t('tagGallery.bookmarkDeleted'))
      if (selectedId === id) setSelectedId(null)
      refreshList()
    } catch {
      toast.error(t('tagGallery.deleteFailed'))
    }
  }

  async function handleSetThumbnail(imageId: number) {
    if (!selectedId) return
    await setBookmarkThumbnail({
      data: { bookmarkId: selectedId, imageId },
    })
    toast.success(t('tagGallery.thumbnailSet'))
    refreshList()
    setDetail(await getTagBookmark({ data: selectedId }))
  }

  async function handleRemoveImage(imageId: number) {
    await removeBookmarkImage({ data: imageId })
    toast.success(t('tagGallery.imageRemoved'))
    if (selectedId) setDetail(await getTagBookmark({ data: selectedId }))
    refreshList()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedId) return
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      await addBookmarkImageUpload({
        data: { bookmarkId: selectedId, imageData: base64, filename: file.name },
      })
      setDetail(await getTagBookmark({ data: selectedId }))
      refreshList()
    }
    reader.readAsDataURL(file)
  }

  // Danbooru search for create dialog
  function handleCreateQueryChange(q: string) {
    setCreateQuery(q)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (q.trim().length < 2) {
      setSearchResults([])
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchDanbooruTags({
          data: { query: q.trim(), limit: 10 },
        })
        setSearchResults(results)
      } catch {
        setSearchResults([])
      }
    }, 300)
  }

  // Search/filter handlers (same as bundles)
  function handleSearchInput(value: string) {
    const hashIdx = value.lastIndexOf('#')
    if (hashIdx >= 0) {
      setTagSearchPart(value.slice(hashIdx + 1))
      setSearchText(value.slice(0, hashIdx))
      setShowTagDropdown(true)
    } else {
      setSearchText(value)
      setTagSearchPart('')
      setShowTagDropdown(false)
    }
  }

  function handleSelectFilterTag(tagName: string) {
    if (!filterTags.includes(tagName)) setFilterTags([...filterTags, tagName])
    setTagSearchPart('')
    setShowTagDropdown(false)
    if (searchInputRef.current) searchInputRef.current.value = searchText
  }

  function handleRemoveFilterTag(tagName: string) {
    setFilterTags(filterTags.filter((t) => t !== tagName))
  }

  const filtered = bookmarks.filter((b) => {
    if (filterTags.length > 0) {
      const bNames = b.tags?.map((t: { name: string }) => t.name) ?? []
      if (!filterTags.some((ft) => bNames.includes(ft))) return false
    }
    if (searchText) {
      if (!b.name.toLowerCase().includes(searchText.toLowerCase())) return false
    }
    return true
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('tagGallery.title')}
        description={t('tagGallery.description')}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left panel — bookmark list */}
        <div className="w-72 lg:w-80 border-r border-border flex flex-col shrink-0">
          {/* Search + create */}
          <div className="p-3 space-y-2 border-b border-border">
            {/* Search bar with # filter (same as bundles) */}
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10"
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
                    )
                      handleRemoveFilterTag(filterTags[filterTags.length - 1])
                    if (e.key === 'Escape') setShowTagDropdown(false)
                  }}
                  onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
                  placeholder={
                    filterTags.length === 0
                      ? t('tagGallery.searchBookmarks')
                      : ''
                  }
                  className="flex-1 min-w-[60px] h-[30px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              {showTagDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
                  {(() => {
                    const matched = allTags.filter(
                      (t) =>
                        t.name.includes(tagSearchPart.toLowerCase()) &&
                        !filterTags.includes(t.name),
                    )
                    if (matched.length === 0) {
                      return (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          {t('tagGallery.noMatchingTags')}
                        </div>
                      )
                    }
                    return matched.slice(0, 10).map((tag) => {
                      const count = bookmarks.filter((b) =>
                        b.tags?.some(
                          (bt: { name: string }) => bt.name === tag.name,
                        ),
                      ).length
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectFilterTag(tag.name)}
                          className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent"
                        >
                          <span>#{tag.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {count}
                          </span>
                        </button>
                      )
                    })
                  })()}
                </div>
              )}
            </div>

            {/* Create button / dialog */}
            {creating ? (
              <div className="space-y-2">
                <Input
                  value={createQuery}
                  onChange={(e) => handleCreateQueryChange(e.target.value)}
                  placeholder={t('tagGallery.searchDanbooru')}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isCustom && createQuery.trim())
                      handleCreate(createQuery)
                    if (e.key === 'Escape') {
                      setCreating(false)
                      setCreateQuery('')
                      setSearchResults([])
                      setIsCustom(false)
                    }
                  }}
                />
                {searchResults.length > 0 && !isCustom && (
                  <div className="border border-border rounded-md max-h-40 overflow-y-auto">
                    {searchResults.map((r) => (
                      <button
                        key={r.name}
                        type="button"
                        onClick={() => handleCreate(r.name)}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent"
                      >
                        <span>{r.name.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.postCount.toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <Button
                    size="xs"
                    variant={isCustom ? 'default' : 'outline'}
                    onClick={() => setIsCustom(!isCustom)}
                  >
                    {t('tagGallery.customName')}
                  </Button>
                  {isCustom && (
                    <Button
                      size="xs"
                      onClick={() => handleCreate(createQuery)}
                      disabled={!createQuery.trim()}
                    >
                      {t('common.create')}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setCreating(false)
                      setCreateQuery('')
                      setSearchResults([])
                      setIsCustom(false)
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setCreating(true)}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
                {t('tagGallery.addBookmark')}
              </Button>
            )}
          </div>

          {/* Bookmark list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <p className="text-sm text-muted-foreground">
                  {bookmarks.length === 0
                    ? t('tagGallery.noBookmarks')
                    : t('tagGallery.noBookmarksDesc')}
                </p>
              </div>
            ) : (
              <div className="p-2 grid grid-cols-2 gap-1.5">
                {filtered.map((bm) => {
                  const isActive = selectedId === bm.id
                  const thumbSrc = bm.thumbnailPath
                    ? bm.thumbnailPath.startsWith('data/tag-images')
                      ? `/api/images/${bm.thumbnailPath.replace('data/tag-images/', 'tag-images/')}`
                      : `/api/thumbnails/${bm.thumbnailPath.replace('data/thumbnails/', '')}`
                    : null

                  return (
                    <button
                      key={bm.id}
                      onClick={() => setSelectedId(bm.id)}
                      className={`relative rounded-lg overflow-hidden transition-all ${
                        isActive
                          ? 'ring-2 ring-primary'
                          : 'ring-1 ring-border hover:ring-muted-foreground/40'
                      }`}
                    >
                      <div className="aspect-square bg-secondary">
                        {thumbSrc ? (
                          <img
                            src={thumbSrc}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <HugeiconsIcon
                              icon={Image02Icon}
                              className="size-8 text-muted-foreground/20"
                            />
                          </div>
                        )}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2 pb-1.5 pt-5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium truncate text-white">
                            {bm.name.replace(/_/g, ' ')}
                          </span>
                          {bm.imageCount > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-4 px-1.5 shrink-0 bg-white/20 text-white border-0"
                            >
                              {bm.imageCount}
                            </Badge>
                          )}
                        </div>
                        {bm.tags && bm.tags.length > 0 && (
                          <div className="flex gap-0.5 mt-0.5 flex-wrap">
                            {bm.tags
                              .slice(0, 2)
                              .map((tag: { id: number; name: string }) => (
                                <span
                                  key={tag.id}
                                  className="text-[9px] bg-white/15 text-white/80 rounded px-1"
                                >
                                  {tag.name}
                                </span>
                              ))}
                            {bm.tags.length > 2 && (
                              <span className="text-[9px] text-white/50">
                                +{bm.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right panel — detail */}
        <div className="flex-1 overflow-y-auto">
          {!detail ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">{t('tagGallery.selectBookmark')}</p>
            </div>
          ) : (
            <div className="p-4 lg:p-6 space-y-5 max-w-3xl">
              {/* Tag name */}
              <div>
                <h2 className="text-lg font-medium">
                  {detail.name.replace(/_/g, ' ')}
                </h2>
              </div>

              {/* Memo */}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">
                  {t('tagGallery.memo')}
                </Label>
                <Textarea
                  value={editMemo}
                  onChange={(e) => handleMemoChange(e.target.value)}
                  placeholder={t('tagGallery.memoPlaceholder')}
                  className="text-sm min-h-[80px]"
                  rows={3}
                />
              </div>

              {/* Classification tags */}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">
                  {t('tagGallery.tags')}
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
                        )
                          handleRemoveTag(editTags[editTags.length - 1])
                      }}
                      placeholder={
                        editTags.length === 0
                          ? t('tagGallery.tagsPlaceholder')
                          : ''
                      }
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    {tagInput.length > 0 && (() => {
                      const suggestions = allTags.filter(
                        (t) =>
                          t.name.includes(tagInput.toLowerCase()) &&
                          !editTags.includes(t.name),
                      )
                      const exactMatch = editTags.includes(
                        tagInput.trim().toLowerCase(),
                      )
                      if (suggestions.length === 0 && exactMatch) return null
                      return (
                        <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-md">
                          {suggestions.slice(0, 8).map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => handleAddTag(tag.name)}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                            >
                              {tag.name}
                            </button>
                          ))}
                          {suggestions.length === 0 && !exactMatch && (
                            <div className="px-3 py-1.5 text-sm text-muted-foreground">
                              {t('tagGallery.createTagHint', {
                                name: tagInput.trim(),
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Images */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground uppercase tracking-wider">
                    {t('tagGallery.images')}
                  </Label>
                  <div className="flex gap-1.5">
                    <label>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUpload}
                      />
                      <Button size="xs" variant="outline" asChild>
                        <span>
                          <HugeiconsIcon
                            icon={Upload04Icon}
                            className="size-3.5"
                          />
                          {t('tagGallery.uploadImage')}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>

                {detail.images.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {t('tagGallery.noImages')}
                  </p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
                    {detail.images.map((img) => {
                      const src = img.thumbnailPath
                        ? img.source === 'upload'
                          ? `/api/images/${img.thumbnailPath.replace('data/tag-images/', 'tag-images/')}`
                          : `/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`
                        : null
                      return (
                        <div
                          key={img.id}
                          className={`relative aspect-square rounded-md overflow-hidden bg-secondary group ${
                            detail.thumbnailImageId === img.id
                              ? 'ring-2 ring-primary'
                              : ''
                          }`}
                        >
                          {src ? (
                            <img
                              src={src}
                              alt=""
                              className="w-full h-full object-cover cursor-pointer"
                              loading="lazy"
                              onClick={() => handleSetThumbnail(img.id)}
                              title={t('tagGallery.setThumbnail')}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <HugeiconsIcon
                                icon={Image02Icon}
                                className="size-4 text-muted-foreground/30"
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(img.id)}
                            className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <HugeiconsIcon
                              icon={Cancel01Icon}
                              className="size-3"
                            />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* Delete */}
              <div className="flex justify-end">
                <ConfirmDialog
                  trigger={
                    <Button variant="destructive" size="sm">
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                      {t('common.delete')}
                    </Button>
                  }
                  title={t('tagGallery.deleteBookmark')}
                  description={t('tagGallery.deleteBookmarkDesc', {
                    name: detail.name,
                  })}
                  onConfirm={() => handleDelete(detail.id)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Verify in browser**

Run: `pnpm dev`, navigate to `/tags`, verify:
- Page loads with empty state
- Can create bookmark via danbooru search
- Can create custom bookmark
- Detail panel shows memo, tags, images sections
- Tag filter with `#` works

- [ ] **Step 4: Commit**

```bash
git add src/routes/tags/index.tsx
git commit -m "feat: add tag gallery page (/tags)"
```

---

### Task 6: Workspace Side Panel — Tag gallery reference

**Files:**
- Create: `src/components/workspace/tag-gallery-panel.tsx`
- Modify: `src/components/workspace/prompt-panel.tsx`

- [ ] **Step 1: Create tag-gallery-panel.tsx**

Create `src/components/workspace/tag-gallery-panel.tsx`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  Cancel01Icon,
  Image02Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useTranslation } from '@/lib/i18n'
import {
  listTagBookmarks,
  listBookmarkTags,
} from '@/server/functions/tag-bookmarks'

interface TagGalleryPanelProps {
  onInsertTag: (tagName: string) => void
  onClose: () => void
}

export function TagGalleryPanel({ onInsertTag, onClose }: TagGalleryPanelProps) {
  const { t } = useTranslation()
  const [bookmarks, setBookmarks] = useState<
    Array<{
      id: number
      name: string
      thumbnailPath: string | null
      tags: Array<{ id: number; name: string }>
    }>
  >([])
  const [allTags, setAllTags] = useState<Array<{ id: number; name: string }>>([])
  const [searchText, setSearchText] = useState('')
  const [filterTags, setFilterTags] = useState<Array<string>>([])
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [tagSearchPart, setTagSearchPart] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listTagBookmarks({ data: {} }).then(setBookmarks)
    listBookmarkTags().then(setAllTags)
  }, [])

  function handleSearchInput(value: string) {
    const hashIdx = value.lastIndexOf('#')
    if (hashIdx >= 0) {
      setTagSearchPart(value.slice(hashIdx + 1))
      setSearchText(value.slice(0, hashIdx))
      setShowTagDropdown(true)
    } else {
      setSearchText(value)
      setTagSearchPart('')
      setShowTagDropdown(false)
    }
  }

  function handleSelectFilterTag(tagName: string) {
    if (!filterTags.includes(tagName)) setFilterTags([...filterTags, tagName])
    setTagSearchPart('')
    setShowTagDropdown(false)
    if (searchInputRef.current) searchInputRef.current.value = searchText
  }

  const filtered = bookmarks.filter((b) => {
    if (filterTags.length > 0) {
      const bNames = b.tags?.map((t) => t.name) ?? []
      if (!filterTags.some((ft) => bNames.includes(ft))) return false
    }
    if (searchText) {
      if (!b.name.toLowerCase().includes(searchText.toLowerCase())) return false
    }
    return true
  })

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <span className="text-sm font-medium">{t('tagGallery.panelTitle')}</span>
        <div className="flex items-center gap-1">
          <Link
            to="/tags"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t('tagGallery.openFullPage')}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground z-10"
          />
          <div className="flex flex-wrap items-center gap-0.5 pl-7 pr-1 border border-border rounded-md bg-background min-h-[28px]">
            {filterTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 bg-primary/15 text-primary rounded px-1 py-0.5 text-[10px]"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() =>
                    setFilterTags(filterTags.filter((t) => t !== tag))
                  }
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-2" />
                </button>
              </span>
            ))}
            <input
              ref={searchInputRef}
              defaultValue=""
              onChange={(e) => handleSearchInput(e.target.value)}
              onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
              placeholder={
                filterTags.length === 0 ? t('tagGallery.searchBookmarks') : ''
              }
              className="flex-1 min-w-[40px] h-[26px] bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          {showTagDropdown && allTags.filter(
            (t) =>
              t.name.includes(tagSearchPart.toLowerCase()) &&
              !filterTags.includes(t.name),
          ).length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-md border border-border bg-popover shadow-md max-h-32 overflow-y-auto">
              {allTags
                .filter(
                  (t) =>
                    t.name.includes(tagSearchPart.toLowerCase()) &&
                    !filterTags.includes(t.name),
                )
                .slice(0, 8)
                .map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectFilterTag(tag.name)}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-accent"
                  >
                    #{tag.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Bookmark grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            {t('tagGallery.noBookmarks')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {filtered.map((bm) => {
              const thumbSrc = bm.thumbnailPath
                ? bm.thumbnailPath.startsWith('data/tag-images')
                  ? `/api/images/${bm.thumbnailPath.replace('data/tag-images/', 'tag-images/')}`
                  : `/api/thumbnails/${bm.thumbnailPath.replace('data/thumbnails/', '')}`
                : null
              return (
                <button
                  key={bm.id}
                  onClick={() => onInsertTag(bm.name.replace(/_/g, ' '))}
                  className="relative rounded-md overflow-hidden ring-1 ring-border hover:ring-muted-foreground/40 transition-all"
                  title={t('tagGallery.insertTag')}
                >
                  <div className="aspect-square bg-secondary">
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <HugeiconsIcon
                          icon={Image02Icon}
                          className="size-5 text-muted-foreground/20"
                        />
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-3">
                    <span className="text-[10px] font-medium text-white truncate block">
                      {bm.name.replace(/_/g, ' ')}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add toggle button to prompt-panel.tsx**

In `src/components/workspace/prompt-panel.tsx`, add a tag gallery toggle. This requires adding a `BookmarkCheck01Icon` import and a state/callback from the parent.

Add to the component props or use a simple local state with a Sheet/Dialog. The simplest approach: add an `onToggleTagGallery` prop to `PromptPanel` and render the button in the panel header area.

Find the import section and add:

```typescript
import { BookmarkCheck01Icon } from '@hugeicons/core-free-icons'
```

In the component's props interface (search for `interface PromptPanelProps` or the component function parameters), add:

```typescript
  onToggleTagGallery?: () => void
```

In the JSX, near the expand editor button in the prompt section header, add:

```tsx
                {onToggleTagGallery && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onToggleTagGallery}
                    title={t('tagGallery.panelTitle')}
                  >
                    <HugeiconsIcon icon={BookmarkCheck01Icon} className="size-4" />
                  </Button>
                )}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/components/workspace/tag-gallery-panel.tsx src/components/workspace/prompt-panel.tsx
git commit -m "feat: add tag gallery workspace side panel with insert-to-prompt"
```

---

### Task 7: Image serving — Add tag-images route

**Files:**
- Modify: `vite.config.ts` (or equivalent image serving config)

- [ ] **Step 1: Check current image serving and add tag-images path**

The `serveDataFiles()` Vite plugin maps `/api/images/`, `/api/thumbnails/`, `/api/downloads/`. Add `/api/images/tag-images/` mapping to `data/tag-images/`.

Read the current `vite.config.ts` to find the `serveDataFiles` function and add the new path mapping. The uploaded tag images need to be served from `data/tag-images/` via `/api/images/tag-images/`.

Since the existing `/api/images/` already maps to `data/images/`, we need to ensure `data/tag-images/` is also accessible. The simplest approach: map `/api/tag-images/` → `data/tag-images/`.

- [ ] **Step 2: Verify uploaded images are accessible**

Run `pnpm dev`, upload an image to a tag bookmark, verify it displays.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add tag-images serving route"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `pnpm build`

- [ ] **Step 3: Browser verification**

1. Navigate to `/tags` — page loads
2. Create bookmark via danbooru search — appears in list
3. Create custom bookmark — appears in list
4. Add memo — debounced save works
5. Add classification tags — `#` filter works
6. Upload image — displays in grid
7. Set thumbnail — card thumbnail updates
8. Remove image — removed from grid
9. Delete bookmark — removed from list
10. Workspace — tag gallery panel opens, clicking tag inserts into prompt

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: tag gallery polish"
```
