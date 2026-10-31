import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowExpand01Icon,
  ArrowLeft02Icon,
  BookmarkAdd01Icon,
  Cancel01Icon,
  Delete02Icon,
  Download04Icon,
  FavouriteIcon,
  MoreVerticalIcon,
} from '@hugeicons/core-free-icons'
import type { GalleryFilters } from '@/lib/gallery-filters'
import {
  ImageGenerationInfo,
  ImageLinkedParts,
} from '@/components/common/image-generation-info'
import { ExpandedTextareaDialog } from '@/components/common/expanded-textarea-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { AddToBookmarkPopover } from '@/components/gallery/add-to-bookmark-popover'
import {
  addTag,
  bulkUpdateImages,
  getImageDetailPage,
  removeTag,
  updateImage,
} from '@/server/functions/gallery'
import { updateProjectScene } from '@/server/functions/project-scenes'
import { updateProject } from '@/server/functions/projects'
import { Skeleton } from '@/components/ui/skeleton'
import { toImageQuery } from '@/lib/gallery-filters'
import { useTranslation } from '@/lib/i18n'
import {
  HeaderActions,
  useBreadcrumb,
} from '@/components/layout/breadcrumb-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SELECTION_ICON_BUTTON } from '@/components/common/selection-bar'

function PendingComponent() {
  return (
    <div className="h-full flex flex-col lg:flex-row bg-background">
      {/* Image area */}
      <div className="flex-1 flex items-center justify-center bg-black/40 min-h-0">
        <Skeleton className="w-3/4 aspect-[3/4] max-h-[80%] rounded-lg bg-white/5" />
      </div>

      {/* Detail panel */}
      <div className="h-[40vh] lg:h-auto lg:w-80 bg-card border-t lg:border-t-0 lg:border-l border-border p-4 shrink-0 space-y-4">
        <div className="flex items-center justify-between mb-5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="size-5 rounded" />
        </div>

        {/* Context */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-px w-full" />

        {/* Favorite */}
        <Skeleton className="h-8 w-full rounded-md" />

        {/* Rating */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-10" />
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="size-5 rounded" />
            ))}
          </div>
        </div>
        <Skeleton className="h-px w-full" />

        {/* Memo */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>

        {/* Tags */}
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/gallery/$imageId')({
  loaderDeps: ({ search }) => search as GalleryFilters,
  loader: async ({ params, deps }) => {
    const imageId = Number(params.imageId)
    return getImageDetailPage({
      data: { imageId, filters: toImageQuery(deps) },
    })
  },
  component: ImageDetailOverlay,
  pendingComponent: () => <PendingOverlay />,
})

/**
 * Box of the detail overlay: everything right of the sidebar and below the
 * app header (h-12), so the header (breadcrumb + actions) stays visible.
 * Pure CSS: the left edge follows the sidebar's expanded / icon width.
 */
const OVERLAY_BOX =
  'fixed top-12 right-0 bottom-0 left-0 z-30 bg-background md:left-(--sidebar-width) md:group-has-data-[collapsible=icon]/sidebar-wrapper:left-(--sidebar-width-icon)'

function PendingOverlay() {
  return (
    <div className={OVERLAY_BOX}>
      <PendingComponent />
    </div>
  )
}

function ImageDetailOverlay() {
  return (
    <div data-image-detail className={OVERLAY_BOX}>
      <ImageDetailPage />
    </div>
  )
}

function ImageDetailPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const { t } = useTranslation()
  const { imageId } = Route.useParams()
  useBreadcrumb([
    { label: t('nav.gallery'), to: '/gallery' },
    { label: `#${imageId}` },
  ])

  function goBack() {
    if (window.history.length > 1) {
      router.history.back()
    } else {
      navigate({ to: '/gallery', search })
    }
  }

  async function handleDelete() {
    try {
      await bulkUpdateImages({ data: { imageIds: [detail.id], delete: true } })
      toast.success(t('imageDetail.deleted'))
      // Navigate to next/prev image or back to gallery
      if (detail.nextId) {
        navigate({
          to: '/gallery/$imageId',
          params: { imageId: String(detail.nextId) },
          search,
          replace: true,
        })
      } else if (detail.prevId) {
        navigate({
          to: '/gallery/$imageId',
          params: { imageId: String(detail.prevId) },
          search,
          replace: true,
        })
      } else {
        navigate({ to: '/gallery', search, replace: true })
      }
    } catch {
      toast.error(t('imageDetail.deleteFailed'))
    }
  }

  const [detail, setDetail] = useState(data)
  const [memo, setMemo] = useState(data.memo || '')
  const [memoExpanded, setMemoExpanded] = useState(false)
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    setDetail(data)
    setMemo(data.memo || '')
  }, [data])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      if (e.key === 'ArrowLeft' && detail.prevId) {
        navigate({
          to: '/gallery/$imageId',
          params: { imageId: String(detail.prevId) },
          search,
          replace: true,
        })
      }
      if (e.key === 'ArrowRight' && detail.nextId) {
        navigate({
          to: '/gallery/$imageId',
          params: { imageId: String(detail.nextId) },
          search,
          replace: true,
        })
      }
      if (e.key === 'Escape') {
        goBack()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detail.prevId, detail.nextId, navigate, search])

  async function handleRating(rating: number) {
    const newRating = detail.rating === rating ? null : rating
    await updateImage({ data: { id: detail.id, rating: newRating } })
    setDetail({ ...detail, rating: newRating })
  }

  async function handleFavorite() {
    const newVal = detail.isFavorite ? 0 : 1
    await updateImage({ data: { id: detail.id, isFavorite: newVal } })
    setDetail({ ...detail, isFavorite: newVal })
  }

  async function handleSaveMemo() {
    await updateImage({ data: { id: detail.id, memo } })
    setDetail({ ...detail, memo })
    toast.success(t('imageDetail.memoSaved'))
  }

  async function handleAddTag() {
    if (!newTag.trim()) return
    try {
      const tag = await addTag({
        data: { imageId: detail.id, tagName: newTag.trim() },
      })
      setDetail({
        ...detail,
        tags: [...detail.tags, { tagId: tag.id, tagName: tag.name }],
      })
      setNewTag('')
    } catch {
      toast.error(t('imageDetail.tagFailed'))
    }
  }

  async function handleRemoveTag(tagId: number) {
    await removeTag({ data: { imageId: detail.id, tagId } })
    setDetail({
      ...detail,
      tags: detail.tags.filter((t) => t.tagId !== tagId),
    })
  }

  async function handleSetSceneThumbnail() {
    if (!detail.projectSceneId) return
    try {
      await updateProjectScene({
        data: { id: detail.projectSceneId, thumbnailImageId: detail.id },
      })
      toast.success(t('imageDetail.setSceneThumbSuccess'))
    } catch {
      toast.error(t('imageDetail.setSceneThumbFailed'))
    }
  }

  async function handleSetProjectThumbnail() {
    if (!detail.projectId) return
    try {
      await updateProject({
        data: { id: detail.projectId, thumbnailImageId: detail.id },
      })
      toast.success(t('imageDetail.setProjectThumbSuccess'))
    } catch {
      toast.error(t('imageDetail.setProjectThumbFailed'))
    }
  }

  const imageSrc = detail.filePath
    ? `/api/images/${detail.filePath.replace('data/images/', '')}`
    : ''

  return (
    <div className="h-full flex flex-col lg:flex-row bg-background">
      <HeaderActions>
        <div className="ml-auto" />
        <button
          type="button"
          onClick={handleFavorite}
          className={SELECTION_ICON_BUTTON}
          data-detail-favorite
          title={
            detail.isFavorite
              ? t('imageDetail.favorited')
              : t('imageDetail.favorite')
          }
          aria-label={
            detail.isFavorite
              ? t('imageDetail.favorited')
              : t('imageDetail.favorite')
          }
        >
          <HugeiconsIcon
            icon={FavouriteIcon}
            className={`size-4 ${detail.isFavorite ? 'fill-destructive text-destructive' : ''}`}
          />
        </button>
        <AddToBookmarkPopover
          imageIds={[detail.id]}
          trigger={
            <button
              type="button"
              className={SELECTION_ICON_BUTTON}
              data-detail-bookmark
              title={t('gallery.addToBookmark')}
              aria-label={t('gallery.addToBookmark')}
            >
              <HugeiconsIcon icon={BookmarkAdd01Icon} className="size-4" />
            </button>
          }
        />
        <a
          href={imageSrc}
          download
          className={SELECTION_ICON_BUTTON}
          title={t('imageDetail.download')}
          aria-label={t('imageDetail.download')}
        >
          <HugeiconsIcon icon={Download04Icon} className="size-4" />
        </a>
        {(detail.projectSceneId || detail.projectId) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={SELECTION_ICON_BUTTON}
                aria-label={t('imageDetail.details')}
              >
                <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {detail.projectSceneId && (
                <DropdownMenuItem onSelect={handleSetSceneThumbnail}>
                  {t('imageDetail.sceneThumb')}
                </DropdownMenuItem>
              )}
              {detail.projectId && (
                <DropdownMenuItem onSelect={handleSetProjectThumbnail}>
                  {t('imageDetail.projectThumb')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <ConfirmDialog
          trigger={
            <button
              type="button"
              className={`${SELECTION_ICON_BUTTON} hover:text-destructive`}
              title={t('common.delete')}
              aria-label={t('common.delete')}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </button>
          }
          title={t('imageDetail.deleteTitle')}
          description={t('imageDetail.deleteDesc')}
          onConfirm={handleDelete}
        />
      </HeaderActions>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative bg-black/40 min-h-0">
        {/* Back button */}
        <button
          onClick={goBack}
          className="absolute top-4 left-4 z-10 flex items-center gap-1 text-base text-white/60 hover:text-white transition-colors"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} className="size-5" />
          {t('imageDetail.back')}
        </button>

        {/* Prev */}
        {detail.prevId && (
          <Link
            to="/gallery/$imageId"
            params={{ imageId: String(detail.prevId) }}
            search={search}
            replace
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/80 text-4xl transition-colors z-10"
          >
            &lsaquo;
          </Link>
        )}

        <img
          src={imageSrc}
          alt=""
          className="max-h-full max-w-full object-contain p-12"
        />

        {/* Next */}
        {detail.nextId && (
          <Link
            to="/gallery/$imageId"
            params={{ imageId: String(detail.nextId) }}
            search={search}
            replace
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/80 text-4xl transition-colors z-10"
          >
            &rsaquo;
          </Link>
        )}
      </div>

      {/* Detail panel */}
      <div className="h-[40vh] lg:h-auto lg:w-80 bg-card border-t lg:border-t-0 lg:border-l border-border p-4 overflow-y-auto shrink-0">
        {/* Context */}
        {(detail.projectName || detail.projectSceneName) && (
          <>
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-1.5 block">
                {t('imageDetail.context')}
              </label>
              <div className="space-y-1">
                {detail.projectName && detail.projectId && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">
                      {t('imageDetail.project')}
                    </span>
                    <Link
                      to="/workspace/$projectId"
                      params={{ projectId: String(detail.projectId) }}
                      search={{ imageDetail: undefined }}
                      className="text-sm text-primary hover:underline"
                    >
                      {detail.projectName}
                    </Link>
                  </div>
                )}
                {detail.projectSceneName && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">
                      {t('imageDetail.scene')}
                    </span>
                    {detail.projectId && detail.projectSceneId ? (
                      <Link
                        to="/workspace/$projectId"
                        params={{
                          projectId: String(detail.projectId),
                        }}
                        search={{
                          scene: detail.projectSceneId,
                          imageDetail: undefined,
                        }}
                        className="text-sm text-primary hover:underline"
                      >
                        {detail.projectSceneName}
                      </Link>
                    ) : (
                      <span className="text-sm text-foreground/80">
                        {detail.projectSceneName}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <Separator className="mb-4" />
          </>
        )}

        {/* Rating */}
        <div className="mb-4">
          <label className="text-sm text-muted-foreground mb-1.5 block">
            {t('imageDetail.rating')}
          </label>
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
              >
                {'\u2605'}
              </button>
            ))}
          </div>
        </div>

        <Separator className="mb-4" />

        {/* Memo */}
        <div className="mb-4">
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
          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={handleSaveMemo}
            placeholder={t('imageDetail.addNote')}
            className="text-base min-h-20"
          />
          <ExpandedTextareaDialog
            open={memoExpanded}
            onOpenChange={setMemoExpanded}
            title={t('imageDetail.memo')}
            value={memo}
            onChange={setMemo}
            onBlur={handleSaveMemo}
            placeholder={t('imageDetail.addNote')}
          />
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="text-sm text-muted-foreground mb-1.5 block">
            {t('imageDetail.tags')}
          </label>
          <div className="flex flex-wrap gap-1 mb-2">
            {detail.tags.map((t) => (
              <Badge key={t.tagId} variant="secondary" className="gap-1">
                {t.tagName}
                <button
                  onClick={() => handleRemoveTag(t.tagId)}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder={t('imageDetail.addTag')}
              className="h-7 text-sm"
            />
            <Button size="xs" variant="outline" onClick={handleAddTag}>
              {t('common.add')}
            </Button>
          </div>
        </div>

        <Separator className="mb-4" />

        <ImageLinkedParts imageId={detail.id} />

        <ImageGenerationInfo
          key={detail.id}
          detail={detail}
          imageSrc={imageSrc}
        />
      </div>
    </div>
  )
}
