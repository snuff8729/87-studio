import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft02Icon,
  ArrowRight01Icon,
  Add01Icon,
  Delete02Icon,
  Image02Icon,
  Menu01Icon,
  TimeQuarter02Icon,
  PlayIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NumberStepper } from '@/components/ui/number-stepper'
import { WorkspaceLayout } from '@/components/workspace/workspace-layout'
import { ParameterPopover } from '@/components/workspace/parameter-popover'
import { GenerationProgress } from '@/components/workspace/generation-progress'
import { GridSizeToggle } from '@/components/common/grid-size-toggle'
import { useImageGridSize, type GridSize } from '@/lib/use-image-grid-size'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from '@/lib/i18n'
import { useBundleNames } from '@/lib/use-bundles'
import { createQuickGenerationJob, listQuickImages, listQuickJobs } from '@/server/functions/quick-generation'
import { cancelJobs, pauseGeneration, resumeGeneration, dismissGenerationError } from '@/server/functions/generation'
import { updateImage } from '@/server/functions/gallery'

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

export const Route = createFileRoute('/generate/')({
  component: QuickGeneratePage,
})

const STORAGE_KEY = '87studio-quick-generate'

interface CharacterEntry {
  id: string
  name: string
  prompt: string
  negative: string
}

interface QuickGenerateState {
  generalPrompt: string
  negativePrompt: string
  characters: CharacterEntry[]
  parameters: Record<string, unknown>
  count: number
}

function loadState(): QuickGenerateState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return {
    generalPrompt: '',
    negativePrompt: '',
    characters: [],
    parameters: {},
    count: 4,
  }
}

function saveState(state: QuickGenerateState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}

function QuickGeneratePage() {
  const { t } = useTranslation()
  const router = useRouter()

  // ── State ──
  const [state, setState] = useState<QuickGenerateState>(loadState)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Image history
  const [images, setImages] = useState<Array<{
    id: number
    thumbnailPath: string | null
    filePath: string
    seed: number | null
    isFavorite: number | null
    rating: number | null
    metadata: string | null
    createdAt: string | null
  }>>([])
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)

  // Generation progress
  const [activeJobs, setActiveJobs] = useState<Array<{
    id: number
    status: string | null
    totalCount: number | null
    completedCount: number | null
    errorMessage?: string | null
    sceneName: string | null
  }>>([])
  const [batchTiming, setBatchTiming] = useState<{
    startedAt: number
    totalImages: number
    completedImages: number
    avgImageDurationMs: number | null
  } | null>(null)
  const [queueStopped, setQueueStopped] = useState<'error' | 'paused' | null>(null)

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Router state (from metadata page) ──
  useEffect(() => {
    const routerState = (router.state.location.state as any) ?? {}
    if (routerState.generalPrompt != null || routerState.negativePrompt != null || routerState.characterPrompts != null) {
      setState((prev) => {
        const next = { ...prev }
        if (routerState.generalPrompt != null) next.generalPrompt = routerState.generalPrompt
        if (routerState.negativePrompt != null) next.negativePrompt = routerState.negativePrompt
        if (routerState.characterPrompts) {
          next.characters = routerState.characterPrompts.map((c: any, i: number) => ({
            id: `imported-${i}`,
            name: c.name || `Character ${i + 1}`,
            prompt: c.prompt || c.charPrompt || '',
            negative: c.negative || c.charNegative || '',
          }))
        }
        if (routerState.parameters) {
          next.parameters = { ...prev.parameters, ...routerState.parameters }
        }
        saveState(next)
        return next
      })
      // Clear the router state to prevent re-applying on navigation
      window.history.replaceState({}, '')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist state ──
  useEffect(() => {
    saveState(state)
  }, [state])

  // ── Load initial images ──
  useEffect(() => {
    listQuickImages({ data: { limit: 100 } }).then((imgs) => {
      setImages(imgs)
      if (imgs.length > 0 && !selectedImageId) {
        setSelectedImageId(imgs[0].id)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling ──
  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(async () => {
      try {
        const [newImages, jobData] = await Promise.all([
          listQuickImages({ data: { limit: 100 } }),
          listQuickJobs(),
        ])

        setImages((prev) => {
          if (newImages.length > prev.length || (newImages.length > 0 && newImages[0].id !== prev[0]?.id)) {
            // Auto-select newest image (polling only runs during generation)
            if (newImages[0]) {
              setSelectedImageId(newImages[0].id)
            }
            return newImages
          }
          return prev
        })

        const mappedJobs = jobData.jobs.map((j) => ({
          ...j,
          sceneName: 'Quick Generate' as string | null,
        }))
        setActiveJobs(mappedJobs)
        setBatchTiming(jobData.batchTiming)
        setQueueStopped(jobData.queueStatus.queueStopped)

        // Stop polling if no more active jobs
        if (mappedJobs.length === 0 && !jobData.queueStatus.processing) {
          stopPolling()
          setGenerating(false)
        }
      } catch { /* ignore polling errors */ }
    }, 1000)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  // Check if there are active jobs on mount
  useEffect(() => {
    listQuickJobs().then((jobData) => {
      const mappedJobs = jobData.jobs.map((j) => ({
        ...j,
        sceneName: 'Quick Generate' as string | null,
      }))
      setActiveJobs(mappedJobs)
      setBatchTiming(jobData.batchTiming)
      setQueueStopped(jobData.queueStatus.queueStopped)

      if (mappedJobs.length > 0 || jobData.queueStatus.processing) {
        setGenerating(true)
        startPolling()
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──
  async function handleGenerate() {
    if (!state.generalPrompt.trim()) {
      toast.error(t('quickGenerate.emptyState'))
      return
    }

    setGenerating(true)
    try {
      await createQuickGenerationJob({
        data: {
          generalPrompt: state.generalPrompt,
          negativePrompt: state.negativePrompt,
          characterPrompts: state.characters.map((c) => ({
            name: c.name,
            prompt: c.prompt,
            negative: c.negative,
          })),
          parameters: state.parameters,
          count: state.count,
        },
      })
      toast.success(t('generation.generationStarted', { count: state.count }))
      startPolling()
    } catch {
      toast.error(t('generation.generationFailed'))
      setGenerating(false)
    }
  }

  function handleCancelJobs() {
    const jobIds = activeJobs.map((j) => j.id)
    if (jobIds.length === 0) return
    cancelJobs({ data: jobIds }).then(() => {
      toast.success(t('generation.cancelled'))
      setActiveJobs([])
      setGenerating(false)
      stopPolling()
    })
  }

  function handlePause() {
    pauseGeneration()
  }

  function handleResume() {
    resumeGeneration().then(() => startPolling())
  }

  function handleDismissError() {
    dismissGenerationError().then(() => startPolling())
  }

  function addCharacter() {
    setState((prev) => ({
      ...prev,
      characters: [
        ...prev.characters,
        {
          id: `char-${Date.now()}`,
          name: `Character ${prev.characters.length + 1}`,
          prompt: '',
          negative: '',
        },
      ],
    }))
  }

  function removeCharacter(id: string) {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.filter((c) => c.id !== id),
    }))
  }

  function updateCharacterField(id: string, field: keyof CharacterEntry, value: string) {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }))
  }

  const selectedImage = images.find((img) => img.id === selectedImageId) ?? null

  // ── Favorite toggle on selected image ──
  async function handleToggleFavorite() {
    if (!selectedImage) return
    const newVal = selectedImage.isFavorite ? 0 : 1
    await updateImage({ data: { id: selectedImage.id, isFavorite: newVal } })
    setImages((prev) =>
      prev.map((img) => (img.id === selectedImage.id ? { ...img, isFavorite: newVal } : img)),
    )
  }

  // ── Rating on selected image ──
  async function handleSetRating(rating: number) {
    if (!selectedImage) return
    const newRating = selectedImage.rating === rating ? null : rating
    await updateImage({ data: { id: selectedImage.id, rating: newRating } })
    setImages((prev) =>
      prev.map((img) => (img.id === selectedImage.id ? { ...img, rating: newRating } : img)),
    )
  }

  // Parse image metadata for display
  const imageParams = selectedImage?.metadata ? (() => {
    try {
      const meta = JSON.parse(selectedImage.metadata!)
      return meta.parameters ?? null
    } catch { return null }
  })() : null

  const batchTotal = activeJobs.reduce((sum, j) => sum + ((j.totalCount ?? 0) - (j.completedCount ?? 0)), 0)

  return (
    <WorkspaceLayout
      leftOpen={leftOpen}
      rightOpen={rightOpen}
      onDismiss={() => { setLeftOpen(false); setRightOpen(false) }}
      header={
        <QuickGenerateHeader
          onToggleLeft={() => setLeftOpen(!leftOpen)}
          onToggleRight={() => setRightOpen(!rightOpen)}
        />
      }
      leftPanel={
        <PromptPanelLocal
          state={state}
          setState={setState}
          addCharacter={addCharacter}
          removeCharacter={removeCharacter}
          updateCharacterField={updateCharacterField}
        />
      }
      centerPanel={
        <CenterPreview
          selectedImage={selectedImage}
          imageParams={imageParams}
          onToggleFavorite={handleToggleFavorite}
          onSetRating={handleSetRating}
        />
      }
      rightPanel={
        <HistoryPanelLocal
          images={images}
          selectedImageId={selectedImageId}
          onSelect={setSelectedImageId}
        />
      }
      bottomToolbar={
        <div className="border-t border-border bg-background shrink-0 grid px-3 pb-2 lg:pb-0 gap-x-2 grid-cols-[auto_1fr] grid-rows-[2.25rem_2.75rem] lg:grid-cols-[auto_1fr_auto] lg:grid-rows-[3rem]">
          <div className="flex items-center gap-1">
            <ParameterPopover
              params={state.parameters}
              onChange={(p) => setState((prev) => ({ ...prev, parameters: p }))}
            />
          </div>
          <div className="flex items-center justify-end lg:justify-center min-w-0 overflow-hidden">
            <GenerationProgress
              jobs={activeJobs}
              batchTotal={batchTotal}
              batchTiming={batchTiming}
              queueStopped={queueStopped}
              onCancel={handleCancelJobs}
              onPause={handlePause}
              onResume={handleResume}
              onDismissError={handleDismissError}
            />
          </div>
          <div className="flex items-center justify-center lg:justify-end gap-1.5 col-span-2 lg:col-span-1">
            <NumberStepper
              value={state.count}
              onChange={(v) => setState((prev) => ({ ...prev, count: Math.max(1, v ?? 1) }))}
              min={1}
              max={100}
              size="md"
            />
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generating || !state.generalPrompt.trim()}
            >
              <HugeiconsIcon icon={PlayIcon} className="size-5" />
              <span className="hidden sm:inline">
                {generating ? t('generation.generating') : t('generation.generateCount', { count: state.count })}
              </span>
            </Button>
          </div>
        </div>
      }
    />
  )
}

// ─── Header ──────────────────────────────────────────────────────────────

function QuickGenerateHeader({
  onToggleLeft,
  onToggleRight,
}: {
  onToggleLeft: () => void
  onToggleRight: () => void
}) {
  const { t } = useTranslation()

  return (
    <header className="h-12 border-b border-border bg-background flex items-center justify-between px-3 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="sm" asChild className="shrink-0">
          <Link to="/">
            <HugeiconsIcon icon={ArrowLeft02Icon} className="size-5" />
            <span className="hidden sm:inline">{t('common.back')}</span>
          </Link>
        </Button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-base font-semibold truncate">{t('quickGenerate.title')}</h1>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onToggleLeft} className="lg:hidden">
          <HugeiconsIcon icon={Menu01Icon} className="size-5" />
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gallery" search={{ quick: true }}>
            <HugeiconsIcon icon={Image02Icon} className="size-5" />
            <span className="hidden sm:inline">{t('nav.gallery')}</span>
          </Link>
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleRight} className="lg:hidden">
          <HugeiconsIcon icon={TimeQuarter02Icon} className="size-5" />
        </Button>
      </div>
    </header>
  )
}

// ─── Prompt Panel (Local) ─────────────────────────────────────────────────

function PromptPanelLocal({
  state,
  setState,
  addCharacter,
  removeCharacter,
  updateCharacterField,
}: {
  state: QuickGenerateState
  setState: React.Dispatch<React.SetStateAction<QuickGenerateState>>
  addCharacter: () => void
  removeCharacter: (id: string) => void
  updateCharacterField: (id: string, field: keyof CharacterEntry, value: string) => void
}) {
  const { t } = useTranslation()
  const bundleNames = useBundleNames()

  return (
    <div className="p-3 space-y-3">
      {/* General Prompt */}
      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground uppercase tracking-wider">
          {t('quickGenerate.prompt')}
        </Label>
        <LazyPromptEditor
          value={state.generalPrompt}
          onChange={(v) => setState((prev) => ({ ...prev, generalPrompt: v }))}
          placeholder={t('quickGenerate.promptPlaceholder')}
          minHeight="200px"
          bundleNames={bundleNames}
        />
      </div>

      {/* Negative Prompt */}
      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground uppercase tracking-wider">
          {t('quickGenerate.negativePrompt')}
        </Label>
        <LazyPromptEditor
          value={state.negativePrompt}
          onChange={(v) => setState((prev) => ({ ...prev, negativePrompt: v }))}
          placeholder={t('quickGenerate.negativePlaceholder')}
          minHeight="120px"
          bundleNames={bundleNames}
        />
      </div>

      {/* Characters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-muted-foreground uppercase tracking-wider">
            {t('quickGenerate.characters')}
          </Label>
          <Button variant="ghost" size="icon-sm" onClick={addCharacter}>
            <HugeiconsIcon icon={Add01Icon} className="size-5" />
          </Button>
        </div>

        {state.characters.map((char) => (
          <div key={char.id} className="rounded-lg border border-border p-2 space-y-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={char.name}
                onChange={(e) => updateCharacterField(char.id, 'name', e.target.value)}
                placeholder={t('quickGenerate.characterName')}
                className="h-7 text-sm flex-1"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => removeCharacter(char.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('quickGenerate.prompt')}</Label>
              <LazyPromptEditor
                value={char.prompt}
                onChange={(v) => updateCharacterField(char.id, 'prompt', v)}
                placeholder={t('quickGenerate.characterPrompt')}
                minHeight="80px"
                bundleNames={bundleNames}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('quickGenerate.negativePrompt')}</Label>
              <LazyPromptEditor
                value={char.negative}
                onChange={(v) => updateCharacterField(char.id, 'negative', v)}
                placeholder={t('quickGenerate.characterNegative')}
                minHeight="60px"
                bundleNames={bundleNames}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Center Preview Panel ─────────────────────────────────────────────────

function CenterPreview({
  selectedImage,
  imageParams,
  onToggleFavorite,
  onSetRating,
}: {
  selectedImage: {
    id: number
    filePath: string
    seed: number | null
    isFavorite: number | null
    rating: number | null
    metadata: string | null
  } | null
  imageParams: Record<string, unknown> | null
  onToggleFavorite: () => void
  onSetRating: (rating: number) => void
}) {
  const { t } = useTranslation()

  if (!selectedImage) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <HugeiconsIcon icon={Image02Icon} className="size-12 text-muted-foreground/30" />
        <p className="text-sm">{t('quickGenerate.emptyState')}</p>
      </div>
    )
  }

  const width = imageParams?.width as number | undefined
  const height = imageParams?.height as number | undefined

  return (
    <div className="flex flex-col h-full">
      {/* Image */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        <img
          src={`/api/images/${selectedImage.filePath.replace('data/images/', '')}`}
          alt=""
          className="max-h-full max-w-full object-contain rounded"
          draggable={false}
        />
      </div>

      {/* Info bar */}
      <div className="shrink-0 border-t border-border px-4 py-2 flex items-center gap-3 text-sm">
        {/* Favorite */}
        <button onClick={onToggleFavorite} className="transition-colors">
          <span className={selectedImage.isFavorite ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}>
            {selectedImage.isFavorite ? '\u2764' : '\u2661'}
          </span>
        </button>

        {/* Rating */}
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              onClick={() => onSetRating(r)}
              className={`text-sm transition-colors ${
                (selectedImage.rating ?? 0) >= r ? 'text-primary' : 'text-muted-foreground/30 hover:text-primary/50'
              }`}
            >
              {'\u2605'}
            </button>
          ))}
        </div>

        <div className="h-3 w-px bg-border" />

        {/* Seed */}
        {selectedImage.seed != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('quickGenerate.seed')}: {selectedImage.seed}
          </span>
        )}

        {/* Resolution */}
        {width && height && (
          <>
            <div className="h-3 w-px bg-border" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {width} x {height}
            </span>
          </>
        )}

        <div className="flex-1" />

        {/* View in gallery */}
        <Link
          to="/gallery/$imageId"
          params={{ imageId: String(selectedImage.id) }}
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          {t('imageDetail.details')}
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}

// ─── History Panel (Local) ────────────────────────────────────────────────

const historyColsMap: Record<GridSize, number> = { sm: 3, md: 2, lg: 1 }
const GAP = 4

function HistoryPanelLocal({
  images,
  selectedImageId,
  onSelect,
}: {
  images: Array<{
    id: number
    thumbnailPath: string | null
    isFavorite: number | null
  }>
  selectedImageId: number | null
  onSelect: (id: number) => void
}) {
  const { t } = useTranslation()
  const { gridSize, setGridSize } = useImageGridSize('quick-history')
  const cols = historyColsMap[gridSize]

  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cellSize = containerWidth > 0 ? Math.floor((containerWidth - 8 - GAP * (cols - 1)) / cols) : 80
  const rowHeight = cellSize + GAP
  const rowCount = Math.ceil(images.length / cols)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, rowHeight])

  return (
    <div className="p-2 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {t('history.title')}
        </h3>
        <div className="flex items-center gap-1.5">
          <GridSizeToggle value={gridSize} onChange={setGridSize} />
          <span className="text-xs text-muted-foreground">{images.length}</span>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground text-center">{t('quickGenerate.noImagesYet')}</p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto -mx-1 px-1">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map((vRow) => {
              const startIdx = vRow.index * cols
              const rowImages = images.slice(startIdx, startIdx + cols)

              return (
                <div
                  key={vRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div style={{ display: 'flex', gap: `${GAP}px` }}>
                    {rowImages.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => onSelect(img.id)}
                        className={`relative rounded-md overflow-hidden bg-secondary group block shrink-0 ${
                          img.id === selectedImageId ? 'ring-2 ring-primary' : ''
                        }`}
                        style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                      >
                        {img.thumbnailPath ? (
                          <img
                            src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                            ...
                          </div>
                        )}
                        {img.isFavorite ? (
                          <div className="absolute top-0.5 right-0.5 text-xs text-destructive">
                            {'\u2764'}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-border">
        <Link
          to="/gallery"
          search={{ quick: true }}
          className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          {t('quickGenerate.viewInGallery')}
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Link>
      </div>
    </div>
  )
}
