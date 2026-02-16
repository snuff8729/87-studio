import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  listImages,
  updateImage,
  getImageDetail,
  addTag,
  removeTag,
  listTags,
  listProjectsForFilter,
  listScenesForFilter,
  bulkUpdateImages,
} from '@/server/functions/gallery'
import { HugeiconsIcon } from '@hugeicons/react'
import { Image02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'

type SearchParams = {
  project?: number
  projectSceneId?: number
  tag?: number
  favorite?: boolean
  minRating?: number
  sortBy?: 'newest' | 'oldest' | 'rating' | 'favorites'
  imageId?: number
}

export const Route = createFileRoute('/gallery/')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    project: search.project ? Number(search.project) : undefined,
    projectSceneId: search.projectSceneId ? Number(search.projectSceneId) : undefined,
    tag: search.tag ? Number(search.tag) : undefined,
    favorite: search.favorite === true || search.favorite === 'true' ? true : undefined,
    minRating: search.minRating ? Number(search.minRating) : undefined,
    sortBy: (search.sortBy as SearchParams['sortBy']) || undefined,
    imageId: search.imageId ? Number(search.imageId) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [images, allTags, allProjects] = await Promise.all([
      listImages({
        data: {
          page: 1,
          limit: 40,
          projectId: deps.project,
          projectSceneId: deps.projectSceneId,
          isFavorite: deps.favorite,
          minRating: deps.minRating,
          tagIds: deps.tag ? [deps.tag] : undefined,
          sortBy: deps.sortBy,
        },
      }),
      listTags(),
      listProjectsForFilter(),
    ])
    return { initialImages: images, allTags, allProjects }
  },
  component: GalleryPage,
})

function GalleryPage() {
  const { initialImages, allTags, allProjects } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const [images, setImages] = useState(initialImages)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialImages.length >= 40)
  const [lightboxId, setLightboxId] = useState<number | null>(search.imageId ?? null)

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Scene filter options (loaded when project is selected)
  const [projectScenes, setProjectScenes] = useState<{ id: number; name: string }[]>([])

  const observerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setImages(initialImages)
    setPage(1)
    setHasMore(initialImages.length >= 40)
  }, [initialImages])

  // Load scenes when project changes
  useEffect(() => {
    if (search.project) {
      listScenesForFilter({ data: { projectId: search.project } }).then(setProjectScenes)
    } else {
      setProjectScenes([])
    }
  }, [search.project])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    const nextPage = page + 1
    const result = await listImages({
      data: {
        page: nextPage,
        limit: 40,
        projectId: search.project,
        projectSceneId: search.projectSceneId,
        isFavorite: search.favorite,
        minRating: search.minRating,
        tagIds: search.tag ? [search.tag] : undefined,
        sortBy: search.sortBy,
      },
    })
    setImages((prev) => [...prev, ...result])
    setPage(nextPage)
    setHasMore(result.length >= 40)
    setLoading(false)
  }, [loading, hasMore, page, search])

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = observerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  async function handleToggleFavorite(imageId: number, current: number | null) {
    const newVal = current ? 0 : 1
    await updateImage({ data: { id: imageId, isFavorite: newVal } })
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, isFavorite: newVal } : img)),
    )
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkFavorite() {
    try {
      await bulkUpdateImages({ data: { imageIds: [...selectedIds], isFavorite: 1 } })
      setImages((prev) =>
        prev.map((img) => (selectedIds.has(img.id) ? { ...img, isFavorite: 1 } : img)),
      )
      toast.success(`${selectedIds.size}개 이미지를 즐겨찾기에 추가했습니다`)
      setSelectedIds(new Set())
      setSelectMode(false)
    } catch {
      toast.error('일괄 처리에 실패했습니다')
    }
  }

  async function handleBulkDelete() {
    try {
      await bulkUpdateImages({ data: { imageIds: [...selectedIds], delete: true } })
      setImages((prev) => prev.filter((img) => !selectedIds.has(img.id)))
      toast.success(`${selectedIds.size}개 이미지가 삭제되었습니다`)
      setSelectedIds(new Set())
      setSelectMode(false)
    } catch {
      toast.error('일괄 삭제에 실패했습니다')
    }
  }

  // Navigate lightbox
  const currentIndex = lightboxId ? images.findIndex((img) => img.id === lightboxId) : -1

  const handleLightboxPrev = useCallback(() => {
    const idx = lightboxId ? images.findIndex((img) => img.id === lightboxId) : -1
    if (idx > 0) setLightboxId(images[idx - 1].id)
  }, [lightboxId, images])

  const handleLightboxNext = useCallback(() => {
    const idx = lightboxId ? images.findIndex((img) => img.id === lightboxId) : -1
    if (idx < images.length - 1) setLightboxId(images[idx + 1].id)
  }, [lightboxId, images])

  // QW-12: Fixed useEffect dependency array for keyboard events
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (lightboxId === null) return
      if (e.key === 'Escape') setLightboxId(null)
      if (e.key === 'ArrowLeft') handleLightboxPrev()
      if (e.key === 'ArrowRight') handleLightboxNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxId, handleLightboxPrev, handleLightboxNext])

  const hasFilters = search.project || search.favorite || search.minRating || search.projectSceneId || search.tag || search.sortBy

  return (
    <div>
      <PageHeader
        title="Gallery"
        description={`${images.length} images`}
        actions={
          <Button
            size="sm"
            variant={selectMode ? 'default' : 'outline'}
            onClick={() => {
              setSelectMode(!selectMode)
              setSelectedIds(new Set())
            }}
          >
            {selectMode ? '선택 해제' : '선택'}
          </Button>
        }
      />

      {/* Filter Bar -- auto-apply via URL */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select
          value={search.project ? String(search.project) : 'all'}
          onValueChange={(v) =>
            navigate({
              search: (prev) => ({
                ...prev,
                project: v === 'all' ? undefined : Number(v),
                projectSceneId: v === 'all' ? undefined : prev.projectSceneId,
              }),
            })
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {allProjects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* ST-5: Scene filter (only when project selected) */}
        {search.project && projectScenes.length > 0 && (
          <Select
            value={search.projectSceneId ? String(search.projectSceneId) : 'all'}
            onValueChange={(v) =>
              navigate({
                search: (prev) => ({
                  ...prev,
                  projectSceneId: v === 'all' ? undefined : Number(v),
                }),
              })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Scenes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Scenes</SelectItem>
              {projectScenes.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          size="sm"
          variant={search.favorite ? 'default' : 'outline'}
          onClick={() => navigate({ search: (prev) => ({ ...prev, favorite: prev.favorite ? undefined : true }) })}
        >
          Favorites
        </Button>

        <Select
          value={search.minRating ? String(search.minRating) : 'all'}
          onValueChange={(v) => navigate({ search: (prev) => ({ ...prev, minRating: v === 'all' ? undefined : Number(v) }) })}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Any Rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Rating</SelectItem>
            {[1, 2, 3, 4, 5].map((r) => (
              <SelectItem key={r} value={String(r)}>
                {r}+ stars
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* ST-6: Tag filter */}
        {allTags.length > 0 && (
          <Select
            value={search.tag ? String(search.tag) : 'all'}
            onValueChange={(v) =>
              navigate({
                search: (prev) => ({
                  ...prev,
                  tag: v === 'all' ? undefined : Number(v),
                }),
              })
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* ST-7: Sort options */}
        <Select
          value={search.sortBy ?? 'newest'}
          onValueChange={(v) =>
            navigate({
              search: (prev) => ({
                ...prev,
                sortBy: v === 'newest' ? undefined : (v as SearchParams['sortBy']),
              }),
            })
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="rating">Highest rated</SelectItem>
            <SelectItem value="favorites">Favorites first</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={() => navigate({ search: {} })}>
            Clear
          </Button>
        )}
      </div>

      {/* Image Grid */}
      {images.length === 0 ? (
        <div className="rounded-xl border border-border border-dashed py-16 text-center">
          <HugeiconsIcon icon={Image02Icon} className="size-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No images found</p>
          <p className="text-xs text-muted-foreground mb-4">
            Generate images from a project or adjust your filters.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">프로젝트 목록</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
          {images.map((img) => (
            <GalleryImage
              key={img.id}
              img={img}
              selectMode={selectMode}
              selected={selectedIds.has(img.id)}
              onToggleSelect={() => toggleSelect(img.id)}
              onToggleFavorite={() => handleToggleFavorite(img.id, img.isFavorite)}
              onOpenLightbox={() => setLightboxId(img.id)}
            />
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-16 lg:bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-border rounded-xl px-4 py-2 flex items-center gap-3 shadow-lg">
          <span className="text-sm font-medium">{selectedIds.size}개 선택</span>
          <Button size="sm" variant="outline" onClick={handleBulkFavorite}>즐겨찾기</Button>
          {/* QW-1: Bulk delete with ConfirmDialog */}
          <ConfirmDialog
            trigger={<Button size="sm" variant="destructive">삭제</Button>}
            title="이미지 삭제"
            description={`${selectedIds.size}개의 이미지를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
            actionLabel="삭제"
            variant="destructive"
            onConfirm={handleBulkDelete}
          />
          <Button size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}>취소</Button>
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={observerRef} className="h-10" />
      {loading && (
        <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
      )}

      {/* Lightbox */}
      {lightboxId !== null && (
        <Lightbox
          imageId={lightboxId}
          onClose={() => setLightboxId(null)}
          onPrev={currentIndex > 0 ? handleLightboxPrev : undefined}
          onNext={currentIndex < images.length - 1 ? handleLightboxNext : undefined}
          currentIndex={currentIndex}
          totalCount={images.length}
          onUpdate={(id, updates) => {
            setImages((prev) =>
              prev.map((img) => (img.id === id ? { ...img, ...updates } : img)),
            )
          }}
        />
      )}
    </div>
  )
}

// ─── Gallery Image Item (with fade-in) ────────────────────────────────────────

function GalleryImage({
  img,
  selectMode,
  selected,
  onToggleSelect,
  onToggleFavorite,
  onOpenLightbox,
}: {
  img: { id: number; thumbnailPath: string | null; isFavorite: number | null; rating: number | null }
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onToggleFavorite: () => void
  onOpenLightbox: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    // Handle images that loaded before React hydration attached onLoad
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true)
    }
  }, [])

  return (
    <div
      className="relative group aspect-square rounded-lg overflow-hidden bg-secondary cursor-pointer"
      onClick={() => {
        if (selectMode) {
          onToggleSelect()
        } else {
          onOpenLightbox()
        }
      }}
    >
      {img.thumbnailPath ? (
        <img
          ref={imgRef}
          src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
          alt=""
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
          No thumbnail
        </div>
      )}

      {/* Select checkbox overlay */}
      {selectMode && (
        <div className="absolute top-1.5 left-1.5 z-10">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Favorite overlay */}
      {!selectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          className="absolute top-1.5 right-1.5 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label={img.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
        >
          {/* QW-7: text-destructive instead of text-red-400 */}
          <span className={img.isFavorite ? 'text-destructive' : 'text-white/70'}>
            {img.isFavorite ? '\u2764' : '\u2661'}
          </span>
        </button>
      )}

      {img.rating && (
        <div className="absolute bottom-1 left-1.5 text-xs text-primary">
          {'\u2605'.repeat(img.rating)}
        </div>
      )}

      {/* Selection highlight */}
      {selectMode && selected && (
        <div className="absolute inset-0 bg-primary/20 ring-2 ring-primary ring-inset rounded-lg" />
      )}
    </div>
  )
}

// ─── Lightbox ───────────────────────────────────────────────────────────────

function Lightbox({
  imageId,
  onClose,
  onPrev,
  onNext,
  currentIndex,
  totalCount,
  onUpdate,
}: {
  imageId: number
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  currentIndex: number
  totalCount: number
  onUpdate: (id: number, updates: Record<string, unknown>) => void
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getImageDetail>> | null>(null)
  const [memo, setMemo] = useState('')
  const [newTag, setNewTag] = useState('')
  const [refExpanded, setRefExpanded] = useState(false)

  // Memo auto-save refs
  const memoRef = useRef<string>('')
  const imageIdRef = useRef<number>(imageId)

  useEffect(() => {
    // Auto-save memo when switching images
    if (imageIdRef.current !== imageId && memoRef.current !== memo) {
      // Save the previous image's memo before loading new one
      const prevId = imageIdRef.current
      const prevMemo = memo
      updateImage({ data: { id: prevId, memo: prevMemo } })
    }

    imageIdRef.current = imageId
    setDetail(null)
    getImageDetail({ data: imageId }).then((d) => {
      setDetail(d)
      setMemo(d.memo || '')
      memoRef.current = d.memo || ''
    })
  }, [imageId])

  async function handleRating(rating: number) {
    if (!detail) return
    const newRating = detail.rating === rating ? null : rating
    await updateImage({ data: { id: imageId, rating: newRating } })
    setDetail({ ...detail, rating: newRating })
    onUpdate(imageId, { rating: newRating })
  }

  async function handleFavorite() {
    if (!detail) return
    const newVal = detail.isFavorite ? 0 : 1
    await updateImage({ data: { id: imageId, isFavorite: newVal } })
    setDetail({ ...detail, isFavorite: newVal })
    onUpdate(imageId, { isFavorite: newVal })
  }

  async function handleSaveMemo() {
    await updateImage({ data: { id: imageId, memo } })
    memoRef.current = memo
    if (detail) setDetail({ ...detail, memo })
    toast.success('메모가 저장되었습니다')
  }

  async function handleAddTag() {
    if (!newTag.trim()) return
    try {
      const tag = await addTag({ data: { imageId, tagName: newTag.trim() } })
      if (detail) {
        setDetail({
          ...detail,
          tags: [...detail.tags, { tagId: tag.id, tagName: tag.name }],
        })
      }
      setNewTag('')
      toast.success('태그가 추가되었습니다')
    } catch {
      toast.error('태그 추가에 실패했습니다')
    }
  }

  async function handleRemoveTag(tagId: number) {
    await removeTag({ data: { imageId, tagId } })
    if (detail) {
      setDetail({
        ...detail,
        tags: detail.tags.filter((t) => t.tagId !== tagId),
      })
    }
  }

  const imageSrc = detail?.filePath
    ? `/api/images/${detail.filePath.replace('data/images/', '')}`
    : ''

  // Parse metadata for prompts/params
  const meta = detail?.metadata ? (() => { try { return JSON.parse(detail.metadata) } catch { return null } })() : null

  return (
    // AD-10: Lightbox enter animation
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col lg:flex-row animate-in fade-in-0 duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image lightbox"
    >
      {/* Main image area */}
      <div
        className="flex-1 flex items-center justify-center relative min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 text-3xl transition-colors z-10"
            aria-label="이전 이미지"
          >
            &lsaquo;
          </button>
        )}

        {detail ? (
          <img src={imageSrc} alt="" className="max-h-full max-w-full object-contain p-4 lg:max-w-[calc(100%-20rem)]" />
        ) : (
          <Skeleton className="w-64 h-96 rounded-lg" />
        )}

        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 text-3xl transition-colors z-10"
            aria-label="다음 이미지"
          >
            &rsaquo;
          </button>
        )}

        {/* Position indicator */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/50">
          {currentIndex + 1} / {totalCount}
        </div>
      </div>

      {/* Detail panel -- bottom sheet on mobile, side panel on desktop */}
      {/* AD-10: slide-in animation */}
      <div
        className="h-[40vh] lg:h-auto lg:w-80 bg-card border-t lg:border-t-0 lg:border-l border-border p-4 overflow-y-auto shrink-0 animate-in slide-in-from-bottom lg:slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-medium">Details</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </button>
        </div>

        {!detail ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            {/* ── Section 1: Context (Project/Scene info) ── */}
            {(detail.projectName || detail.projectSceneName) && (
              <>
                <div className="mb-4">
                  <label className="text-xs text-muted-foreground mb-1.5 block">Context</label>
                  <div className="space-y-1">
                    {detail.projectName && detail.projectId && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Project:</span>
                        <Link
                          to="/workspace/$projectId"
                          params={{ projectId: String(detail.projectId) }}
                          className="text-xs text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {detail.projectName}
                        </Link>
                      </div>
                    )}
                    {detail.projectSceneName && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Scene:</span>
                        <span className="text-xs text-foreground/80">{detail.projectSceneName}</span>
                      </div>
                    )}
                  </div>
                </div>
                <Separator className="mb-4" />
              </>
            )}

            {/* ── Section 2: Actions (Favorite + Rating) ── */}
            <div className="mb-4">
              <Button
                size="sm"
                variant={detail.isFavorite ? 'default' : 'outline'}
                onClick={handleFavorite}
                className="w-full"
                aria-label={detail.isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
              >
                {detail.isFavorite ? '\u2764 Favorited' : '\u2661 Favorite'}
              </Button>
            </div>

            {/* Rating */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1.5 block">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRating(r)}
                    className={`text-lg transition-colors ${
                      detail.rating && r <= detail.rating
                        ? 'text-primary'
                        : 'text-muted-foreground/40 hover:text-muted-foreground'
                    }`}
                    aria-label={`${r}점`}
                  >
                    {'\u2605'}
                  </button>
                ))}
              </div>
            </div>

            <Separator className="mb-4" />

            {/* ── Section 3: Notes (Memo + Tags) ── */}
            {/* Memo */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1.5 block">Memo</label>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                onBlur={handleSaveMemo}
                placeholder="Add a note..."
                className="text-sm min-h-20"
              />
            </div>

            {/* Tags */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1.5 block">Tags</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {detail.tags.map((t) => (
                  <Badge key={t.tagId} variant="secondary" className="gap-1">
                    {t.tagName}
                    <button
                      onClick={() => handleRemoveTag(t.tagId)}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                      aria-label={`태그 ${t.tagName} 제거`}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add tag..."
                  className="h-7 text-xs"
                />
                <Button size="xs" variant="outline" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
            </div>

            <Separator className="mb-4" />

            {/* ── Section 4: Reference (Metadata, Parameters, Prompts) -- collapsible ── */}
            <div className="mb-4">
              <button
                onClick={() => setRefExpanded(!refExpanded)}
                className="flex items-center justify-between w-full text-xs text-muted-foreground mb-2 hover:text-foreground transition-colors"
              >
                <span>Reference</span>
                <span className="text-[10px]">{refExpanded ? '\u25B2' : '\u25BC'}</span>
              </button>

              {refExpanded && (
                <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-150">
                  {/* Metadata */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">Metadata</label>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p>Seed: {detail.seed ?? 'N/A'}</p>
                      <p>Created: {new Date(detail.createdAt!).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Generation Parameters */}
                  {meta?.parameters && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Parameters</label>
                      <div className="text-xs space-y-0.5 text-muted-foreground">
                        {meta.parameters.width && <p>Size: {meta.parameters.width}x{meta.parameters.height}</p>}
                        {meta.parameters.steps && <p>Steps: {meta.parameters.steps}</p>}
                        {meta.parameters.cfg_scale && <p>CFG: {meta.parameters.cfg_scale}</p>}
                        {meta.parameters.sampler && <p>Sampler: {meta.parameters.sampler}</p>}
                      </div>
                    </div>
                  )}

                  {/* Prompts */}
                  {meta?.prompts?.generalPrompt && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">General Prompt</label>
                      <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-2 rounded-md max-h-32 overflow-y-auto">
                        {meta.prompts.generalPrompt}
                      </p>
                    </div>
                  )}

                  {meta?.prompts?.negativePrompt && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">Negative Prompt</label>
                      <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-2 rounded-md max-h-24 overflow-y-auto">
                        {meta.prompts.negativePrompt}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Download */}
            <div>
              <a href={imageSrc} download>
                <Button variant="outline" size="sm" className="w-full">
                  다운로드
                </Button>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
