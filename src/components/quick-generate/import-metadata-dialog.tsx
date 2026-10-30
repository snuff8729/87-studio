import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import type { NAIMetadata } from '@/lib/nai-metadata'
import type { CharacterEntry } from './types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n'

type ImportField =
  | 'generalPrompt'
  | 'negativePrompt'
  | 'characters'
  | 'parameters'
  | 'resolution'

export function ImportMetadataDialog({
  metadata,
  open,
  onOpenChange,
  onApply,
}: {
  metadata: NAIMetadata
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (data: {
    generalPrompt?: string
    negativePrompt?: string
    characters?: Array<CharacterEntry>
    parameters?: Record<string, unknown>
  }) => void
}) {
  const { t } = useTranslation()
  const [fields, setFields] = useState<Record<ImportField, boolean>>({
    generalPrompt: true,
    negativePrompt: true,
    characters: true,
    parameters: true,
    resolution: true,
  })

  const hasV4Chars =
    metadata.v4_prompt?.caption?.char_captions &&
    metadata.v4_prompt.caption.char_captions.length > 0

  function toggleField(field: ImportField) {
    setFields((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  function handleApply() {
    const result: Parameters<typeof onApply>[0] = {}

    if (fields.generalPrompt) {
      if (metadata.v4_prompt?.caption?.base_caption) {
        result.generalPrompt = metadata.v4_prompt.caption.base_caption
      } else {
        result.generalPrompt = metadata.prompt ?? ''
      }
    }

    if (fields.negativePrompt) {
      result.negativePrompt = metadata.negativePrompt ?? ''
    }

    if (fields.characters && hasV4Chars) {
      result.characters = metadata.v4_prompt!.caption!.char_captions!.map(
        (cc, i) => {
          const negChar =
            metadata.v4_negative_prompt?.caption?.char_captions?.[i]
          return {
            id: `imported-${Date.now()}-${i}`,
            name: `Character ${i + 1}`,
            prompt: cc.char_caption,
            negative: negChar?.char_caption ?? '',
          }
        },
      )
    }

    if (fields.parameters || fields.resolution) {
      const params: Record<string, unknown> = {}
      if (fields.parameters) {
        if (metadata.steps != null) params.steps = metadata.steps
        if (metadata.cfgScale != null) params.scale = metadata.cfgScale
        if (metadata.cfgRescale != null) params.cfgRescale = metadata.cfgRescale
        if (metadata.sampler) params.sampler = metadata.sampler
        if (metadata.scheduler) params.scheduler = metadata.scheduler
        if (metadata.ucPreset != null) params.ucPreset = metadata.ucPreset
      }
      if (fields.resolution) {
        if (metadata.width != null) params.width = metadata.width
        if (metadata.height != null) params.height = metadata.height
      }
      result.parameters = params
    }

    onApply(result)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('quickGenerate.importFromImage')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto max-h-[60vh]">
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">
              {t('quickGenerate.importFields')}
            </Label>
            <div className="space-y-2.5 pt-1">
              <ImportFieldCheckbox
                checked={fields.generalPrompt}
                onCheckedChange={() => toggleField('generalPrompt')}
                label={t('quickGenerate.generalPrompt')}
                preview={
                  metadata.v4_prompt?.caption?.base_caption ||
                  metadata.prompt ||
                  undefined
                }
              />
              <ImportFieldCheckbox
                checked={fields.negativePrompt}
                onCheckedChange={() => toggleField('negativePrompt')}
                label={t('quickGenerate.negativePrompt2')}
                preview={metadata.negativePrompt}
              />
              {hasV4Chars && (
                <ImportFieldCheckbox
                  checked={fields.characters}
                  onCheckedChange={() => toggleField('characters')}
                  label={t('quickGenerate.characterPrompts', {
                    count: metadata.v4_prompt!.caption!.char_captions!.length,
                  })}
                  preview={metadata
                    .v4_prompt!.caption!.char_captions!.map(
                      (c) => c.char_caption,
                    )
                    .join(' | ')}
                />
              )}
              <ImportFieldCheckbox
                checked={fields.parameters}
                onCheckedChange={() => toggleField('parameters')}
                label={t('quickGenerate.generationParameters')}
                preview={
                  [
                    metadata.steps && `Steps: ${metadata.steps}`,
                    metadata.cfgScale && `CFG: ${metadata.cfgScale}`,
                    metadata.sampler && `Sampler: ${metadata.sampler}`,
                  ]
                    .filter(Boolean)
                    .join(', ') || undefined
                }
              />
              <ImportFieldCheckbox
                checked={fields.resolution}
                onCheckedChange={() => toggleField('resolution')}
                label={t('quickGenerate.resolution')}
                preview={
                  metadata.width && metadata.height
                    ? `${metadata.width} x ${metadata.height}`
                    : undefined
                }
              />
            </div>
          </div>

          <ImportReferenceWarning metadata={metadata} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleApply}>
            {t('quickGenerate.importApply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportFieldCheckbox({
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
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-all">
            {preview}
          </p>
        )}
      </div>
    </label>
  )
}

function ImportReferenceWarning({ metadata }: { metadata: NAIMetadata }) {
  const { t } = useTranslation()
  const hasVibe =
    metadata.hasVibeTransfer &&
    metadata.vibeTransferInfo &&
    metadata.vibeTransferInfo.length > 0
  const hasPrecise =
    metadata.hasCharacterReference &&
    metadata.characterReferenceInfo &&
    metadata.characterReferenceInfo.length > 0

  if (!hasVibe && !hasPrecise) return null

  let message: string
  if (hasVibe && hasPrecise) {
    message = t('reference.importWarningBoth', {
      vibeCount: String(metadata.vibeTransferInfo!.length),
      preciseCount: String(metadata.characterReferenceInfo!.length),
    })
  } else if (hasVibe) {
    message = t('reference.importWarningVibe', {
      count: String(metadata.vibeTransferInfo!.length),
    })
  } else {
    message = t('reference.importWarningPrecise', {
      count: String(metadata.characterReferenceInfo!.length),
    })
  }

  return (
    <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/10 p-3">
      <HugeiconsIcon
        icon={AlertCircleIcon}
        className="size-4 text-primary shrink-0 mt-0.5"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">
          {t('reference.importWarningTitle')}
        </p>
        <p className="text-xs text-primary/80 mt-0.5">{message}</p>
      </div>
    </div>
  )
}
