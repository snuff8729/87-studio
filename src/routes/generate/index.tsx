import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Image02Icon, PlayIcon, Upload01Icon } from '@hugeicons/core-free-icons'
import type { ComponentProps } from 'react'
import type { NAIMetadata } from '@/lib/nai-metadata'
import type {
  CharacterEntry,
  QuickGenerateState,
  QuickImage,
} from '@/components/quick-generate/types'
import type { CharacterPatch } from '@/components/characters/characters-editor'
import type { MobilePane } from '@/components/editor-shell/editor-shell'
import {
  EditorShell,
  useEditorShell,
} from '@/components/editor-shell/editor-shell'
import { EditorHeader } from '@/components/editor-shell/editor-header'
import {
  useGenerateCooldown,
  useGenerateShortcut,
} from '@/components/editor-shell/use-generate-shortcut'
import { Button } from '@/components/ui/button'
import { NumberStepper } from '@/components/ui/number-stepper'
import { ParameterForm } from '@/components/workspace/parameter-popover'
import {
  ReferencePanel,
  useReferenceImages,
} from '@/components/workspace/reference-panel'
import { GenerationProgress } from '@/components/workspace/generation-progress'
import { QuickPromptTab } from '@/components/quick-generate/quick-prompt-tab'
import { QuickCharactersTab } from '@/components/quick-generate/quick-characters-tab'
import { ImageViewer } from '@/components/quick-generate/image-viewer'
import { HistoryStrip } from '@/components/quick-generate/history-strip'
import { ImportMetadataDialog } from '@/components/quick-generate/import-metadata-dialog'
import { useTranslation } from '@/lib/i18n'
import { duplicateName, moveItem, nextCharacterName } from '@/lib/characters'
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

let characterSeq = 0
function newCharacterId() {
  return 'char-' + Date.now() + '-' + characterSeq++
}

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

  return (
    <Button
      variant="brand"
      onClick={onGenerate}
      disabled={disabled}
      className="min-w-0 flex-1"
    >
      <HugeiconsIcon icon={PlayIcon} className="size-5" />
      <span className="truncate">
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

/** Disables viewer shortcuts on mobile while the result pane is hidden. */
function QuickImageViewer(props: ComponentProps<typeof ImageViewer>) {
  const { isMobile, mobilePane } = useEditorShell()
  return (
    <ImageViewer
      {...props}
      shortcutsEnabled={!isMobile || mobilePane === 'result'}
    />
  )
}

function QuickGeneratePage() {
  const { t } = useTranslation()
  const router = useRouter()

  // ── State ──
  const [state, setState] = useState<QuickGenerateState>(loadState)
  const [generating, setGenerating] = useState(false)
  const [mobilePane, setMobilePane] = useState<MobilePane>('edit')

  // Image history
  const [images, setImages] = useState<Array<QuickImage>>([])
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)

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
  }, [])

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
  }, [])

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

        const active = jobData.jobs.some(
          (j) => j.status === 'pending' || j.status === 'running',
        )
        setGenerating(active)

        // Stop polling if no more active jobs
        if (!active && !jobData.queueStatus.processing) {
          stopPolling()
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
      const active = jobData.jobs.some(
        (j) => j.status === 'pending' || j.status === 'running',
      )
      setGenerating(active)
      if (active || jobData.queueStatus.processing) startPolling()
    })
  }, [])

  // ── Handlers ──
  async function handleGenerate() {
    if (!state.generalPrompt.trim()) {
      toast.error(t('quickGenerate.emptyState'))
      return
    }

    setGenerating(true)
    setMobilePane('result')
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

  // Button and Ctrl/Cmd+Enter share one 1s cooldown
  const { cooldown, trigger: handleGenerateClick } =
    useGenerateCooldown(handleGenerate)
  useGenerateShortcut(
    handleGenerateClick,
    !!state.generalPrompt.trim() && !cooldown,
  )

  function addCharacter(): string {
    const id = newCharacterId()
    setState((prev) => ({
      ...prev,
      characters: [
        ...prev.characters,
        {
          id,
          name: nextCharacterName(prev.characters.map((c) => c.name)),
          prompt: '',
          negative: '',
        },
      ],
    }))
    return id
  }

  function duplicateCharacter(id: string): string | undefined {
    const source = state.characters.find((c) => c.id === id)
    if (!source) return undefined
    const copyId = newCharacterId()
    setState((prev) => {
      const index = prev.characters.findIndex((c) => c.id === id)
      if (index < 0) return prev
      const copy: CharacterEntry = {
        ...prev.characters[index],
        id: copyId,
        name: duplicateName(
          prev.characters[index].name,
          prev.characters.map((c) => c.name),
        ),
      }
      // Appended at the end, like the workspace
      return { ...prev, characters: [...prev.characters, copy] }
    })
    return copyId
  }

  function moveCharacter(id: string, direction: -1 | 1) {
    setState((prev) => ({
      ...prev,
      characters: moveItem(
        prev.characters,
        prev.characters.findIndex((c) => c.id === id),
        direction,
      ),
    }))
  }

  function removeCharacter(id: string) {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.filter((c) => c.id !== id),
    }))
  }

  function updateCharacter(id: string, patch: CharacterPatch) {
    setState((prev) => ({
      ...prev,
      characters: prev.characters.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
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

  function handleHistorySelect(id: number) {
    setSelectedImageId(id)
    setMobilePane('result')
  }

  // ── Tab badges ──
  const { data: references = [] } = useReferenceImages(null)
  const activeRefMode = state.parameters.referenceMode
  const enabledRefCount =
    activeRefMode === 'vibe' || activeRefMode === 'precise'
      ? references.filter((r) => r.enabled && r.type === activeRefMode).length
      : 0

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

  const setParam = useCallback((key: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      parameters: { ...prev.parameters, [key]: value },
    }))
  }, [])

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

      <EditorShell
        id="quick-generate"
        mobilePane={mobilePane}
        onMobilePaneChange={setMobilePane}
        header={
          <EditorHeader
            title={t('quickGenerate.title')}
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link
                  to="/gallery"
                  search={{ quick: true, imageDetail: undefined }}
                >
                  <HugeiconsIcon icon={Image02Icon} className="size-5" />
                  <span className="hidden sm:inline">{t('nav.gallery')}</span>
                </Link>
              </Button>
            }
          />
        }
        tabs={[
          {
            id: 'prompt',
            label: t('editor.tabPrompt'),
            content: <QuickPromptTab state={state} setState={setState} />,
          },
          {
            id: 'chars',
            label: t('editor.tabCharacters'),
            badge: state.characters.length,
            content: (
              <QuickCharactersTab
                characters={state.characters}
                addCharacter={addCharacter}
                duplicateCharacter={duplicateCharacter}
                moveCharacter={moveCharacter}
                removeCharacter={removeCharacter}
                updateCharacter={updateCharacter}
              />
            ),
          },
          {
            id: 'refs',
            label: t('editor.tabReferences'),
            badge: enabledRefCount,
            content: (
              <ReferencePanel
                projectId={null}
                className="p-0 border-t-0"
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
            ),
          },
          {
            id: 'params',
            label: t('editor.tabParameters'),
            content: (
              <ParameterForm localParams={state.parameters} set={setParam} />
            ),
          },
        ]}
        footer={
          <div className="flex flex-col gap-2">
            <GenerationProgress />
            <div className="flex items-center gap-2">
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
                disabled={!state.generalPrompt.trim() || cooldown}
                onGenerate={handleGenerateClick}
              />
            </div>
          </div>
        }
        center={
          <QuickImageViewer
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
        rightTitle={
          images.length > 0
            ? `${t('history.title')} · ${images.length}`
            : t('history.title')
        }
        right={
          <HistoryStrip
            images={images}
            selectedImageId={selectedImageId}
            onSelect={handleHistorySelect}
          />
        }
      />
    </>
  )
}
