import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  Cancel01Icon,
  Copy01Icon,
  ImageUploadIcon,
  MagicWand01Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import type { NAIMetadata } from '@/lib/nai-metadata'
import { HeaderActions } from '@/components/layout/breadcrumb-context'
import { HeaderButton } from '@/components/layout/header-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getUcPresetLabel, parseMetadataFromFile } from '@/lib/nai-metadata'
import { createProjectFromMetadata } from '@/server/functions/inspect'
import {
  MetadataImportOptions,
  useMetadataImport,
} from '@/components/common/metadata-import-options'
import { ImportReferenceWarning } from '@/components/quick-generate/import-metadata-dialog'
import { buildImport } from '@/lib/nai-import'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/metadata/')({
  component: InspectPage,
})

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function InspectPage() {
  const [metadata, setMetadata] = useState<NAIMetadata | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState(0)
  const [naturalSize, setNaturalSize] = useState<{
    w: number
    h: number
  } | null>(null)
  const [parsing, setParsing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showQuickDialog, setShowQuickDialog] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const { t } = useTranslation()

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error(t('metadata.selectImage'))
        return
      }

      setParsing(true)
      setMetadata(null)
      setNaturalSize(null)
      setFileName(file.name)
      setFileSize(file.size)

      // Create preview URL
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      const url = URL.createObjectURL(file)
      setImageUrl(url)

      try {
        const result = await parseMetadataFromFile(file)
        setMetadata(result)
        if (!result) {
          toast.error(t('metadata.noMetadata'))
        }
      } catch {
        toast.error(t('metadata.failedToParse'))
      } finally {
        setParsing(false)
      }
    },
    [imageUrl],
  )

  // Use document-level listeners so drag works anywhere on the page
  const handleFileRef = useRef(handleFile)
  handleFileRef.current = handleFile

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
      if (file) handleFileRef.current(file)
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

  function handleClear() {
    setMetadata(null)
    setFileName(null)
    setNaturalSize(null)
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
      setImageUrl(null)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const width = metadata?.width ?? naturalSize?.w
  const height = metadata?.height ?? naturalSize?.h

  return (
    <div>
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
              {imageUrl
                ? t('metadata.dropToReplace')
                : t('metadata.dropToInspect')}
            </p>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {/* Empty state: a drop zone filling the content area */}
      {!imageUrl && (
        <button
          type="button"
          data-metadata-dropzone
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-[calc(100svh-8rem)] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:border-primary focus-visible:outline-none"
        >
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
            <HugeiconsIcon
              icon={ImageUploadIcon}
              className="size-8 text-muted-foreground"
            />
          </div>
          <div className="text-center">
            <p className="text-base font-medium">
              {t('metadata.dropOrChoose')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('metadata.supportsNai')}
            </p>
          </div>
        </button>
      )}

      {/* Image + Metadata view */}
      {imageUrl && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <HeaderActions>
            <>
              {metadata && (
                <>
                  <HeaderButton
                    aria-label={t('metadata.createProject')}
                    onClick={() => setShowCreateDialog(true)}
                  >
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      className="size-4 sm:mr-1.5"
                    />
                    <span className="hidden sm:inline">
                      {t('metadata.createProject')}
                    </span>
                  </HeaderButton>
                  <HeaderButton
                    variant="outline"
                    aria-label={t('metadata.quickGenerate')}
                    onClick={() => setShowQuickDialog(true)}
                  >
                    <HugeiconsIcon
                      icon={MagicWand01Icon}
                      className="size-4 sm:mr-1.5"
                    />
                    <span className="hidden sm:inline">
                      {t('metadata.quickGenerate')}
                    </span>
                  </HeaderButton>
                </>
              )}
              <HeaderButton
                variant="outline"
                aria-label={t('common.clear')}
                onClick={handleClear}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  className="size-4 sm:mr-1.5"
                />
                <span className="hidden sm:inline">{t('common.clear')}</span>
              </HeaderButton>
            </>
          </HeaderActions>

          {/* Image preview */}
          <div
            data-metadata-preview
            className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[72px] lg:self-start"
          >
            <div className="flex max-h-[40vh] items-center justify-center overflow-hidden rounded-xl border bg-background p-3 lg:max-h-[calc(100svh-15rem)]">
              <img
                src={imageUrl}
                alt={fileName ?? ''}
                draggable={false}
                onLoad={(e) =>
                  setNaturalSize({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
                className="max-h-[calc(40vh-1.5rem)] max-w-full rounded object-contain lg:max-h-[calc(100svh-17.5rem)]"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium"
                  title={fileName ?? ''}
                >
                  {fileName}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatFileSize(fileSize)}
                  {width != null && height != null && ` · ${width} × ${height}`}
                  {metadata?.source &&
                    ` · ${
                      metadata.source === 'text_chunk'
                        ? 'tEXt Chunk'
                        : 'Stealth Alpha'
                    }`}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                data-metadata-replace
                onClick={() => fileInputRef.current?.click()}
              >
                <HugeiconsIcon icon={Upload01Icon} className="size-4" />
                {t('common.replace')}
              </Button>
            </div>
          </div>

          {/* Metadata panel */}
          <div className="min-w-0">
            {parsing && (
              <div className="flex items-center gap-3 p-6">
                <div className="size-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">
                  {t('metadata.parsingMetadata')}
                </span>
              </div>
            )}

            {!parsing && !metadata && (
              <div className="rounded-xl border border-dashed py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  {t('metadata.noMetadataFound')}
                </p>
              </div>
            )}

            {metadata && <MetadataViewer key={fileName} metadata={metadata} />}
          </div>
        </div>
      )}

      {metadata && (
        <>
          <CreateProjectDialog
            metadata={metadata}
            open={showCreateDialog}
            onOpenChange={setShowCreateDialog}
          />
          <QuickGenerateDialog
            metadata={metadata}
            open={showQuickDialog}
            onOpenChange={setShowQuickDialog}
          />
        </>
      )}
    </div>
  )
}

// ─── Metadata Viewer ──────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        navigator.clipboard.writeText(text)
        toast.success(t('common.copied'))
      }}
      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
    </button>
  )
}

function PromptBlock({
  label,
  text,
  maxHeight = 'max-h-64',
}: {
  label: string
  text: string
  maxHeight?: string
}) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <CopyButton text={text} label={`${t('common.copy')}: ${label}`} />
      </div>
      <p
        className={cn(
          'overflow-y-auto whitespace-pre-wrap rounded-md border bg-secondary/30 p-3 font-mono text-[13px] leading-relaxed text-foreground/85',
          maxHeight,
        )}
      >
        {text}
      </p>
    </div>
  )
}

function MetadataViewer({ metadata }: { metadata: NAIMetadata }) {
  const { t } = useTranslation()
  const chars = metadata.v4_prompt?.caption?.char_captions ?? []
  const hasChars = chars.length > 0
  const hasRefs = !!(metadata.hasVibeTransfer || metadata.hasCharacterReference)
  const rawJson = metadata.raw ? JSON.stringify(metadata.raw, null, 2) : ''

  return (
    <Tabs defaultValue="prompt" data-metadata-tabs className="gap-4">
      <TabsList className="h-auto max-w-full flex-wrap justify-start">
        <TabsTrigger value="prompt">{t('metadata.tabPrompt')}</TabsTrigger>
        {hasChars && (
          <TabsTrigger value="characters">
            {t('metadata.tabCharacters')}
            <span className="ml-1 text-xs tabular-nums text-muted-foreground">
              {chars.length}
            </span>
          </TabsTrigger>
        )}
        <TabsTrigger value="parameters">
          {t('metadata.tabParameters')}
        </TabsTrigger>
        {hasRefs && (
          <TabsTrigger value="references">
            {t('metadata.tabReferences')}
          </TabsTrigger>
        )}
        {rawJson && (
          <TabsTrigger value="raw">{t('metadata.tabRaw')}</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="prompt" className="space-y-4">
        {metadata.prompt ? (
          <PromptBlock label={t('metadata.positive')} text={metadata.prompt} />
        ) : null}
        {metadata.negativePrompt ? (
          <PromptBlock
            label={t('metadata.negative')}
            text={metadata.negativePrompt}
            maxHeight="max-h-48"
          />
        ) : null}
        {!metadata.prompt && !metadata.negativePrompt && (
          <p className="text-sm text-muted-foreground">
            {t('metadata.noPrompt')}
          </p>
        )}
      </TabsContent>

      {hasChars && (
        <TabsContent value="characters" className="space-y-5">
          {chars.map((char, i) => {
            const negChar =
              metadata.v4_negative_prompt?.caption?.char_captions?.[i]
            return (
              <div key={i} className="space-y-2">
                <PromptBlock
                  label={`${t('metadata.character')} ${i + 1}${char.centers.length > 0 ? ` (${char.centers.map((c) => `${c.x.toFixed(2)}, ${c.y.toFixed(2)}`).join(' | ')})` : ''}`}
                  text={char.char_caption}
                  maxHeight="max-h-40"
                />
                {negChar?.char_caption && (
                  <PromptBlock
                    label={`${t('metadata.character')} ${i + 1} ${t('metadata.negative')}`}
                    text={negChar.char_caption}
                    maxHeight="max-h-32"
                  />
                )}
              </div>
            )
          })}
        </TabsContent>
      )}

      <TabsContent value="parameters">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-xl border p-4 text-sm">
          {metadata.model && <ParamRow label="Model" value={metadata.model} />}
          {metadata.width != null && metadata.height != null && (
            <ParamRow
              label={t('metadata.resolution')}
              value={`${metadata.width} × ${metadata.height}`}
            />
          )}
          {metadata.steps != null && (
            <ParamRow label="Steps" value={metadata.steps} />
          )}
          {metadata.cfgScale != null && (
            <ParamRow label="CFG Scale" value={metadata.cfgScale} />
          )}
          {metadata.cfgRescale != null && metadata.cfgRescale > 0 && (
            <ParamRow label="CFG Rescale" value={metadata.cfgRescale} />
          )}
          {metadata.sampler && (
            <ParamRow label="Sampler" value={metadata.sampler} />
          )}
          {metadata.scheduler && (
            <ParamRow label="Scheduler" value={metadata.scheduler} />
          )}
          {metadata.seed != null && (
            <ParamRow
              label="Seed"
              value={metadata.seed}
              copy={String(metadata.seed)}
            />
          )}
          {metadata.smea != null && (
            <ParamRow label="SMEA" value={metadata.smea ? 'On' : 'Off'} />
          )}
          {metadata.smeaDyn != null && (
            <ParamRow
              label="SMEA DYN"
              value={metadata.smeaDyn ? 'On' : 'Off'}
            />
          )}
          {metadata.variety != null && (
            <ParamRow
              label="Variety+"
              value={metadata.variety ? 'On' : 'Off'}
            />
          )}
          {metadata.qualityToggle != null && (
            <ParamRow
              label="Quality Tags"
              value={metadata.qualityToggle ? 'On' : 'Off'}
            />
          )}
          {metadata.ucPreset != null && (
            <ParamRow
              label="UC Preset"
              value={getUcPresetLabel(metadata.ucPreset)}
            />
          )}
        </dl>
      </TabsContent>

      {hasRefs && (
        <TabsContent value="references" className="space-y-4">
          {metadata.hasVibeTransfer && metadata.vibeTransferInfo && (
            <RefList
              title={t('metadata.vibeTransfer')}
              prefix="Image"
              items={metadata.vibeTransferInfo}
            />
          )}
          {metadata.hasCharacterReference &&
            metadata.characterReferenceInfo && (
              <RefList
                title={t('metadata.characterReference')}
                prefix="Ref"
                items={metadata.characterReferenceInfo}
              />
            )}
        </TabsContent>
      )}

      {rawJson && (
        <TabsContent value="raw">
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">JSON</Label>
            <CopyButton text={rawJson} label={`${t('common.copy')}: JSON`} />
          </div>
          <pre className="max-h-[60vh] overflow-auto rounded-md border bg-secondary/30 p-3 font-mono text-xs leading-relaxed text-foreground/85">
            {rawJson}
          </pre>
        </TabsContent>
      )}
    </Tabs>
  )
}

function RefList({
  title,
  prefix,
  items,
}: {
  title: string
  prefix: string
  items: NonNullable<NAIMetadata['vibeTransferInfo']>
}) {
  return (
    <div className="rounded-xl border p-4">
      <Label className="text-xs text-muted-foreground">{title}</Label>
      <div className="mt-2 space-y-1">
        {items.map((it, i) => (
          <div key={i} className="text-sm text-foreground/80">
            {prefix} {i + 1}: Strength {it.strength.toFixed(2)}, Info Extracted{' '}
            {it.informationExtracted.toFixed(2)}
          </div>
        ))}
      </div>
    </div>
  )
}

function ParamRow({
  label,
  value,
  copy,
}: {
  label: string
  value: string | number
  copy?: string
}): ReactNode {
  const { t } = useTranslation()
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 font-mono text-foreground/85">
        <span className="min-w-0 break-words">{value}</span>
        {copy && (
          <CopyButton text={copy} label={`${t('common.copy')}: ${label}`} />
        )}
      </dd>
    </>
  )
}

// ─── Create Project Dialog ──────────────────────────────────────────────────

function CreateProjectDialog({
  metadata,
  open,
  onOpenChange,
}: {
  metadata: NAIMetadata
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [projectName, setProjectName] = useState(
    () => `Import ${new Date().toLocaleDateString()}`,
  )
  const { imported, selection, setSelection } = useMetadataImport(metadata)
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!projectName.trim()) {
      toast.error(t('metadata.pleaseEnterName'))
      return
    }

    setCreating(true)
    try {
      const out = buildImport(metadata, selection)
      const project = await createProjectFromMetadata({
        data: {
          name: projectName.trim(),
          generalPrompt: out.generalPrompt ?? '',
          negativePrompt: out.negativePrompt ?? '',
          parameters: out.parameters,
          characters: out.characters?.map((c) => ({
            name: c.name,
            charPrompt: c.prompt,
            charNegative: c.negative,
          })),
        },
      })

      toast.success(t('metadata.projectCreated'))
      onOpenChange(false)
      navigate({
        to: '/workspace/$projectId',
        params: { projectId: String(project.id) },
        search: { imageDetail: undefined },
      })
    } catch {
      toast.error(t('metadata.failedToCreate'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('metadata.createProjectFromMetadata')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto py-2">
          <div className="space-y-2">
            <Label htmlFor="proj-name">{t('metadata.projectName')}</Label>
            <Input
              id="proj-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('metadata.enterProjectName')}
            />
          </div>

          <Separator />

          <MetadataImportOptions
            metadata={metadata}
            imported={imported}
            selection={selection}
            onChange={setSelection}
          />

          <ImportReferenceWarning metadata={metadata} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? t('metadata.creating') : t('metadata.createProjectBtn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Quick Generate Dialog ──────────────────────────────────────────────────

function QuickGenerateDialog({
  metadata,
  open,
  onOpenChange,
}: {
  metadata: NAIMetadata
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { imported, selection, setSelection } = useMetadataImport(metadata)
  const currentParameters = useMemo(readQuickGenerateParameters, [])

  function handleApply() {
    const out = buildImport(metadata, selection)
    onOpenChange(false)
    navigate({
      to: '/generate',
      search: { imageDetail: undefined },
      state: {
        generalPrompt: out.generalPrompt,
        negativePrompt: out.negativePrompt,
        characterPrompts: out.characters,
        parameters: out.parameters,
      } as any,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('metadata.quickGenerate')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto py-2">
          <MetadataImportOptions
            metadata={metadata}
            imported={imported}
            selection={selection}
            onChange={setSelection}
            currentParameters={currentParameters}
          />
          <ImportReferenceWarning metadata={metadata} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleApply}>{t('metadata.quickGenerate')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Quick Generate keeps its state in localStorage; read the current params. */
function readQuickGenerateParameters(): Record<string, unknown> {
  try {
    const stored = localStorage.getItem('87studio-quick-generate')
    if (stored) return JSON.parse(stored).parameters ?? {}
  } catch {
    /* ignore */
  }
  return {}
}
