import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft02Icon,
  Image02Icon,
  Menu01Icon,
  PlayIcon,
  TimeQuarter02Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons'
import type { NAIMetadata } from '@/lib/nai-metadata'
import type {
  CharacterEntry,
  QuickGenerateState,
  QuickImage,
} from '@/components/quick-generate/types'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { NumberStepper } from '@/components/ui/number-stepper'
import { WorkspaceLayout } from '@/components/workspace/workspace-layout'
import { ParameterPopover } from '@/components/workspace/parameter-popover'
import { ReferencePanel } from '@/components/workspace/reference-panel'
import { GenerationProgress } from '@/components/workspace/generation-progress'
import { QuickPromptTab } from '@/components/quick-generate/quick-prompt-tab'
import { QuickCharactersTab } from '@/components/quick-generate/quick-characters-tab'
import { ImageViewer } from '@/components/quick-generate/image-viewer'
import { HistoryStrip } from '@/components/quick-generate/history-strip'
import { ImportMetadataDialog } from '@/components/quick-generate/import-metadata-dialog'
import { useTranslation } from '@/lib/i18n'
import { parseMetadataFromFile } from '@/lib/nai-metadata'
import {
  createQuickGenerationJob,
  listQuickImages,
  listQuickJobs,
} from '@/server/functions/quick-generation'
import { updateImage } from '@/server/functions/gallery'

export const Route = createFileRoute('/generate/')({
  component: QuickGeneratePage,
})

function QuickGenerateButton({
  count,
  disabled,
  onGenerate,
}: {
  count: number
  disabled: boolean
  onGenerate: () => void
}) {
  const { t } = useTranslation()
  const [cooldown, setCooldown] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = useCallback(() => {
    onGenerate()
    setCooldown(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCooldown(false), 1000)
  }, [onGenerate])

  return (
    <Button
      variant="brand"
      size="sm"
      onClick={handleClick}
      disabled={disabled || cooldown}
    >
      <HugeiconsIcon icon={PlayIcon} className="size-5" />
      <span className="hidden sm:inline">
        {t('generation.generateCount', { count })}
      </span>
    </Button>
  )
}

const STORAGE_KEY = '87studio-quick-generate'

function loadState(): QuickGenerateState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    /* ignore */
  }
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
  } catch {
    /* ignore */
  }
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
  const [images, setImages] = useState<Array<QuickImage>>([])
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)

  // Generation progress

  // DnD import
  const [dragging, setDragging] = useState(false)
  const [pendingMetadata, setPendingMetadata] = useState<NAIMetadata | null>(
    null,
  )
  const dragCounterRef = useRef(0)

  const handleDropFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) return
      try {
        const result = await parseMetadataFromFile(file)
        if (result) {
          setPendingMetadata(result)
        } else {
          toast.error(t('quickGenerate.noMetadata'))
        }
      } catch {
        toast.error(t('quickGenerate.noMetadata'))
      }
    },
    [t],
  )

  const handleDropFileRef = useRef(handleDropFile)
  handleDropFileRef.current = handleDropFile

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current++
      if (dragCounterRef.current === 1) setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current--
      if (dragCounterRef.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) handleDropFileRef.current(file)
    }
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
    }
  }, [])

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Router state (from metadata page) ──
  useEffect(() => {
    const routerState = (router.state.location.state as any) ?? {}
    if (
      routerState.generalPrompt != null ||
      routerState.negativePrompt != null ||
      routerState.characterPrompts != null
    ) {
      setState((prev) => {
        const next = { ...prev }
        if (routerState.generalPrompt != null)
          next.generalPrompt = routerState.generalPrompt
        if (routerState.negativePrompt != null)
          next.negativePrompt = routerState.negativePrompt
        if (routerState.characterPrompts) {
          next.characters = routerState.characterPrompts.map(
            (c: any, i: number) => ({
              id: `imported-${i}`,
              name: c.name || `Character ${i + 1}`,
              prompt: c.prompt || c.charPrompt || '',
              negative: c.negative || c.charNegative || '',
            }),
          )
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
          if (
            newImages.length > prev.length ||
            (newImages.length > 0 && newImages[0].id !== prev[0]?.id)
          ) {
            // Auto-select newest image (polling only runs during generation)
            if (newImages[0]) {
              setSelectedImageId(newImages[0].id)
            }
            return newImages
          }
          return prev
        })

        // Stop polling if no more active jobs
        if (jobData.jobs.length === 0 && !jobData.queueStatus.processing) {
          stopPolling()
          setGenerating(false)
        }
      } catch {
        /* ignore polling errors */
      }
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
      if (jobData.jobs.length > 0 || jobData.queueStatus.processing) {
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
      window.dispatchEvent(new CustomEvent('queue-updated'))
      startPolling()
    } catch {
      toast.error(t('generation.generationFailed'))
      setGenerating(false)
    }
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

  function updateCharacterField(
    id: string,
    field: keyof CharacterEntry,
    value: string,
  ) {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === id ? { ...c, [field]: value } : c,
      ),
    }))
  }

  const selectedIndex = images.findIndex((img) => img.id === selectedImageId)
  const selectedImage = selectedIndex >= 0 ? images[selectedIndex] : null

  // images are newest-first: prev = newer (lower index), next = older
  function selectByIndex(i: number) {
    const img = images[i]
    setSelectedImageId(img.id)
  }

  // ── Favorite toggle on selected image ──
  async function handleToggleFavorite() {
    if (!selectedImage) return
    const newVal = selectedImage.isFavorite ? 0 : 1
    await updateImage({ data: { id: selectedImage.id, isFavorite: newVal } })
    setImages((prev) =>
      prev.map((img) =>
        img.id === selectedImage.id ? { ...img, isFavorite: newVal } : img,
      ),
    )
  }

  // ── Rating on selected image ──
  async function handleSetRating(rating: number) {
    if (!selectedImage) return
    const newRating = selectedImage.rating === rating ? null : rating
    await updateImage({ data: { id: selectedImage.id, rating: newRating } })
    setImages((prev) =>
      prev.map((img) =>
        img.id === selectedImage.id ? { ...img, rating: newRating } : img,
      ),
    )
  }

  // Parse image metadata for display
  const imageParams = selectedImage?.metadata
    ? (() => {
        try {
          const meta = JSON.parse(selectedImage.metadata)
          return meta.parameters ?? null
        } catch {
          return null
        }
      })()
    : null

  return (
    <>
      {/* Full-screen drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <HugeiconsIcon
                icon={Upload01Icon}
                className="size-7 text-primary"
              />
            </div>
            <p className="text-base font-medium">
              {t('quickGenerate.dropToImport')}
            </p>
          </div>
        </div>
      )}

      {/* Import dialog */}
      {pendingMetadata && (
        <ImportMetadataDialog
          metadata={pendingMetadata}
          open={!!pendingMetadata}
          onOpenChange={(open) => {
            if (!open) setPendingMetadata(null)
          }}
          onApply={(applied) => {
            setState((prev) => {
              const next = { ...prev }
              if (applied.generalPrompt != null)
                next.generalPrompt = applied.generalPrompt
              if (applied.negativePrompt != null)
                next.negativePrompt = applied.negativePrompt
              if (applied.characters) next.characters = applied.characters
              if (applied.parameters)
                next.parameters = { ...prev.parameters, ...applied.parameters }
              saveState(next)
              return next
            })
            setPendingMetadata(null)
            toast.success(t('quickGenerate.imported'))
          }}
        />
      )}

      <WorkspaceLayout
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onDismiss={() => {
          setLeftOpen(false)
          setRightOpen(false)
        }}
        header={
          <QuickGenerateHeader
            onToggleLeft={() => setLeftOpen(!leftOpen)}
            onToggleRight={() => setRightOpen(!rightOpen)}
          />
        }
        leftPanel={
          <>
            <QuickPromptTab state={state} setState={setState} />
            <QuickCharactersTab
              characters={state.characters}
              addCharacter={addCharacter}
              removeCharacter={removeCharacter}
              updateCharacterField={updateCharacterField}
            />
            <ReferencePanel
              projectId={null}
              referenceMode={
                (state.parameters.referenceMode as
                  | 'none'
                  | 'vibe'
                  | 'precise') ?? 'none'
              }
              currentModel={
                (state.parameters.model as string) ?? 'nai-diffusion-4-5-full'
              }
              onReferenceModeChange={(mode) => {
                setState((prev) => ({
                  ...prev,
                  parameters: { ...prev.parameters, referenceMode: mode },
                }))
              }}
            />
          </>
        }
        centerPanel={
          <ImageViewer
            image={selectedImage}
            imageParams={imageParams}
            onToggleFavorite={handleToggleFavorite}
            onSetRating={handleSetRating}
            onPrev={
              selectedIndex > 0
                ? () => selectByIndex(selectedIndex - 1)
                : undefined
            }
            onNext={
              selectedIndex >= 0 && selectedIndex < images.length - 1
                ? () => selectByIndex(selectedIndex + 1)
                : undefined
            }
            generating={generating}
          />
        }
        rightPanel={
          <HistoryStrip
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
                onChange={(p) =>
                  setState((prev) => ({ ...prev, parameters: p }))
                }
              />
            </div>
            <div className="flex items-center justify-end lg:justify-center min-w-0 overflow-hidden">
              <GenerationProgress />
            </div>
            <div className="flex items-center justify-center lg:justify-end gap-1.5 col-span-2 lg:col-span-1">
              <NumberStepper
                value={state.count}
                onChange={(v) =>
                  setState((prev) => ({ ...prev, count: Math.max(1, v ?? 1) }))
                }
                min={1}
                max={100}
                size="md"
              />
              <QuickGenerateButton
                count={state.count}
                disabled={!state.generalPrompt.trim()}
                onGenerate={handleGenerate}
              />
            </div>
          </div>
        }
      />
    </>
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
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Button variant="ghost" size="sm" asChild className="shrink-0">
          <Link to="/" search={{ imageDetail: undefined }}>
            <HugeiconsIcon icon={ArrowLeft02Icon} className="size-5" />
            <span className="hidden sm:inline">{t('common.back')}</span>
          </Link>
        </Button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-base font-semibold truncate">
          {t('quickGenerate.title')}
        </h1>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleLeft}
          className="lg:hidden"
        >
          <HugeiconsIcon icon={Menu01Icon} className="size-5" />
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gallery" search={{ quick: true, imageDetail: undefined }}>
            <HugeiconsIcon icon={Image02Icon} className="size-5" />
            <span className="hidden sm:inline">{t('nav.gallery')}</span>
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleRight}
          className="lg:hidden"
        >
          <HugeiconsIcon icon={TimeQuarter02Icon} className="size-5" />
        </Button>
      </div>
    </header>
  )
}
