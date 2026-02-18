import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Upload01Icon, Cancel01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { parseMetadataFromFile, getUcPresetLabel } from '@/lib/nai-metadata'
import type { NAIMetadata } from '@/lib/nai-metadata'
import { createProjectFromMetadata } from '@/server/functions/inspect'
import { useTranslation } from '@/lib/i18n'

export const Route = createFileRoute('/metadata/')({
  component: InspectPage,
})

function InspectPage() {
  const [metadata, setMetadata] = useState<NAIMetadata | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const { t } = useTranslation()

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(t('metadata.selectImage'))
      return
    }

    setParsing(true)
    setMetadata(null)
    setFileName(file.name)

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
  }, [imageUrl])

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
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl)
      setImageUrl(null)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div>
      {/* Full-screen drag overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <HugeiconsIcon icon={Upload01Icon} className="size-7 text-primary" />
            </div>
            <p className="text-base font-medium">
              {imageUrl ? t('metadata.dropToReplace') : t('metadata.dropToInspect')}
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

      {/* Empty state — centered in viewport */}
      {!imageUrl && (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-4 p-16 w-full max-w-lg border-2 border-dashed rounded-xl cursor-pointer transition-colors border-border hover:border-muted-foreground/50 hover:bg-accent/30"
          >
            <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
              <HugeiconsIcon icon={Upload01Icon} className="size-7 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium">
                {t('metadata.dropOrClick')}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t('metadata.supportsNai')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Image + Metadata view */}
      {imageUrl && (
        <div className="space-y-6">
          <PageHeader
            title={t('metadata.title')}
            description={t('metadata.description')}
            actions={
              <div className="flex items-center gap-2">
                {metadata && (
                  <Button
                    size="sm"
                    onClick={() => setShowCreateDialog(true)}
                  >
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 mr-1.5" />
                    {t('metadata.createProject')}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <HugeiconsIcon icon={Upload01Icon} className="size-4 mr-1.5" />
                  {t('common.replace')}
                </Button>
                <Button size="sm" variant="outline" onClick={handleClear}>
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4 mr-1.5" />
                  {t('common.clear')}
                </Button>
              </div>
            }
          />

          {/* File info badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground truncate">
              {fileName}
            </span>
            {metadata?.source && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                {metadata.source === 'text_chunk' ? 'tEXt Chunk' : 'Stealth Alpha'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
            {/* Image preview */}
            <div className="bg-black/20 rounded-xl flex items-center justify-center p-4 min-h-64 max-h-[70vh]">
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                className="max-h-full max-w-full object-contain rounded"
              />
            </div>

            {/* Metadata panel */}
            <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-1">
              {parsing && (
                <div className="flex items-center gap-3 p-6">
                  <div className="size-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">{t('metadata.parsingMetadata')}</span>
                </div>
              )}

              {!parsing && !metadata && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t('metadata.noMetadataFound')}
                    </p>
                  </CardContent>
                </Card>
              )}

              {metadata && <MetadataViewer metadata={metadata} />}
            </div>
          </div>
        </div>
      )}

      {metadata && (
        <CreateProjectDialog
          metadata={metadata}
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
        />
      )}
    </div>
  )
}

// ─── Metadata Viewer ──────────────────────────────────────────────────────

function MetadataViewer({ metadata }: { metadata: NAIMetadata }) {
  const hasV4Chars = metadata.v4_prompt?.caption?.char_captions &&
    metadata.v4_prompt.caption.char_captions.length > 0

  return (
    <div className="space-y-4">
      {/* Model & Basic */}
      {metadata.model && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Model</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono text-foreground/80">{metadata.model}</p>
          </CardContent>
        </Card>
      )}

      {/* Prompts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Prompts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {metadata.prompt && (
            <div>
              <Label className="text-xs text-muted-foreground">Positive</Label>
              <p className="text-sm font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-2 rounded-md max-h-40 overflow-y-auto mt-1">
                {metadata.prompt}
              </p>
            </div>
          )}
          {metadata.negativePrompt && (
            <div>
              <Label className="text-xs text-muted-foreground">Negative</Label>
              <p className="text-sm font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-2 rounded-md max-h-32 overflow-y-auto mt-1">
                {metadata.negativePrompt}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* V4 Character Captions */}
      {hasV4Chars && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Character Prompts (V4)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {metadata.v4_prompt!.caption!.char_captions!.map((char, i) => {
              const negChar = metadata.v4_negative_prompt?.caption?.char_captions?.[i]
              return (
                <div key={i} className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Character {i + 1}
                      {char.centers.length > 0 && (
                        <span className="ml-1.5 text-muted-foreground/60">
                          ({char.centers.map((c) => `${c.x.toFixed(2)}, ${c.y.toFixed(2)}`).join(' | ')})
                        </span>
                      )}
                    </Label>
                    <p className="text-sm font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-2 rounded-md max-h-32 overflow-y-auto mt-1">
                      {char.char_caption}
                    </p>
                  </div>
                  {negChar?.char_caption && (
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Character {i + 1} Negative
                      </Label>
                      <p className="text-sm font-mono text-foreground/80 whitespace-pre-wrap bg-secondary/50 p-2 rounded-md max-h-24 overflow-y-auto mt-1">
                        {negChar.char_caption}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Generation Parameters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {metadata.width != null && metadata.height != null && (
              <ParamRow label="Resolution" value={`${metadata.width} x ${metadata.height}`} />
            )}
            {metadata.steps != null && <ParamRow label="Steps" value={metadata.steps} />}
            {metadata.cfgScale != null && <ParamRow label="CFG Scale" value={metadata.cfgScale} />}
            {metadata.cfgRescale != null && metadata.cfgRescale > 0 && (
              <ParamRow label="CFG Rescale" value={metadata.cfgRescale} />
            )}
            {metadata.seed != null && <ParamRow label="Seed" value={metadata.seed} />}
            {metadata.sampler && <ParamRow label="Sampler" value={metadata.sampler} />}
            {metadata.scheduler && <ParamRow label="Scheduler" value={metadata.scheduler} />}
            {metadata.smea != null && (
              <ParamRow label="SMEA" value={metadata.smea ? 'On' : 'Off'} />
            )}
            {metadata.smeaDyn != null && (
              <ParamRow label="SMEA DYN" value={metadata.smeaDyn ? 'On' : 'Off'} />
            )}
            {metadata.variety != null && (
              <ParamRow label="Variety+" value={metadata.variety ? 'On' : 'Off'} />
            )}
            {metadata.qualityToggle != null && (
              <ParamRow label="Quality Tags" value={metadata.qualityToggle ? 'On' : 'Off'} />
            )}
            {metadata.ucPreset != null && (
              <ParamRow label="UC Preset" value={getUcPresetLabel(metadata.ucPreset)} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reference Images */}
      {(metadata.hasVibeTransfer || metadata.hasCharacterReference) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reference Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {metadata.hasVibeTransfer && metadata.vibeTransferInfo && (
              <div>
                <Label className="text-xs text-muted-foreground">Vibe Transfer</Label>
                <div className="space-y-1 mt-1">
                  {metadata.vibeTransferInfo.map((vt, i) => (
                    <div key={i} className="text-sm text-foreground/80">
                      Image {i + 1}: Strength {vt.strength.toFixed(2)}, Info Extracted {vt.informationExtracted.toFixed(2)}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {metadata.hasCharacterReference && metadata.characterReferenceInfo && (
              <div>
                <Label className="text-xs text-muted-foreground">Character Reference</Label>
                <div className="space-y-1 mt-1">
                  {metadata.characterReferenceInfo.map((cr, i) => (
                    <div key={i} className="text-sm text-foreground/80">
                      Ref {i + 1}: Strength {cr.strength.toFixed(2)}, Info Extracted {cr.informationExtracted.toFixed(2)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ParamRow({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground/80 font-mono">{value}</span>
    </>
  )
}

// ─── Create Project Dialog ──────────────────────────────────────────────────

type ImportField =
  | 'generalPrompt'
  | 'negativePrompt'
  | 'characters'
  | 'parameters'
  | 'resolution'

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
  const [fields, setFields] = useState<Record<ImportField, boolean>>({
    generalPrompt: true,
    negativePrompt: true,
    characters: true,
    parameters: true,
    resolution: true,
  })
  const [creating, setCreating] = useState(false)

  const hasV4Chars = metadata.v4_prompt?.caption?.char_captions &&
    metadata.v4_prompt.caption.char_captions.length > 0

  function toggleField(field: ImportField) {
    setFields((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  async function handleCreate() {
    if (!projectName.trim()) {
      toast.error(t('metadata.pleaseEnterName'))
      return
    }

    setCreating(true)
    try {
      // Build prompt: for V4, base_caption goes to general, char_captions become characters
      let generalPrompt = ''
      let negativePrompt = ''

      if (fields.generalPrompt) {
        if (metadata.v4_prompt?.caption?.base_caption) {
          generalPrompt = metadata.v4_prompt.caption.base_caption
        } else {
          generalPrompt = metadata.prompt ?? ''
        }
      }

      if (fields.negativePrompt) {
        negativePrompt = metadata.negativePrompt ?? ''
      }

      // Characters from V4 char_captions
      const chars: Array<{ name: string; charPrompt: string; charNegative?: string }> = []
      if (fields.characters && hasV4Chars) {
        metadata.v4_prompt!.caption!.char_captions!.forEach((cc, i) => {
          const negChar = metadata.v4_negative_prompt?.caption?.char_captions?.[i]
          chars.push({
            name: `Character ${i + 1}`,
            charPrompt: cc.char_caption,
            charNegative: negChar?.char_caption ?? '',
          })
        })
      }

      // Parameters
      const params = fields.parameters
        ? {
            steps: metadata.steps,
            cfg_scale: metadata.cfgScale,
            cfg_rescale: metadata.cfgRescale,
            sampler: metadata.sampler,
            scheduler: metadata.scheduler,
            smea: metadata.smea,
            smeaDyn: metadata.smeaDyn,
            qualityToggle: metadata.qualityToggle,
            ucPreset: metadata.ucPreset,
            variety: metadata.variety,
            ...(fields.resolution
              ? { width: metadata.width, height: metadata.height }
              : {}),
          }
        : fields.resolution
          ? { width: metadata.width, height: metadata.height }
          : undefined

      const project = await createProjectFromMetadata({
        data: {
          name: projectName.trim(),
          generalPrompt,
          negativePrompt,
          parameters: params,
          characters: chars.length > 0 ? chars : undefined,
        },
      })

      toast.success(t('metadata.projectCreated'))
      onOpenChange(false)
      navigate({
        to: '/workspace/$projectId',
        params: { projectId: String(project.id) },
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

        <div className="space-y-4 py-2 overflow-y-auto max-h-[60vh]">
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

          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">{t('metadata.importFields')}</Label>
            <div className="space-y-2.5 pt-1">
              <FieldCheckbox
                checked={fields.generalPrompt}
                onCheckedChange={() => toggleField('generalPrompt')}
                label={t('metadata.generalPrompt')}
                preview={
                  metadata.v4_prompt?.caption?.base_caption
                    || metadata.prompt
                    || undefined
                }
              />
              <FieldCheckbox
                checked={fields.negativePrompt}
                onCheckedChange={() => toggleField('negativePrompt')}
                label={t('metadata.negativePrompt')}
                preview={metadata.negativePrompt}
              />
              {hasV4Chars && (
                <FieldCheckbox
                  checked={fields.characters}
                  onCheckedChange={() => toggleField('characters')}
                  label={t('metadata.characterPrompts', { count: metadata.v4_prompt!.caption!.char_captions!.length })}
                  preview={metadata.v4_prompt!.caption!.char_captions!.map(
                    (c) => c.char_caption,
                  ).join(' | ')}
                />
              )}
              <FieldCheckbox
                checked={fields.parameters}
                onCheckedChange={() => toggleField('parameters')}
                label={t('metadata.generationParameters')}
                preview={[
                  metadata.steps && `Steps: ${metadata.steps}`,
                  metadata.cfgScale && `CFG: ${metadata.cfgScale}`,
                  metadata.sampler && `Sampler: ${metadata.sampler}`,
                ].filter(Boolean).join(', ') || undefined}
              />
              <FieldCheckbox
                checked={fields.resolution}
                onCheckedChange={() => toggleField('resolution')}
                label={t('metadata.resolution')}
                preview={
                  metadata.width && metadata.height
                    ? `${metadata.width} x ${metadata.height}`
                    : undefined
                }
              />
            </div>
          </div>
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

function FieldCheckbox({
  checked,
  onCheckedChange,
  label,
  preview,
}: {
  checked: boolean
  onCheckedChange: () => void
  label: string
  preview?: string
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group overflow-hidden">
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium">{label}</span>
        {preview && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {preview}
          </p>
        )}
      </div>
    </label>
  )
}
