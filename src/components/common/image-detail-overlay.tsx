import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter, useSearch } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowExpand01Icon,
  ArrowLeft02Icon,
  BookmarkAdd01Icon,
  Cancel01Icon,
  Delete02Icon,
  PackageAddIcon,
  PinIcon,
} from '@hugeicons/core-free-icons'
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
import { SaveAsBundleDialog } from '@/components/common/save-as-bundle-dialog'
import { draftFromStoredMetadata } from '@/lib/save-as-bundle'
import {
  addTag,
  bulkUpdateImages,
  getImageDetailPage,
  removeTag,
  updateImage,
} from '@/server/functions/gallery'
import { updateProjectScene } from '@/server/functions/project-scenes'
import { updateProject } from '@/server/functions/projects'
import { setBundleThumbnail } from '@/server/functions/bundles'
import {
  updateLibraryCharacter,
  updateOutfitItem,
  updatePreset,
} from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'

type DetailData = Awaited<ReturnType<typeof getImageDetailPage>>

export function ImageDetailOverlay({ imageId }: { imageId: number }) {
  const router = useRouter()
  const {
    detailBundle,
    detailTag,
    detailLibChar,
    detailOutfitItem,
    detailPreset,
  } = useSearch({ from: '__root__' })
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getImageDetailPage({
      data: {
        imageId,
        filters:
          detailBundle ||
          detailTag ||
          detailLibChar ||
          detailOutfitItem ||
          detailPreset
            ? {
                bundleId: detailBundle,
                promptTag: detailTag,
                libraryCharacterId: detailLibChar,
                outfitItemId: detailOutfitItem,
                outfitPresetId: detailPreset,
              }
            : undefined,
      },
    })
      .then(setData)
      .catch(() => toast.error('Failed to load image'))
      .finally(() => setLoading(false))
  }, [
    imageId,
    detailBundle,
    detailTag,
    detailLibChar,
    detailOutfitItem,
    detailPreset,
  ])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Keyboard: Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      if (e.key === 'Escape') goBack()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function goBack() {
    router.history.back()
  }

  if (loading || !data) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        data-state="open"
        className="fixed inset-0 z-50 bg-background flex items-center justify-center"
      >
        <div className="size-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-state="open"
      className="fixed inset-0 z-50 bg-background"
    >
      <ImageDetailContent
        data={data}
        setData={setData}
        goBack={goBack}
        bundleId={detailBundle}
        libraryTarget={
          detailLibChar
            ? { kind: 'character', id: detailLibChar }
            : detailOutfitItem
              ? { kind: 'item', id: detailOutfitItem }
              : detailPreset
                ? { kind: 'preset', id: detailPreset }
                : undefined
        }
      />
    </div>
  )
}

function ImageDetailContent({
  data: detail,
  setData: setDetail,
  goBack,
  bundleId,
  libraryTarget,
}: {
  bundleId?: number
  libraryTarget?: { kind: 'character' | 'item' | 'preset'; id: number }
  data: DetailData
  setData: (d: DetailData) => void
  goBack: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [memo, setMemo] = useState(detail.memo || '')
  const [bundleOpen, setBundleOpen] = useState(false)
  const [memoExpanded, setMemoExpanded] = useState(false)
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    setMemo(detail.memo || '')
  }, [detail.id])

  // Navigate between images (replace imageDetail param)
  function goToImage(id: number) {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, imageDetail: id }),
      replace: true,
    } as any)
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      if (e.key === 'ArrowLeft' && detail.prevId) goToImage(detail.prevId)
      if (e.key === 'ArrowRight' && detail.nextId) goToImage(detail.nextId)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [detail.prevId, detail.nextId])

  async function handleDelete() {
    try {
      await bulkUpdateImages({ data: { imageIds: [detail.id], delete: true } })
      toast.success(t('imageDetail.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['library'] })
      if (detail.nextId) goToImage(detail.nextId)
      else if (detail.prevId) goToImage(detail.prevId)
      else goBack()
    } catch {
      toast.error(t('imageDetail.deleteFailed'))
    }
  }

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
      tags: detail.tags.filter((tag) => tag.tagId !== tagId),
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
    <div className="h-dvh flex flex-col lg:flex-row bg-background">
      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative bg-black/40 min-h-0">
        <button
          onClick={goBack}
          className="absolute top-4 left-4 z-10 flex items-center gap-1 text-base text-white/60 hover:text-white transition-colors"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} className="size-5" />
          {t('imageDetail.back')}
        </button>

        {detail.prevId && (
          <button
            onClick={() => goToImage(detail.prevId!)}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/80 text-4xl transition-colors z-10"
          >
            &lsaquo;
          </button>
        )}

        <img
          src={imageSrc}
          alt=""
          className="max-h-full max-w-full object-contain p-12"
        />

        {detail.nextId && (
          <button
            onClick={() => goToImage(detail.nextId!)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/80 text-4xl transition-colors z-10"
          >
            &rsaquo;
          </button>
        )}
      </div>

      {/* Detail panel */}
      <div className="h-[40vh] lg:h-auto lg:w-80 bg-card border-t lg:border-t-0 lg:border-l border-border p-4 overflow-y-auto shrink-0">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-medium">{t('imageDetail.details')}</h3>
          <button
            onClick={goBack}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
          </button>
        </div>

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

        {/* Thumbnail actions */}
        {(detail.projectSceneId || detail.projectId) && (
          <>
            <div className="mb-4 flex gap-2">
              {detail.projectSceneId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSetSceneThumbnail}
                  className="flex-1"
                >
                  {t('imageDetail.sceneThumb')}
                </Button>
              )}
              {detail.projectId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSetProjectThumbnail}
                  className="flex-1"
                >
                  {t('imageDetail.projectThumb')}
                </Button>
              )}
            </div>
            <Separator className="mb-4" />
          </>
        )}

        {/* Favorite */}
        <div className="mb-4">
          <Button
            size="sm"
            variant={detail.isFavorite ? 'default' : 'outline'}
            onClick={handleFavorite}
            className="w-full"
          >
            {detail.isFavorite
              ? '\u2764 ' + t('imageDetail.favorited')
              : '\u2661 ' + t('imageDetail.favorite')}
          </Button>
        </div>

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
                className={`text-lg transition-colors ${detail.rating && r <= detail.rating ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
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
            {detail.tags.map((tag) => (
              <Badge key={tag.tagId} variant="secondary" className="gap-1">
                {tag.tagName}
                <button
                  onClick={() => handleRemoveTag(tag.tagId)}
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

        <div className="flex flex-col gap-2">
          {/* Bundle context: explicit thumbnail action */}
          {bundleId && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              data-detail-bundle-thumb
              onClick={async () => {
                try {
                  await setBundleThumbnail({
                    data: { bundleId, imageId: detail.id },
                  })
                  window.dispatchEvent(
                    new CustomEvent('bundle-thumbnail-changed'),
                  )
                  toast.success(t('bundles.thumbnailSet'))
                } catch {
                  toast.error(t('bundles.thumbnailFailed'))
                }
              }}
            >
              <HugeiconsIcon icon={PinIcon} className="size-4" />
              {t('bundles.thumbAction')}
            </Button>
          )}

          {/* Library context: explicit thumbnail action */}
          {libraryTarget && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              data-detail-library-thumb
              onClick={async () => {
                try {
                  const payload = {
                    id: libraryTarget.id,
                    thumbnailImageId: detail.id,
                  }
                  if (libraryTarget.kind === 'character')
                    await updateLibraryCharacter({ data: payload })
                  else if (libraryTarget.kind === 'preset')
                    await updatePreset({ data: payload })
                  else await updateOutfitItem({ data: payload })
                  window.dispatchEvent(
                    new CustomEvent('library-thumbnail-changed'),
                  )
                  toast.success(t('library.thumbnailSet'))
                } catch {
                  toast.error(t('library.thumbnailFailed'))
                }
              }}
            >
              <HugeiconsIcon icon={PinIcon} className="size-4" />
              {t('library.setThumbnail')}
            </Button>
          )}

          {/* Add to tag bookmark */}
          <AddToBookmarkPopover
            imageIds={[detail.id]}
            align="start"
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                data-detail-bookmark
              >
                <HugeiconsIcon icon={BookmarkAdd01Icon} className="size-4" />
                {t('gallery.addToBookmark')}
              </Button>
            }
          />

          {/* Save prompt + settings as a bundle */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            data-detail-save-bundle
            onClick={() => setBundleOpen(true)}
          >
            <HugeiconsIcon icon={PackageAddIcon} className="size-4" />
            {t('bundles.saveAsBundle')}
          </Button>
          <SaveAsBundleDialog
            open={bundleOpen}
            onOpenChange={setBundleOpen}
            source={draftFromStoredMetadata(detail.metadata)}
            image={{ type: 'gallery', imageId: detail.id }}
          />

          {/* Download + Delete */}
          <div className="flex gap-2">
            <a href={imageSrc} download className="flex-1">
              <Button variant="outline" size="sm" className="w-full">
                {t('imageDetail.download')}
              </Button>
            </a>
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm">
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </Button>
              }
              title={t('imageDetail.deleteTitle')}
              description={t('imageDetail.deleteDesc')}
              onConfirm={handleDelete}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
