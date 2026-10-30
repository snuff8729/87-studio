import { HugeiconsIcon } from '@hugeicons/react'
import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import type { NAIMetadata } from '@/lib/nai-metadata'
import type { CharacterEntry } from './types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  MetadataImportOptions,
  useMetadataImport,
} from '@/components/common/metadata-import-options'
import { buildImport } from '@/lib/nai-import'
import { useTranslation } from '@/lib/i18n'

export function ImportMetadataDialog({
  metadata,
  open,
  onOpenChange,
  currentParameters,
  onApply,
}: {
  metadata: NAIMetadata
  open: boolean
  onOpenChange: (open: boolean) => void
  currentParameters: Record<string, unknown>
  onApply: (data: {
    generalPrompt?: string
    negativePrompt?: string
    characters?: Array<CharacterEntry>
    parameters?: Record<string, unknown>
  }) => void
}) {
  const { t } = useTranslation()
  const { imported, selection, setSelection } = useMetadataImport(metadata)

  function handleApply() {
    const out = buildImport(metadata, selection)
    onApply({
      generalPrompt: out.generalPrompt,
      negativePrompt: out.negativePrompt,
      characters: out.characters?.map((c, i) => ({
        id: `imported-${Date.now()}-${i}`,
        name: c.name,
        prompt: c.prompt,
        negative: c.negative,
      })),
      parameters: out.parameters,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('quickGenerate.importFromImage')}</DialogTitle>
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
          <Button onClick={handleApply}>
            {t('quickGenerate.importApply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ImportReferenceWarning({
  metadata,
}: {
  metadata: NAIMetadata
}) {
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
        className="mt-0.5 size-4 shrink-0 text-primary"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">
          {t('reference.importWarningTitle')}
        </p>
        <p className="mt-0.5 text-xs text-primary/80">{message}</p>
      </div>
    </div>
  )
}
