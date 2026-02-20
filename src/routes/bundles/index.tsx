import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Delete02Icon,
  Copy01Icon,
  Search01Icon,
  Image02Icon,
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
import { useBundleNames } from '@/lib/use-bundles'
import {
  listBundles,
  getBundle,
  createBundle,
  updateBundle,
  deleteBundle,
  setBundleThumbnail,
  listBundleImages,
} from '@/server/functions/bundles'
import { useQueryClient } from '@tanstack/react-query'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

function LazyPromptEditor(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: string
  bundleNames?: Array<{ name: string; content: string }>
}) {
  return (
    <Suspense
      fallback={
        <Textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          className="font-mono text-base min-h-[200px]"
          rows={8}
        />
      }
    >
      <PromptEditor {...props} />
    </Suspense>
  )
}

export const Route = createFileRoute('/bundles/')({
  component: BundlesPage,
  loader: () => listBundles(),
})

function BundlesPage() {
  const initialBundles = Route.useLoaderData()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const bundleNamesForEditor = useBundleNames()

  const [bundles, setBundles] = useState(initialBundles)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  // Sync loader data
  useEffect(() => {
    setBundles(initialBundles)
  }, [initialBundles])

  // Detail state
  const [detail, setDetail] = useState<{
    id: number
    name: string
    description: string | null
    content: string
    thumbnailImageId: number | null
    imageCount: number
  } | null>(null)

  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editContent, setEditContent] = useState('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Images for selected bundle
  const [bundleImages, setBundleImages] = useState<Array<{
    id: number
    thumbnailPath: string | null
    filePath: string
    seed: number | null
    isFavorite: number | null
    rating: number | null
  }>>([])

  // Create dialog state
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  // Load detail when selection changes
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null)
      setBundleImages([])
      return
    }
    getBundle({ data: selectedId }).then((d) => {
      setDetail(d)
      setEditName(d.name)
      setEditDescription(d.description ?? '')
      setEditContent(d.content)
    })
    listBundleImages({ data: { bundleId: selectedId, limit: 40 } }).then(setBundleImages)
  }, [selectedId])

  const refreshList = useCallback(async () => {
    const updated = await listBundles()
    setBundles(updated)
    queryClient.invalidateQueries({ queryKey: ['bundleNames'] })
  }, [queryClient])

  // Debounced save
  function scheduleSave(name: string, description: string, content: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!selectedId) return
      try {
        await updateBundle({ data: { id: selectedId, name, description, content } })
        refreshList()
      } catch {
        toast.error(t('bundles.updateFailed'))
      }
    }, 800)
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    try {
      const result = await createBundle({ data: { name } })
      toast.success(t('bundles.bundleCreated'))
      setNewName('')
      setCreating(false)
      await refreshList()
      setSelectedId(result.id)
    } catch {
      toast.error(t('bundles.createFailed'))
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteBundle({ data: id })
      toast.success(t('bundles.bundleDeleted'))
      if (selectedId === id) {
        setSelectedId(null)
      }
      refreshList()
    } catch {
      toast.error(t('bundles.deleteFailed'))
    }
  }

  async function handleSetThumbnail(imageId: number) {
    if (!selectedId) return
    try {
      await setBundleThumbnail({ data: { bundleId: selectedId, imageId } })
      toast.success(t('bundles.thumbnailSet'))
      refreshList()
      // Refresh detail
      const d = await getBundle({ data: selectedId })
      setDetail(d)
    } catch {
      toast.error(t('bundles.thumbnailFailed'))
    }
  }

  function handleNameChange(name: string) {
    setEditName(name)
    scheduleSave(name, editDescription, editContent)
  }

  function handleDescriptionChange(desc: string) {
    setEditDescription(desc)
    scheduleSave(editName, desc, editContent)
  }

  function handleContentChange(content: string) {
    setEditContent(content)
    scheduleSave(editName, editDescription, content)
  }

  function handleCopyUsage(name: string) {
    navigator.clipboard.writeText(`@{${name}}`)
    toast.success(t('common.copied'))
  }

  const filtered = search
    ? bundles.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
    : bundles

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('bundles.title')}
        description={t('bundles.description')}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left panel — bundle list */}
        <div className="w-72 lg:w-80 border-r border-border flex flex-col shrink-0">
          {/* Search + create */}
          <div className="p-3 space-y-2 border-b border-border">
            <div className="relative">
              <HugeiconsIcon icon={Search01Icon} className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('bundles.searchBundles')}
                className="h-8 pl-8 text-sm"
              />
            </div>
            {creating ? (
              <div className="flex gap-1.5">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('bundles.bundleName')}
                  className="h-7 text-sm flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setCreating(false); setNewName('') }
                  }}
                />
                <Button size="xs" onClick={handleCreate} disabled={!newName.trim()}>
                  {t('common.create')}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => { setCreating(false); setNewName('') }}>
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setCreating(true)}>
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
                {t('bundles.createBundle')}
              </Button>
            )}
          </div>

          {/* Bundle list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <p className="text-sm text-muted-foreground">
                  {bundles.length === 0 ? t('bundles.noBundlesYet') : t('bundles.noBundlesDesc')}
                </p>
              </div>
            ) : (
              <div className="p-2 grid grid-cols-2 gap-1.5">
                {filtered.map((bundle) => {
                  const isActive = selectedId === bundle.id
                  const thumbSrc = bundle.thumbnailPath
                    ? `/api/thumbnails/${bundle.thumbnailPath.replace('data/thumbnails/', '')}`
                    : null

                  return (
                    <button
                      key={bundle.id}
                      onClick={() => setSelectedId(bundle.id)}
                      className={`relative rounded-lg overflow-hidden transition-all ${
                        isActive
                          ? 'ring-2 ring-primary'
                          : 'ring-1 ring-border hover:ring-muted-foreground/40'
                      }`}
                    >
                      {/* Thumbnail area */}
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
                            <HugeiconsIcon icon={Image02Icon} className="size-8 text-muted-foreground/20" />
                          </div>
                        )}
                      </div>
                      {/* Info overlay at bottom */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-2 pb-1.5 pt-5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium truncate text-white">{bundle.name}</span>
                          {bundle.imageCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0 bg-white/20 text-white border-0">
                              {bundle.imageCount}
                            </Badge>
                          )}
                        </div>
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
              <p className="text-sm">{t('bundles.selectBundle')}</p>
            </div>
          ) : (
            <div className="p-4 lg:p-6 space-y-5 max-w-3xl">
              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{t('bundles.bundleName')}</Label>
                <Input
                  value={editName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="text-base font-medium"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">{t('bundles.descriptionPlaceholder')}</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  placeholder={t('bundles.descriptionPlaceholder')}
                  className="text-sm"
                />
              </div>

              {/* Usage hint */}
              <div className="flex items-center gap-2">
                <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                  @{'{' + detail.name + '}'}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleCopyUsage(detail.name)}
                  title={t('common.copied')}
                >
                  <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                </Button>
              </div>

              <Separator />

              {/* Content */}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground uppercase tracking-wider">
                  {t('bundles.bundleContent')}
                </Label>
                <LazyPromptEditor
                  value={editContent}
                  onChange={handleContentChange}
                  placeholder={t('bundles.contentPlaceholder')}
                  minHeight="200px"
                  bundleNames={bundleNamesForEditor}
                />
              </div>

              <Separator />

              {/* Linked images */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground uppercase tracking-wider">
                    {t('bundles.imageCount', { count: detail.imageCount })}
                  </Label>
                </div>

                {bundleImages.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {t('bundles.noImages')}
                  </p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
                    {bundleImages.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => handleSetThumbnail(img.id)}
                        className={`relative aspect-square rounded-md overflow-hidden bg-secondary group ${
                          detail.thumbnailImageId === img.id ? 'ring-2 ring-primary' : ''
                        }`}
                        title={t('bundles.setThumbnail')}
                      >
                        {img.thumbnailPath ? (
                          <img
                            src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <HugeiconsIcon icon={Image02Icon} className="size-4 text-muted-foreground/30" />
                          </div>
                        )}
                      </button>
                    ))}
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
                  title={t('bundles.deleteBundle')}
                  description={t('bundles.deleteBundleDesc', { name: detail.name })}
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
