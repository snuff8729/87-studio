import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BookmarkAdd01Icon,
  CheckListIcon,
  Delete02Icon,
  Download04Icon,
  FavouriteIcon,
  Image02Icon,
  StarIcon,
  Tag01Icon,
} from '@hugeicons/core-free-icons'
import type { GridSize } from '@/lib/use-image-grid-size'
import type { GalleryFilters } from '@/components/gallery/gallery-toolbar'
import {
  GRID_SIZES,
  GalleryToolbar,
} from '@/components/gallery/gallery-toolbar'
import {
  SELECTION_ICON_BUTTON,
  SelectionBar,
} from '@/components/common/selection-bar'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  HeaderActions,
  usePageHeader,
} from '@/components/layout/breadcrumb-context'
import { Button } from '@/components/ui/button'
import { HeaderButton } from '@/components/layout/header-button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  bulkUpdateImages,
  listImages,
  listProjectsForFilter,
  listScenesForFilter,
  listTags,
  updateImage,
} from '@/server/functions/gallery'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from '@/lib/i18n'
import { listBundleNames } from '@/server/functions/bundles'
import {
  parseAxisParam,
  serializeAxisParam,
  toImageQuery,
} from '@/lib/gallery-filters'
import { getLibrary } from '@/server/functions/library'
import { DownloadDialog } from '@/components/common/download-dialog'
import { BulkTagPopover } from '@/components/gallery/bulk-tag-popover'
import { AddToBookmarkPopover } from '@/components/gallery/add-to-bookmark-popover'
import { useImageGridSize } from '@/lib/use-image-grid-size'

function PendingComponent() {
  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Skeleton className="h-7 w-20 rounded-md" />
        <div className="ml-auto flex items-center gap-3">
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-4 w-16 rounded-md" />
        </div>
      </div>

      {/* Image grid */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 15 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

type SearchParams = GalleryFilters & {
  imageDetail: number | undefined
}

export const Route = createFileRoute('/gallery')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    project: search.project ? Number(search.project) : undefined,
    projectSceneId: search.projectSceneId
      ? Number(search.projectSceneId)
      : undefined,
    tag: search.tag ? Number(search.tag) : undefined,
    favorite:
      search.favorite === true || search.favorite === 'true' ? true : undefined,
    minRating: search.minRating ? Number(search.minRating) : undefined,
    minWinRate: search.minWinRate ? Number(search.minWinRate) : undefined,
    bundle: search.bundle ? Number(search.bundle) : undefined,
    sortBy: (search.sortBy as SearchParams['sortBy']) || undefined,
    quick: search.quick === true || search.quick === 'true' ? true : undefined,
    promptTag: search.promptTag
      ? String(search.promptTag).trim() || undefined
      : undefined,
    axis: search.axis
      ? serializeAxisParam(parseAxisParam(String(search.axis)))
      : undefined,
    libraryCharacter: search.libraryCharacter
      ? Number(search.libraryCharacter)
      : undefined,
    outfitItem: search.outfitItem ? Number(search.outfitItem) : undefined,
    imageDetail: search.imageDetail ? Number(search.imageDetail) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [images, allTags, allProjects, allBundles, library] =
      await Promise.all([
      listImages({ data: { page: 1, limit: 40, ...toImageQuery(deps) } }),
      listTags(),
      listProjectsForFilter(),
      listBundleNames(),
      getLibrary({ data: { projectId: deps.project } }),
    ])
    return {
      initialImages: images,
      allTags,
      allProjects,
      allBundles,
      library,
    }
  },
  component: GalleryLayout,
  pendingComponent: PendingComponent,
})

const GAP = 6 // gap-1.5 = 6px

/** Minimum cell width per grid size. Columns derive from the grid's own width. */
const MIN_CELL_WIDTH: Record<GridSize, number> = {
  sm: 112,
  md: 160,
  lg: 240,
}

function columnsFor(width: number, gridSize: GridSize) {
  return Math.max(
    1,
    Math.floor((width + GAP) / (MIN_CELL_WIDTH[gridSize] + GAP)),
  )
}

function GalleryLayout() {
  const {
    initialImages,
    allTags: loadedTags,
    allProjects,
    allBundles,
    library,
  } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const { t } = useTranslation()

  // Detect if a child detail route is active (to lock body scroll)
  const routerState = useRouterState()
  const isDetailOpen = /^\/gallery\/\d+/.test(routerState.location.pathname)

  const [images, setImages] = useState(initialImages)
  const [allTags, setAllTags] = useState(loadedTags)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialImages.length >= 40)

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Scene filter options (loaded when project is selected)
  const [projectScenes, setProjectScenes] = useState<
    Array<{ id: number; name: string }>
  >([])

  // ── Grid size ──
  const { gridSize, setGridSize } = useImageGridSize('gallery')

  // ── Virtualized grid setup ──
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(0)
  const [scrollMargin, setScrollMargin] = useState(0)
  const cols = columnsFor(gridWidth, gridSize)

  useEffect(() => setAllTags(loadedTags), [loadedTags])

  useEffect(() => {
    setImages(initialImages)
    setSelectedIds(new Set())
    setPage(1)
    setHasMore(initialImages.length >= 40)
  }, [initialImages])

  // Lock body scroll when image detail overlay is open
  useEffect(() => {
    if (isDetailOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isDetailOpen])

  // Load scenes when project changes
  useEffect(() => {
    if (search.project) {
      listScenesForFilter({ data: { projectId: search.project } }).then(
        setProjectScenes,
      )
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

  const cellSize =
    gridWidth > 0 ? Math.floor((gridWidth - GAP * (cols - 1)) / cols) : 150
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
      data: { page: nextPage, limit: 40, ...toImageQuery(search) },
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
      prev.map((img) =>
        img.id === imageId ? { ...img, isFavorite: newVal } : img,
      ),
    )
  }

  // Checked ids that are still loaded (filter changes / deletes drop out)
  const selectedList = images
    .filter((img) => selectedIds.has(img.id))
    .map((img) => img.id)

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function toggleAll() {
    setSelectedIds(
      selectedList.length >= images.length
        ? new Set()
        : new Set(images.map((img) => img.id)),
    )
  }

  async function handleBulkFavorite() {
    try {
      await bulkUpdateImages({
        data: { imageIds: selectedList, isFavorite: 1 },
      })
      setImages((prev) =>
        prev.map((img) =>
          selectedList.includes(img.id) ? { ...img, isFavorite: 1 } : img,
        ),
      )
      toast.success(
        t('gallery.bulkFavoriteSuccess', { count: selectedList.length }),
      )
      // Non-destructive: stay in select mode (like Export)
    } catch {
      toast.error(t('gallery.bulkFailed'))
    }
  }

  async function handleBulkDelete() {
    try {
      await bulkUpdateImages({
        data: { imageIds: selectedList, delete: true },
      })
      setImages((prev) => prev.filter((img) => !selectedList.includes(img.id)))
      toast.success(
        t('gallery.bulkDeleteSuccess', { count: selectedList.length }),
      )
      exitSelectMode()
    } catch {
      toast.error(t('gallery.bulkDeleteFailed'))
    }
  }

  function handleFilterChange(patch: Partial<GalleryFilters>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }) })
  }

  function handleClearFilters() {
    navigate({
      search: (prev) => ({ sortBy: prev.sortBy, imageDetail: undefined }),
    })
  }

  return (
    <>
      <div>
        {!isDetailOpen && (
          <GalleryHeader
            count={hasMore ? `${images.length}+` : images.length}
            selectMode={selectMode}
            selectedCount={selectedList.length}
            total={images.length}
            onEnterSelect={() => setSelectMode(true)}
            onExitSelect={exitSelectMode}
            onToggleAll={toggleAll}
            onFavorite={handleBulkFavorite}
            onDelete={handleBulkDelete}
            selectedIds={selectedList}
            tags={allTags}
            onTagsCreated={(created) =>
              setAllTags((prev) =>
                [
                  ...prev,
                  ...created.filter((c) => !prev.some((p) => p.id === c.id)),
                ].sort((a, b) => a.name.localeCompare(b.name)),
              )
            }
            projectId={search.project}
            projectName={allProjects.find((p) => p.id === search.project)?.name}
            scenes={projectScenes}
            axes={parseAxisParam(search.axis)}
            hasLibraryFilter={Boolean(
              search.libraryCharacter || search.outfitItem,
            )}
          />
        )}

        <GalleryToolbar
          filters={search}
          projects={allProjects}
          scenes={projectScenes}
          tags={allTags}
          bundles={allBundles}
          library={library}
          gridSize={gridSize}
          onGridSizeChange={setGridSize}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
        />

        {/* Image Grid — Virtualized */}
        <div
          ref={gridRef}
          data-gallery-grid
          data-grid-size={GRID_SIZES.indexOf(gridSize)}
        >
          {images.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-16 text-center">
              <HugeiconsIcon
                icon={Image02Icon}
                className="mx-auto mb-3 size-10 text-muted-foreground/40"
              />
              <p className="mb-1 text-base text-muted-foreground">
                {t('gallery.noImagesFound')}
              </p>
              <p className="mb-4 text-sm text-muted-foreground">
                {t('gallery.noImagesDesc')}
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/" search={{ imageDetail: undefined }}>
                  {t('gallery.goToProjects')}
                </Link>
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
                            style={{
                              width: `${cellSize}px`,
                              height: `${cellSize}px`,
                            }}
                            className="shrink-0"
                          >
                            <GalleryImage
                              img={img}
                              search={search}
                              selectMode={selectMode}
                              selected={selectedIds.has(img.id)}
                              onToggleSelect={() => toggleSelect(img.id)}
                              onToggleFavorite={() =>
                                handleToggleFavorite(img.id, img.isFavorite)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {loading && (
                <div className="py-4 text-center text-base text-muted-foreground">
                  {t('common.loading')}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Child route: image detail overlay or nothing (index) */}
      <Outlet />
    </>
  )
}

// ─── Header (count, actions, selection) ──────────────────────────────────────

function GalleryHeader({
  count,
  selectMode,
  selectedCount,
  total,
  onEnterSelect,
  onExitSelect,
  onToggleAll,
  onFavorite,
  onDelete,
  selectedIds,
  tags,
  onTagsCreated,
  projectId,
  projectName,
  scenes,
  axes,
  hasLibraryFilter,
}: {
  count: number | string
  selectMode: boolean
  selectedCount: number
  total: number
  onEnterSelect: () => void
  onExitSelect: () => void
  onToggleAll: () => void
  onFavorite: () => void
  onDelete: () => void
  selectedIds: ReadonlyArray<number>
  tags: Array<{ id: number; name: string }>
  onTagsCreated: (created: Array<{ id: number; name: string }>) => void
  projectId: number | undefined
  projectName: string | undefined
  scenes: Array<{ id: number; name: string }>
  axes: Array<{ axisId: number; valueId: number }>
  hasLibraryFilter: boolean
}) {
  const { t } = useTranslation()
  usePageHeader({ count })
  const empty = selectedCount === 0

  return (
    <HeaderActions selecting={selectMode}>
      {selectMode ? (
        <SelectionBar
          count={selectedCount}
          total={total}
          onExit={onExitSelect}
          onToggleAll={onToggleAll}
          selectAllLabel={t('gallery.selectLoaded')}
          deselectAllLabel={t('gallery.deselectLoaded')}
        >
          <button
            type="button"
            className={SELECTION_ICON_BUTTON}
            onClick={onFavorite}
            disabled={empty}
            title={t('gallery.addToFavorites')}
            aria-label={t('gallery.addToFavorites')}
          >
            <HugeiconsIcon icon={FavouriteIcon} className="size-4" />
          </button>
          <BulkTagPopover
            imageIds={selectedIds}
            tags={tags}
            onTagsCreated={onTagsCreated}
            trigger={
              <button
                type="button"
                className={SELECTION_ICON_BUTTON}
                disabled={empty}
                data-gallery-bulk-tag
                title={t('gallery.tagImages')}
                aria-label={t('gallery.tagImages')}
              >
                <HugeiconsIcon icon={Tag01Icon} className="size-4" />
              </button>
            }
          />
          <AddToBookmarkPopover
            imageIds={selectedIds}
            trigger={
              <button
                type="button"
                className={SELECTION_ICON_BUTTON}
                disabled={empty}
                data-gallery-bulk-bookmark
                title={t('gallery.addToBookmark')}
                aria-label={t('gallery.addToBookmark')}
              >
                <HugeiconsIcon icon={BookmarkAdd01Icon} className="size-4" />
              </button>
            }
          />
          <DownloadDialog
            trigger={
              <button
                type="button"
                className={SELECTION_ICON_BUTTON}
                disabled={empty}
                title={t('export.export')}
                aria-label={t('export.export')}
              >
                <HugeiconsIcon icon={Download04Icon} className="size-4" />
              </button>
            }
            selectedImageIds={[...selectedIds]}
          />
          <ConfirmDialog
            trigger={
              <button
                type="button"
                className={`${SELECTION_ICON_BUTTON} hover:text-destructive`}
                disabled={empty}
                title={t('common.delete')}
                aria-label={t('common.delete')}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </button>
            }
            title={t('gallery.deleteImages')}
            description={t('gallery.deleteImagesDesc', {
              count: selectedCount,
            })}
            variant="destructive"
            onConfirm={onDelete}
          />
        </SelectionBar>
      ) : (
        <>
          <div className="ml-auto" />
          <HeaderButton
            variant="outline"
            onClick={onEnterSelect}
            data-gallery-select
            aria-label={t('gallery.select')}
          >
            <HugeiconsIcon icon={CheckListIcon} className="size-4" />
            <span className="hidden sm:inline">{t('gallery.select')}</span>
          </HeaderButton>
          <DownloadDialog
            trigger={
              <HeaderButton
                variant="outline"
                aria-label={t('export.export')}
                data-gallery-export
              >
                <HugeiconsIcon icon={Download04Icon} className="size-4" />
                <span className="hidden sm:inline">{t('export.export')}</span>
              </HeaderButton>
            }
            projectId={projectId}
            projectName={projectName}
            availableScenes={scenes}
            axes={axes}
            libraryFilterIgnored={hasLibraryFilter}
          />
        </>
      )}
    </HeaderActions>
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
  img: {
    id: number
    thumbnailPath: string | null
    isFavorite: number | null
    rating: number | null
  }
  search: SearchParams
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onToggleFavorite: () => void
}) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true)
    }
  }, [])

  const badges = (
    <>
      {img.isFavorite ? (
        <span
          data-favorite-badge
          title={t('gallery.favoriteBadge')}
          className="pointer-events-none absolute top-1.5 left-1.5 z-10 inline-flex size-5 items-center justify-center rounded-full bg-black/55 text-primary"
        >
          <HugeiconsIcon icon={StarIcon} className="size-3 fill-current" />
        </span>
      ) : null}
      {img.rating ? (
        <span className="pointer-events-none absolute bottom-1 left-1.5 rounded bg-black/55 px-1 text-xs text-primary">
          {'★'.repeat(img.rating)}
        </span>
      ) : null}
    </>
  )

  if (selectMode) {
    return (
      <div
        className="group relative h-full w-full cursor-pointer overflow-hidden rounded-lg bg-secondary"
        onClick={onToggleSelect}
      >
        <ImageContent
          imgRef={imgRef}
          img={img}
          loaded={loaded}
          onLoad={() => setLoaded(true)}
        />
        {badges}
        <div className="absolute top-1.5 right-1.5 z-10">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {selected && (
          <div className="absolute inset-0 rounded-lg bg-primary/20 ring-2 ring-primary ring-inset" />
        )}
      </div>
    )
  }

  return (
    <Link
      to="/gallery/$imageId"
      params={{ imageId: String(img.id) }}
      search={search}
      className="group relative block h-full w-full overflow-hidden rounded-lg bg-secondary"
    >
      <ImageContent
        imgRef={imgRef}
        img={img}
        loaded={loaded}
        onLoad={() => setLoaded(true)}
      />
      {badges}

      {/* Favorite toggle (hover) */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleFavorite()
        }}
        className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/55 p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={
          img.isFavorite ? t('gallery.unfavorite') : t('gallery.favorite')
        }
      >
        <HugeiconsIcon
          icon={FavouriteIcon}
          className={`size-3.5 ${img.isFavorite ? 'fill-destructive text-destructive' : 'text-white/80'}`}
        />
      </button>
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
  const { t } = useTranslation()
  if (img.thumbnailPath) {
    return (
      <img
        ref={imgRef}
        src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
        alt=""
        className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        onLoad={onLoad}
      />
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      {t('gallery.noThumbnail')}
    </div>
  )
}
