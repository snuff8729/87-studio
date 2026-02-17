import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  listTags,
  listProjectsForFilter,
  listScenesForFilter,
  bulkUpdateImages,
} from '@/server/functions/gallery'
import { HugeiconsIcon } from '@hugeicons/react'
import { Image02Icon, Download04Icon } from '@hugeicons/core-free-icons'
import { useTranslation } from '@/lib/i18n'
import { DownloadDialog } from '@/components/common/download-dialog'

type SearchParams = {
  project?: number
  projectSceneId?: number
  tag?: number
  favorite?: boolean
  minRating?: number
  sortBy?: 'newest' | 'oldest' | 'rating' | 'favorites'
}

export const Route = createFileRoute('/gallery/')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    project: search.project ? Number(search.project) : undefined,
    projectSceneId: search.projectSceneId ? Number(search.projectSceneId) : undefined,
    tag: search.tag ? Number(search.tag) : undefined,
    favorite: search.favorite === true || search.favorite === 'true' ? true : undefined,
    minRating: search.minRating ? Number(search.minRating) : undefined,
    sortBy: (search.sortBy as SearchParams['sortBy']) || undefined,
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

const GAP = 6 // gap-1.5 = 6px

function useGalleryColumns() {
  const [cols, setCols] = useState(2)
  useEffect(() => {
    function update() {
      const w = window.innerWidth
      if (w >= 1024) setCols(5)
      else if (w >= 768) setCols(4)
      else if (w >= 640) setCols(3)
      else setCols(2)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return cols
}

function GalleryPage() {
  const { initialImages, allTags, allProjects } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { t } = useTranslation()

  const [images, setImages] = useState(initialImages)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialImages.length >= 40)

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Scene filter options (loaded when project is selected)
  const [projectScenes, setProjectScenes] = useState<{ id: number; name: string }[]>([])

  // ── Virtualized grid setup ──
  const cols = useGalleryColumns()
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const [scrollMargin, setScrollMargin] = useState(0)

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

  // Track grid width and scroll margin
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = () => {
      setGridWidth(el.clientWidth)
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY)
    }
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cellSize = gridWidth > 0 ? Math.floor((gridWidth - GAP * (cols - 1)) / cols) : 150
  const rowHeight = cellSize + GAP
  const rowCount = Math.ceil(images.length / cols)

  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan: 5,
    scrollMargin,
  })

  // Re-measure when dimensions change
  useEffect(() => {
    rowVirtualizer.measure()
  }, [rowVirtualizer, cellSize, scrollMargin])

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

  // Load more when nearing the end of virtualized rows
  const virtualItems = rowVirtualizer.getVirtualItems()
  const lastVirtualRow = virtualItems.at(-1)
  useEffect(() => {
    if (!lastVirtualRow || !hasMore || loading) return
    if (lastVirtualRow.index >= rowCount - 3) {
      loadMore()
    }
  }, [lastVirtualRow?.index, rowCount, hasMore, loading, loadMore])

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
      toast.success(t('gallery.bulkFavoriteSuccess', { count: selectedIds.size }))
      setSelectedIds(new Set())
      setSelectMode(false)
    } catch {
      toast.error(t('gallery.bulkFailed'))
    }
  }

  async function handleBulkDelete() {
    try {
      await bulkUpdateImages({ data: { imageIds: [...selectedIds], delete: true } })
      setImages((prev) => prev.filter((img) => !selectedIds.has(img.id)))
      toast.success(t('gallery.bulkDeleteSuccess', { count: selectedIds.size }))
      setSelectedIds(new Set())
      setSelectMode(false)
    } catch {
      toast.error(t('gallery.bulkDeleteFailed'))
    }
  }

  const hasFilters = search.project || search.favorite || search.minRating || search.projectSceneId || search.tag || search.sortBy

  return (
    <div>
      <PageHeader
        title={t('gallery.title')}
        description={t('gallery.imageCount', { count: images.length })}
        actions={
          <div className="flex items-center gap-2">
            <DownloadDialog
              trigger={
                <Button size="sm" variant="outline">
                  <HugeiconsIcon icon={Download04Icon} className="size-4" />
                  {t('download.download')}
                </Button>
              }
              projectId={search.project}
              projectName={allProjects.find((p) => p.id === search.project)?.name}
              availableScenes={projectScenes}
            />
            <Button
              size="sm"
              variant={selectMode ? 'default' : 'outline'}
              onClick={() => {
                setSelectMode(!selectMode)
                setSelectedIds(new Set())
              }}
            >
              {selectMode ? t('gallery.deselect') : t('gallery.select')}
            </Button>
          </div>
        }
      />

      {/* Filter Bar */}
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
            <SelectValue placeholder={t('gallery.allProjects')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('gallery.allProjects')}</SelectItem>
            {allProjects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
              <SelectValue placeholder={t('gallery.allScenes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('gallery.allScenes')}</SelectItem>
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
          {t('gallery.favorites')}
        </Button>

        <Select
          value={search.minRating ? String(search.minRating) : 'all'}
          onValueChange={(v) => navigate({ search: (prev) => ({ ...prev, minRating: v === 'all' ? undefined : Number(v) }) })}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder={t('gallery.anyRating')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('gallery.anyRating')}</SelectItem>
            {[1, 2, 3, 4, 5].map((r) => (
              <SelectItem key={r} value={String(r)}>
                {t('gallery.starsPlus', { count: r })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
              <SelectValue placeholder={t('gallery.allTags')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('gallery.allTags')}</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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
            <SelectItem value="newest">{t('gallery.newestFirst')}</SelectItem>
            <SelectItem value="oldest">{t('gallery.oldestFirst')}</SelectItem>
            <SelectItem value="rating">{t('gallery.highestRated')}</SelectItem>
            <SelectItem value="favorites">{t('gallery.favoritesFirst')}</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={() => navigate({ search: {} })}>
            {t('common.clear')}
          </Button>
        )}
      </div>

      {/* Image Grid — Virtualized */}
      <div ref={gridRef}>
        {images.length === 0 ? (
          <div className="rounded-xl border border-border border-dashed py-16 text-center">
            <HugeiconsIcon icon={Image02Icon} className="size-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-base text-muted-foreground mb-1">{t('gallery.noImagesFound')}</p>
            <p className="text-sm text-muted-foreground mb-4">
              {t('gallery.noImagesDesc')}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/">{t('gallery.goToProjects')}</Link>
            </Button>
          </div>
        ) : (
          <>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: 'relative',
                width: '100%',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const startIdx = virtualRow.index * cols
                const rowImages = images.slice(startIdx, startIdx + cols)
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                    }}
                  >
                    <div style={{ display: 'flex', gap: `${GAP}px` }}>
                      {rowImages.map((img) => (
                        <div
                          key={img.id}
                          style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                          className="shrink-0"
                        >
                          <GalleryImage
                            img={img}
                            search={search}
                            selectMode={selectMode}
                            selected={selectedIds.has(img.id)}
                            onToggleSelect={() => toggleSelect(img.id)}
                            onToggleFavorite={() => handleToggleFavorite(img.id, img.isFavorite)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {loading && (
              <div className="text-center py-4 text-muted-foreground text-base">{t('common.loading')}</div>
            )}
          </>
        )}
      </div>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-16 lg:bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-border rounded-xl px-4 py-2 flex items-center gap-3 shadow-lg">
          <span className="text-base font-medium">{t('gallery.selectedCount', { count: selectedIds.size })}</span>
          <DownloadDialog
            trigger={
              <Button size="sm" variant="outline">
                <HugeiconsIcon icon={Download04Icon} className="size-4" />
                {t('download.download')}
              </Button>
            }
            selectedImageIds={[...selectedIds]}
          />
          <Button size="sm" variant="outline" onClick={handleBulkFavorite}>{t('gallery.addToFavorites')}</Button>
          <ConfirmDialog
            trigger={<Button size="sm" variant="destructive">{t('common.delete')}</Button>}
            title={t('gallery.deleteImages')}
            description={t('gallery.deleteImagesDesc', { count: selectedIds.size })}
            variant="destructive"
            onConfirm={handleBulkDelete}
          />
          <Button size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelectedIds(new Set()) }}>{t('common.cancel')}</Button>
        </div>
      )}
    </div>
  )
}

// ─── Gallery Image Item ──────────────────────────────────────────────────────

function GalleryImage({
  img,
  search,
  selectMode,
  selected,
  onToggleSelect,
  onToggleFavorite,
}: {
  img: { id: number; thumbnailPath: string | null; isFavorite: number | null; rating: number | null }
  search: SearchParams
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onToggleFavorite: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true)
    }
  }, [])

  if (selectMode) {
    return (
      <div
        className="relative group w-full h-full rounded-lg overflow-hidden bg-secondary cursor-pointer"
        onClick={onToggleSelect}
      >
        <ImageContent imgRef={imgRef} img={img} loaded={loaded} onLoad={() => setLoaded(true)} />
        <div className="absolute top-1.5 left-1.5 z-10">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {img.rating ? (
          <div className="absolute bottom-1 left-1.5 text-sm text-primary">
            {'\u2605'.repeat(img.rating)}
          </div>
        ) : null}
        {selected && (
          <div className="absolute inset-0 bg-primary/20 ring-2 ring-primary ring-inset rounded-lg" />
        )}
      </div>
    )
  }

  return (
    <Link
      to="/gallery/$imageId"
      params={{ imageId: String(img.id) }}
      search={search}
      className="relative group w-full h-full rounded-lg overflow-hidden bg-secondary block"
    >
      <ImageContent imgRef={imgRef} img={img} loaded={loaded} onLoad={() => setLoaded(true)} />

      {/* Favorite overlay */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleFavorite()
        }}
        className="absolute top-1.5 right-1.5 p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label={img.isFavorite ? 'Unfavorite' : 'Favorite'}
      >
        <span className={img.isFavorite ? 'text-destructive' : 'text-white/70'}>
          {img.isFavorite ? '\u2764' : '\u2661'}
        </span>
      </button>

      {img.rating ? (
        <div className="absolute bottom-1 left-1.5 text-sm text-primary">
          {'\u2605'.repeat(img.rating)}
        </div>
      ) : null}
    </Link>
  )
}

function ImageContent({
  imgRef,
  img,
  loaded,
  onLoad,
}: {
  imgRef: React.RefObject<HTMLImageElement | null>
  img: { thumbnailPath: string | null }
  loaded: boolean
  onLoad: () => void
}) {
  if (img.thumbnailPath) {
    return (
      <img
        ref={imgRef}
        src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
        alt=""
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        onLoad={onLoad}
      />
    )
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
      No thumb
    </div>
  )
}
