import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n'
import { prepareDownload } from '@/server/functions/download'
import { getSetting, setSetting } from '@/server/functions/settings'
import { resolveFilenameTemplate, DEFAULT_FILENAME_TEMPLATE } from '@/server/services/download'
import { HugeiconsIcon } from '@hugeicons/react'
import { Download04Icon } from '@hugeicons/core-free-icons'

interface SceneItem {
  id: number
  name: string
  packName?: string
}

interface DownloadDialogProps {
  trigger: React.ReactNode
  projectId?: number
  projectName?: string
  availableScenes?: SceneItem[]
  filenameTemplate?: string
  selectedImageIds?: number[]
}

export function DownloadDialog({
  trigger,
  projectId,
  projectName,
  availableScenes,
  filenameTemplate: initialTemplate,
  selectedImageIds,
}: DownloadDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)

  // Filter state
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [minRating, setMinRating] = useState(0)
  const [minWinRate, setMinWinRate] = useState(0)
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<number>>(
    new Set(availableScenes?.map((s) => s.id) ?? []),
  )
  const [template, setTemplate] = useState(initialTemplate || DEFAULT_FILENAME_TEMPLATE)

  const allSceneIds = useMemo(
    () => new Set(availableScenes?.map((s) => s.id) ?? []),
    [availableScenes],
  )
  const allSelected = selectedSceneIds.size === allSceneIds.size && allSceneIds.size > 0

  // Group scenes by pack
  const scenesByPack = useMemo(() => {
    if (!availableScenes) return []
    const groups = new Map<string, SceneItem[]>()
    for (const scene of availableScenes) {
      const pack = scene.packName || ''
      if (!groups.has(pack)) groups.set(pack, [])
      groups.get(pack)!.push(scene)
    }
    return [...groups.entries()].map(([packName, scenes]) => ({ packName, scenes }))
  }, [availableScenes])

  // Reset state when opening — load saved template from settings
  async function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setFavoritesOnly(false)
      setMinRating(0)
      setMinWinRate(0)
      setSelectedSceneIds(new Set(availableScenes?.map((s) => s.id) ?? []))

      // Priority: project-level template > saved global setting > default
      if (initialTemplate) {
        setTemplate(initialTemplate)
      } else {
        const saved = await getSetting({ data: 'filename_template' })
        setTemplate(saved || DEFAULT_FILENAME_TEMPLATE)
      }
    }
    setOpen(isOpen)
  }

  // Template preview
  const preview = useMemo(() => {
    return resolveFilenameTemplate(template || DEFAULT_FILENAME_TEMPLATE, {
      project_name: projectName || 'MyProject',
      scene_name: 'smile',
      seed: 12345,
      index: 1,
      date: '2025-01-15',
      rating: 5,
      id: 42,
      wins: 3,
      win_rate: '75.0',
    }) + '.png'
  }, [template, projectName])

  const isSelectedMode = selectedImageIds && selectedImageIds.length > 0

  async function handleDownload() {
    setPreparing(true)
    try {
      const result = await prepareDownload({
        data: {
          ...(isSelectedMode
            ? { imageIds: selectedImageIds }
            : {
                projectId,
                projectSceneIds: allSelected ? undefined : [...selectedSceneIds],
                isFavorite: favoritesOnly || undefined,
                minRating: minRating > 0 ? minRating : undefined,
                minWinRate: minWinRate > 0 ? minWinRate : undefined,
              }),
          filenameTemplate: template || undefined,
        },
      })

      if (!result.downloadId) {
        toast.error(t('download.noImages'))
        return
      }

      // Trigger download via hidden link
      const a = document.createElement('a')
      a.href = `/api/downloads/${result.downloadId}.zip`
      a.download = `${projectName || 'images'}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      // Save template for reuse
      if (template && template !== DEFAULT_FILENAME_TEMPLATE) {
        setSetting({ data: { key: 'filename_template', value: template } })
      }

      toast.success(t('download.success', { count: result.imageCount }))
      setOpen(false)
    } catch {
      toast.error(t('download.failed'))
    } finally {
      setPreparing(false)
    }
  }

  function toggleScene(sceneId: number) {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev)
      if (next.has(sceneId)) next.delete(sceneId)
      else next.add(sceneId)
      return next
    })
  }

  function togglePack(scenes: SceneItem[]) {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev)
      const packIds = scenes.map((s) => s.id)
      const allPackSelected = packIds.every((id) => next.has(id))
      if (allPackSelected) {
        for (const id of packIds) next.delete(id)
      } else {
        for (const id of packIds) next.add(id)
      }
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedSceneIds(new Set())
    } else {
      setSelectedSceneIds(new Set(allSceneIds))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('download.downloadImages')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Filters (only when not downloading selected images) */}
          {!isSelectedMode && (
            <section className="space-y-3">
              <Label className="text-sm font-medium">{t('download.filters')}</Label>

              {/* Favorites */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dl-favorites"
                  checked={favoritesOnly}
                  onCheckedChange={(v) => setFavoritesOnly(v === true)}
                />
                <Label htmlFor="dl-favorites" className="text-sm cursor-pointer">
                  {t('download.favoritesOnly')}
                </Label>
              </div>

              {/* Min Rating */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t('download.minRating')}</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {minRating > 0 ? `${minRating}+` : '-'}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={5}
                  step={1}
                  value={[minRating]}
                  onValueChange={([v]) => setMinRating(v)}
                />
              </div>

              {/* Min Win Rate */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t('download.minWinRate')}</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {minWinRate > 0 ? `${minWinRate}%` : '-'}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[minWinRate]}
                  onValueChange={([v]) => setMinWinRate(v)}
                />
              </div>

              {/* Scene Selection — inline search + checklist */}
              {availableScenes && availableScenes.length > 0 && (
                <SceneChecklist
                  scenesByPack={scenesByPack}
                  selectedSceneIds={selectedSceneIds}
                  allSelected={allSelected}
                  totalCount={allSceneIds.size}
                  onToggleScene={toggleScene}
                  onTogglePack={togglePack}
                  onToggleAll={toggleAll}
                />
              )}
            </section>
          )}

          {isSelectedMode && (
            <p className="text-sm text-muted-foreground">
              {t('gallery.selectedCount', { count: selectedImageIds!.length })}
            </p>
          )}

          <hr className="border-border" />

          {/* Filename Template */}
          <section className="space-y-2">
            <Label className="text-sm font-medium">{t('download.filenameTemplate')}</Label>
            <Input
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder={DEFAULT_FILENAME_TEMPLATE}
              className="text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t('download.templateHelp')}
            </p>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">{t('download.templatePreview')}:</span>{' '}
              <code className="bg-secondary/60 px-1.5 py-0.5 rounded text-foreground">{preview}</code>
            </div>
          </section>

          {/* Download Button */}
          <Button
            className="w-full"
            onClick={handleDownload}
            disabled={preparing || (!isSelectedMode && selectedSceneIds.size === 0 && availableScenes && availableScenes.length > 0)}
          >
            <HugeiconsIcon icon={Download04Icon} className="size-4" />
            {preparing ? t('download.preparing') : t('download.download')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Scene Checklist (inline with search) ──────────────────────────────────

function SceneChecklist({
  scenesByPack,
  selectedSceneIds,
  allSelected,
  totalCount,
  onToggleScene,
  onTogglePack,
  onToggleAll,
}: {
  scenesByPack: Array<{ packName: string; scenes: SceneItem[] }>
  selectedSceneIds: Set<number>
  allSelected: boolean
  totalCount: number
  onToggleScene: (id: number) => void
  onTogglePack: (scenes: SceneItem[]) => void
  onToggleAll: () => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()

  // Filter scenes by search
  const filteredPacks = useMemo(() => {
    if (!query) return scenesByPack
    return scenesByPack
      .map(({ packName, scenes }) => ({
        packName,
        scenes: scenes.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            packName.toLowerCase().includes(query),
        ),
      }))
      .filter(({ scenes }) => scenes.length > 0)
  }, [scenesByPack, query])

  const hasManyPacks = scenesByPack.length > 1

  return (
    <div className="space-y-2">
      {/* Header row: label + select/deselect all + count */}
      <div className="flex items-center justify-between">
        <Label className="text-sm">{t('scene.scenes')}</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {selectedSceneIds.size}/{totalCount}
          </span>
          <button
            type="button"
            onClick={onToggleAll}
            className="text-xs text-primary hover:underline"
          >
            {allSelected ? t('download.deselectAll') : t('download.selectAll')}
          </button>
        </div>
      </div>

      {/* Search */}
      {totalCount > 8 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('download.searchScenes')}
          className="h-8 text-sm"
        />
      )}

      {/* Scrollable checklist */}
      <div className="max-h-48 overflow-y-auto rounded-md border border-border">
        {filteredPacks.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {t('download.noMatchingScenes')}
          </div>
        ) : (
          filteredPacks.map(({ packName, scenes }) => {
            const packAllSelected = scenes.every((s) => selectedSceneIds.has(s.id))
            const packSomeSelected = scenes.some((s) => selectedSceneIds.has(s.id))

            return (
              <div key={packName}>
                {/* Pack header */}
                {(hasManyPacks || packName) && (
                  <button
                    type="button"
                    onClick={() => onTogglePack(scenes)}
                    className="sticky top-0 z-10 w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-secondary/80 backdrop-blur-sm hover:bg-secondary transition-colors"
                  >
                    <Checkbox
                      checked={packAllSelected ? true : packSomeSelected ? 'indeterminate' : false}
                      tabIndex={-1}
                      className="pointer-events-none"
                    />
                    {packName || 'Unnamed'}
                    <span className="ml-auto tabular-nums">
                      {scenes.filter((s) => selectedSceneIds.has(s.id)).length}/{scenes.length}
                    </span>
                  </button>
                )}
                {/* Scene items */}
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => onToggleScene(scene.id)}
                    className={`w-full flex items-center gap-2 py-1.5 text-sm hover:bg-secondary/60 transition-colors ${hasManyPacks || packName ? 'px-6' : 'px-3'}`}
                  >
                    <Checkbox
                      checked={selectedSceneIds.has(scene.id)}
                      tabIndex={-1}
                      className="pointer-events-none"
                    />
                    <span className="truncate">{scene.name}</span>
                  </button>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
