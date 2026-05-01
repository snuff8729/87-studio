import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  BookmarkAdd01Icon,
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
  addBookmarkImageUpload,
  removeBookmarkImage,
  setBookmarkThumbnail,
  listBookmarkTags,
  setBookmarkTags,
} from '@/server/functions/tag-bookmarks'
import {
  searchDanbooruTags,
  getDanbooruTagDetail,
  type DanbooruTagDetail,
} from '@/server/functions/danbooru'

export const Route = createFileRoute('/tags/')({
  component: TagGalleryPage,
  loader: () => listTagBookmarks({ data: {} }),
  validateSearch: (search: Record<string, unknown>) => ({
    tag: (search.tag as string) || undefined,
  }),
})

function TagGalleryPage() {
  const initialBookmarks = Route.useLoaderData()
  const { tag: urlTag } = Route.useSearch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [bookmarks, setBookmarks] = useState(initialBookmarks)

  // Selected tag name (from URL or user click) — works for any danbooru tag, not just bookmarks
  const [selectedTag, setSelectedTagState] = useState<string | null>(
    urlTag ?? null,
  )

  function setSelectedTag(tag: string | null) {
    setSelectedTagState(tag)
    navigate({
      to: '/tags',
      search: tag ? { tag } : {},
      replace: true,
    })
  }

  // Search/filter state
  const [searchText, setSearchText] = useState('')
  const [filterTags, setFilterTags] = useState<Array<string>>([])
  const [showTagDropdown, setShowTagDropdown] = useState(false)
  const [tagSearchPart, setTagSearchPart] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // All classification tags
  const [allTags, setAllTags] = useState<Array<{ id: number; name: string }>>(
    [],
  )

  // Detail state — danbooru info (always available for any tag)
  const [danbooruInfo, setDanbooruInfo] = useState<DanbooruTagDetail | null>(
    null,
  )

  // Bookmark detail (only if the selected tag is bookmarked)
  const [bookmarkDetail, setBookmarkDetail] = useState<{
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

  // Load detail when selected tag changes
  useEffect(() => {
    if (!selectedTag) {
      setDanbooruInfo(null)
      setBookmarkDetail(null)
      return
    }

    // Load danbooru info
    getDanbooruTagDetail({ data: selectedTag })
      .then(setDanbooruInfo)
      .catch(() => setDanbooruInfo(null))

    // Check if bookmarked and load bookmark detail
    const bm = bookmarks.find((b) => b.name === selectedTag)
    if (bm) {
      getTagBookmark({ data: bm.id }).then((d) => {
        setBookmarkDetail(d)
        setEditMemo(d.memo ?? '')
        setEditTags(d.tags.map((t) => t.name))
        setTagInput('')
      })
    } else {
      setBookmarkDetail(null)
      setEditMemo('')
      setEditTags([])
      setTagInput('')
    }
  }, [selectedTag, bookmarks])

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
      if (!bookmarkDetail) return
      try {
        await updateTagBookmark({ data: { id: bookmarkDetail.id, memo } })
      } catch {
        toast.error(t('tagGallery.memoSaved'))
      }
    }, 800)
  }

  function scheduleTagSave(tags: Array<string>) {
    if (tagTimerRef.current) clearTimeout(tagTimerRef.current)
    tagTimerRef.current = setTimeout(async () => {
      if (!bookmarkDetail) return
      try {
        await setBookmarkTags({
          data: { bookmarkId: bookmarkDetail.id, tagNames: tags },
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

  async function handleCreateBookmark(name: string) {
    try {
      await createTagBookmark({ data: { name: name.trim() } })
      toast.success(t('tagGallery.bookmarkCreated'))
      setCreating(false)
      setCreateQuery('')
      setSearchResults([])
      await refreshList()
      setSelectedTag(name.trim())
    } catch {
      toast.error(t('tagGallery.createFailed'))
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteTagBookmark({ data: id })
      toast.success(t('tagGallery.bookmarkDeleted'))
      // Keep selectedTag — it just won't be bookmarked anymore
      refreshList()
    } catch {
      toast.error(t('tagGallery.deleteFailed'))
    }
  }

  async function handleSetThumbnail(imageId: number) {
    if (!bookmarkDetail) return
    await setBookmarkThumbnail({
      data: { bookmarkId: bookmarkDetail.id, imageId },
    })
    toast.success(t('tagGallery.thumbnailSet'))
    refreshList()
    setBookmarkDetail(await getTagBookmark({ data: bookmarkDetail.id }))
  }

  async function handleRemoveImage(imageId: number) {
    await removeBookmarkImage({ data: imageId })
    toast.success(t('tagGallery.imageRemoved'))
    if (bookmarkDetail)
      setBookmarkDetail(await getTagBookmark({ data: bookmarkDetail.id }))
    refreshList()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !bookmarkDetail) return
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      await addBookmarkImageUpload({
        data: {
          bookmarkId: bookmarkDetail.id,
          imageData: base64,
          filename: file.name,
        },
      })
      setBookmarkDetail(await getTagBookmark({ data: bookmarkDetail.id }))
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

  // Search/filter handlers
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

  const isBookmarked = bookmarkDetail !== null

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
                  onBlur={() =>
                    setTimeout(() => setShowTagDropdown(false), 200)
                  }
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
                      handleCreateBookmark(createQuery)
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
                        onClick={() => handleCreateBookmark(r.name)}
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
                      onClick={() => handleCreateBookmark(createQuery)}
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
                  const isActive = selectedTag === bm.name
                  const thumbSrc = bm.thumbnailPath
                    ? bm.thumbnailPath.startsWith('data/tag-images')
                      ? `/api/tag-images/${bm.thumbnailPath.replace('data/tag-images/', '')}`
                      : `/api/thumbnails/${bm.thumbnailPath.replace('data/thumbnails/', '')}`
                    : null

                  return (
                    <button
                      key={bm.id}
                      onClick={() => setSelectedTag(bm.name)}
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

        {/* Right panel — detail (any tag, bookmarked or not) */}
        <div className="flex-1 overflow-y-auto">
          {!selectedTag ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">{t('tagGallery.selectBookmark')}</p>
            </div>
          ) : (
            <div className="p-4 lg:p-6 space-y-5 max-w-3xl">
              {/* Tag name + danbooru info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-medium">
                    {selectedTag.replace(/_/g, ' ')}
                  </h2>
                  {danbooruInfo && (
                    <>
                      <Badge variant="outline" className="text-xs">
                        {danbooruInfo.categoryLabel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {danbooruInfo.postCount.toLocaleString()} posts
                      </span>
                      {danbooruInfo.isDeprecated && (
                        <Badge variant="destructive" className="text-xs">
                          deprecated
                        </Badge>
                      )}
                    </>
                  )}
                  {!isBookmarked && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleCreateBookmark(selectedTag)}
                    >
                      <HugeiconsIcon
                        icon={BookmarkAdd01Icon}
                        className="size-3.5"
                      />
                      {t('tagGallery.addBookmark')}
                    </Button>
                  )}
                </div>

                {/* Other names */}
                {danbooruInfo && danbooruInfo.otherNames.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {danbooruInfo.otherNames.map((name) => (
                      <span
                        key={name}
                        className="text-xs bg-secondary rounded px-1.5 py-0.5 text-muted-foreground"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Aliases */}
                {danbooruInfo && danbooruInfo.aliases.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Aliases: </span>
                    {danbooruInfo.aliases
                      .map((a) => a.replace(/_/g, ' '))
                      .join(', ')}
                  </div>
                )}

                {/* Implications */}
                {danbooruInfo && danbooruInfo.implications.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Implies: </span>
                    {danbooruInfo.implications
                      .map((i) => i.replace(/_/g, ' '))
                      .join(', ')}
                  </div>
                )}

                {/* Implied by */}
                {danbooruInfo && danbooruInfo.impliedBy.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Implied by: </span>
                    {danbooruInfo.impliedBy
                      .map((i) => i.replace(/_/g, ' '))
                      .join(', ')}
                  </div>
                )}

                {/* Wiki description */}
                {danbooruInfo?.wikiBody && (
                  <details className="text-xs">
                    <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                      Wiki
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap text-muted-foreground bg-secondary/50 rounded-md p-2 max-h-40 overflow-y-auto font-sans">
                      {danbooruInfo.wikiBody}
                    </pre>
                  </details>
                )}
              </div>

              {/* Related tags (tag groups) */}
              {danbooruInfo &&
                Object.keys(danbooruInfo.groupMembers).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      {Object.entries(danbooruInfo.groupMembers).map(
                        ([group, members]) => (
                          <details key={group} className="text-xs">
                            <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground font-medium">
                              {group.replace(/_/g, ' ')}
                              <span className="text-xs font-normal ml-1">
                                ({members.length})
                              </span>
                            </summary>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {members.map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setSelectedTag(m)}
                                  className={`rounded px-1.5 py-0.5 transition-colors ${
                                    bookmarks.some((b) => b.name === m)
                                      ? 'bg-primary/15 text-primary hover:bg-primary/25'
                                      : 'bg-secondary hover:bg-accent text-secondary-foreground'
                                  }`}
                                >
                                  {m.replace(/_/g, ' ')}
                                </button>
                              ))}
                            </div>
                          </details>
                        ),
                      )}
                    </div>
                  </>
                )}

              {/* Bookmark sections (only if bookmarked) */}
              {isBookmarked && bookmarkDetail && (
                <>
                  <Separator />

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
                            <HugeiconsIcon
                              icon={Cancel01Icon}
                              className="size-3"
                            />
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
                        {tagInput.length > 0 &&
                          (() => {
                            const suggestions = allTags.filter(
                              (t) =>
                                t.name.includes(tagInput.toLowerCase()) &&
                                !editTags.includes(t.name),
                            )
                            const exactMatch = editTags.includes(
                              tagInput.trim().toLowerCase(),
                            )
                            if (suggestions.length === 0 && exactMatch)
                              return null
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

                    {bookmarkDetail.images.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        {t('tagGallery.noImages')}
                      </p>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
                        {bookmarkDetail.images.map((img) => {
                          const src = img.thumbnailPath
                            ? img.source === 'upload'
                              ? `/api/tag-images/${img.thumbnailPath.replace('data/tag-images/', '')}`
                              : `/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`
                            : null
                          return (
                            <div
                              key={img.id}
                              className={`relative aspect-square rounded-md overflow-hidden bg-secondary group ${
                                bookmarkDetail.thumbnailImageId === img.id
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
                          <HugeiconsIcon
                            icon={Delete02Icon}
                            className="size-4"
                          />
                          {t('common.delete')}
                        </Button>
                      }
                      title={t('tagGallery.deleteBookmark')}
                      description={t('tagGallery.deleteBookmarkDesc', {
                        name: bookmarkDetail.name,
                      })}
                      onConfirm={() => handleDelete(bookmarkDetail.id)}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
