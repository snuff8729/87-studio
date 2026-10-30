import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { LazyPromptEditor } from '@/components/quick-generate/lazy-prompt-editor'
import { ExpandedEditorDialog } from '@/components/prompt-editor/expanded-editor-dialog'
import { PromptEditorHeader } from '@/components/prompt-editor/prompt-editor-header'
import {
  appendTag,
  useTagGallery,
} from '@/components/tag-gallery/use-tag-gallery'
import { extractPlaceholders } from '@/lib/placeholder'
import { useBundleNames } from '@/lib/use-bundles'
import { useTranslation } from '@/lib/i18n'

interface PromptPanelProps {
  generalPrompt: string
  negativePrompt: string
  onGeneralPromptChange: (value: string) => void
  onNegativePromptChange: (value: string) => void
}

/** General + negative project prompt (characters live in CharactersPanel). */
export function PromptPanel({
  generalPrompt,
  negativePrompt,
  onGeneralPromptChange,
  onNegativePromptChange,
}: PromptPanelProps) {
  const { t } = useTranslation()
  const bundleNames = useBundleNames()
  const tagGallery = useTagGallery()
  const [expandTarget, setExpandTarget] = useState<
    'prompt' | 'negative' | null
  >(null)

  const promptPlaceholders = useMemo(
    () => extractPlaceholders(generalPrompt),
    [generalPrompt],
  )
  const negativePlaceholders = useMemo(
    () => extractPlaceholders(negativePrompt),
    [negativePrompt],
  )
  const allSlotNames = useMemo(
    () => [...new Set([...promptPlaceholders, ...negativePlaceholders])],
    [promptPlaceholders, negativePlaceholders],
  )

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <PromptEditorHeader
          label={t('workspace.prompt')}
          uppercase
          onExpand={() => setExpandTarget('prompt')}
          onOpenTagGallery={() =>
            tagGallery.openFor((tag) =>
              onGeneralPromptChange(appendTag(generalPrompt, tag)),
            )
          }
        />
        <div data-onboarding="prompt-editor">
          <LazyPromptEditor
            value={generalPrompt}
            onChange={onGeneralPromptChange}
            placeholder={t('workspace.promptPlaceholder')}
            minHeight="200px"
            bundleNames={bundleNames}
            slotNames={allSlotNames}
          />
        </div>
        {promptPlaceholders.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {promptPlaceholders.map((p) => (
              <Badge key={p} variant="secondary" className="text-xs">
                {`@{slot:${p}}`}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <PromptEditorHeader
          label={t('workspace.negativePrompt')}
          uppercase
          onExpand={() => setExpandTarget('negative')}
          onOpenTagGallery={() =>
            tagGallery.openFor((tag) =>
              onNegativePromptChange(appendTag(negativePrompt, tag)),
            )
          }
        />
        <LazyPromptEditor
          value={negativePrompt}
          onChange={onNegativePromptChange}
          placeholder={t('workspace.negativePromptPlaceholder')}
          minHeight="120px"
          bundleNames={bundleNames}
          slotNames={allSlotNames}
        />
        {negativePlaceholders.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {negativePlaceholders.map((p) => (
              <Badge key={p} variant="secondary" className="text-xs">
                {`@{slot:${p}}`}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <ExpandedEditorDialog
        open={expandTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExpandTarget(null)
        }}
        title={
          expandTarget === 'prompt'
            ? t('workspace.prompt')
            : t('workspace.negativePrompt')
        }
        value={expandTarget === 'prompt' ? generalPrompt : negativePrompt}
        onChange={
          expandTarget === 'prompt'
            ? onGeneralPromptChange
            : onNegativePromptChange
        }
        bundleNames={bundleNames}
      />
      {tagGallery.dialog}
    </div>
  )
}
