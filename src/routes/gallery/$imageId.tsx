import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  getImageDetailPage,
  updateImage,
  addTag,
  removeTag,
} from '@/server/functions/gallery'
import { updateProjectScene } from '@/server/functions/project-scenes'
import { updateProject } from '@/server/functions/projects'

type SearchParams = {
  project?: number
  projectSceneId?: number
  tag?: number
  favorite?: boolean
  minRating?: number
  sortBy?: 'newest' | 'oldest' | 'rating' | 'favorites'
}

export const Route = createFileRoute('/gallery/$imageId')({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    project: search.project ? Number(search.project) : undefined,
    projectSceneId: search.projectSceneId ? Number(search.projectSceneId) : undefined,
    tag: search.tag ? Number(search.tag) : undefined,
    favorite: search.favorite === true || search.favorite === 'true' ? true : undefined,
    minRating: search.minRating ? Number(search.minRating) : undefined,
    sortBy: (search.sortBy as SearchParams['sortBy']) || undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const imageId = Number(params.imageId)
    return getImageDetailPage({
      data: {
        imageId,
        projectId: deps.project,
        projectSceneId: deps.projectSceneId,
      },
    })
  },
  component: ImageDetailPage,
})

function ImageDetailPage() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()

  function goBack() {
    if (window.history.length > 1) {
      router.history.back()
    } else {
      navigate({ to: '/gallery', search })
    }
  }

  const [detail, setDetail] = useState(data)
  const [memo, setMemo] = useState(data.memo || '')
  const [newTag, setNewTag] = useState('')
  const [refExpanded, setRefExpanded] = useState(false)

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
        })
      }
      if (e.key === 'ArrowRight' && detail.nextId) {
        navigate({
          to: '/gallery/$imageId',
          params: { imageId: String(detail.nextId) },
          search,
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
    toast.success('메모가 저장되었습니다')
  }

  async function handleAddTag() {
    if (!newTag.trim()) return
    try {
      const tag = await addTag({ data: { imageId: detail.id, tagName: newTag.trim() } })
      setDetail({
        ...detail,
        tags: [...detail.tags, { tagId: tag.id, tagName: tag.name }],
      })
      setNewTag('')
    } catch {
      toast.error('태그 추가에 실패했습니다')
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
      await updateProjectScene({ data: { id: detail.projectSceneId, thumbnailImageId: detail.id } })
      toast.success('Set as scene thumbnail')
    } catch {
      toast.error('Failed to set scene thumbnail')
    }
  }

  async function handleSetProjectThumbnail() {
    if (!detail.projectId) return
    try {
      await updateProject({ data: { id: detail.projectId, thumbnailImageId: detail.id } })
      toast.success('Set as project thumbnail')
    } catch {
      toast.error('Failed to set project thumbnail')
    }
  }

  const imageSrc = detail.filePath
    ? `/api/images/${detail.filePath.replace('data/images/', '')}`
    : ''

  const meta = detail.metadata
    ? (() => {
        try {
          return JSON.parse(detail.metadata)
        } catch {
          return null
        }
      })()
    : null

  return (
    <div className="h-dvh flex flex-col lg:flex-row bg-background">
      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative bg-black/40 min-h-0">
        {/* Back button */}
        <button
          onClick={goBack}
          className="absolute top-4 left-4 z-10 flex items-center gap-1 text-base text-white/60 hover:text-white transition-colors"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} className="size-5" />
          Back
        </button>

        {/* Prev */}
        {detail.prevId && (
          <Link
            to="/gallery/$imageId"
            params={{ imageId: String(detail.prevId) }}
            search={search}
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
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/80 text-4xl transition-colors z-10"
          >
            &rsaquo;
          </Link>
        )}
      </div>

      {/* Detail panel */}
      <div className="h-[40vh] lg:h-auto lg:w-80 bg-card border-t lg:border-t-0 lg:border-l border-border p-4 overflow-y-auto shrink-0">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-medium">Details</h3>
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
                Context
              </label>
              <div className="space-y-1">
                {detail.projectName && detail.projectId && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">Project:</span>
                    <Link
                      to="/workspace/$projectId"
                      params={{ projectId: String(detail.projectId) }}
                      className="text-sm text-primary hover:underline"
                    >
                      {detail.projectName}
                    </Link>
                  </div>
                )}
                {detail.projectSceneName && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">Scene:</span>
                    {detail.projectId && detail.projectSceneId ? (
                      <Link
                        to="/workspace/$projectId/scenes/$sceneId"
                        params={{
                          projectId: String(detail.projectId),
                          sceneId: String(detail.projectSceneId),
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
                <Button size="sm" variant="outline" onClick={handleSetSceneThumbnail} className="flex-1">
                  Scene Thumb
                </Button>
              )}
              {detail.projectId && (
                <Button size="sm" variant="outline" onClick={handleSetProjectThumbnail} className="flex-1">
                  Project Thumb
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
            {detail.isFavorite ? '\u2764 Favorited' : '\u2661 Favorite'}
          </Button>
        </div>

        {/* Rating */}
        <div className="mb-4">
          <label className="text-sm text-muted-foreground mb-1.5 block">
            Rating
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
          <label className="text-sm text-muted-foreground mb-1.5 block">
            Memo
          </label>
          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={handleSaveMemo}
            placeholder="Add a note..."
            className="text-base min-h-20"
          />
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="text-sm text-muted-foreground mb-1.5 block">
            Tags
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
              placeholder="Add tag..."
              className="h-7 text-sm"
            />
            <Button size="xs" variant="outline" onClick={handleAddTag}>
              Add
            </Button>
          </div>
        </div>

        <Separator className="mb-4" />

        {/* Reference (collapsible) */}
        <div className="mb-4">
          <button
            onClick={() => setRefExpanded(!refExpanded)}
            className="flex items-center justify-between w-full text-sm text-muted-foreground mb-2 hover:text-foreground transition-colors"
          >
            <span>Reference</span>
            <span className="text-xs">{refExpanded ? '\u25B2' : '\u25BC'}</span>
          </button>

          {refExpanded && (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-150">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">
                  Metadata
                </label>
                <div className="text-sm space-y-1 text-muted-foreground">
                  <p>Seed: {detail.seed ?? 'N/A'}</p>
                  <p>
                    Created: {new Date(detail.createdAt!).toLocaleString()}
                  </p>
                </div>
              </div>

              {meta?.parameters && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    Parameters
                  </label>
                  <div className="text-sm space-y-0.5 text-muted-foreground">
                    {meta.parameters.width && (
                      <p>
                        Size: {meta.parameters.width}x{meta.parameters.height}
                      </p>
                    )}
                    {meta.parameters.steps && <p>Steps: {meta.parameters.steps}</p>}
                    {meta.parameters.cfg_scale && (
                      <p>CFG: {meta.parameters.cfg_scale}</p>
                    )}
                    {meta.parameters.sampler && (
                      <p>Sampler: {meta.parameters.sampler}</p>
                    )}
                  </div>
                </div>
              )}

              {meta?.prompts?.generalPrompt && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    General Prompt
                  </label>
                  <p className="text-sm font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-2 rounded-md max-h-32 overflow-y-auto">
                    {meta.prompts.generalPrompt}
                  </p>
                </div>
              )}

              {meta?.prompts?.negativePrompt && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    Negative Prompt
                  </label>
                  <p className="text-sm font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-2 rounded-md max-h-24 overflow-y-auto">
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
      </div>
    </div>
  )
}
