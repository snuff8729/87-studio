import { useState } from 'react'
import { LazyPromptEditor } from './lazy-prompt-editor'
import type { QuickGenerateState } from './types'
import { useTranslation } from '@/lib/i18n'
import { useBundleNames } from '@/lib/use-bundles'
import { ExpandedEditorDialog } from '@/components/prompt-editor/expanded-editor-dialog'
import { PromptEditorHeader } from '@/components/prompt-editor/prompt-editor-header'
import {
  appendTag,
  useTagGallery,
} from '@/components/tag-gallery/use-tag-gallery'

export function QuickPromptTab({
  state,
  setState,
}: {
  state: QuickGenerateState
  setState: React.Dispatch<React.SetStateAction<QuickGenerateState>>
}) {
  const { t } = useTranslation()
  const bundleNames = useBundleNames()
  const tagGallery = useTagGallery()
  const [expand, setExpand] = useState<'general' | 'negative' | null>(null)

  const expandValue =
    expand === 'general'
      ? state.generalPrompt
      : expand === 'negative'
        ? state.negativePrompt
        : ''

  const expandOnChange = (v: string) => {
    if (expand === 'general')
      setState((prev) => ({ ...prev, generalPrompt: v }))
    else if (expand === 'negative')
      setState((prev) => ({ ...prev, negativePrompt: v }))
  }

  return (
    <div className="space-y-3">
      {/* General Prompt */}
      <div className="space-y-1.5">
        <PromptEditorHeader
          label={t('quickGenerate.prompt')}
          uppercase
          onExpand={() => setExpand('general')}
          onOpenTagGallery={() =>
            tagGallery.openFor((tag) =>
              setState((prev) => ({
                ...prev,
                generalPrompt: appendTag(prev.generalPrompt, tag),
              })),
            )
          }
        />
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
        <PromptEditorHeader
          label={t('quickGenerate.negativePrompt')}
          uppercase
          onExpand={() => setExpand('negative')}
          onOpenTagGallery={() =>
            tagGallery.openFor((tag) =>
              setState((prev) => ({
                ...prev,
                negativePrompt: appendTag(prev.negativePrompt, tag),
              })),
            )
          }
        />
        <LazyPromptEditor
          value={state.negativePrompt}
          onChange={(v) => setState((prev) => ({ ...prev, negativePrompt: v }))}
          placeholder={t('quickGenerate.negativePlaceholder')}
          minHeight="120px"
          bundleNames={bundleNames}
        />
      </div>

      <ExpandedEditorDialog
        open={expand !== null}
        onOpenChange={(open) => {
          if (!open) setExpand(null)
        }}
        title={
          expand === 'general'
            ? t('quickGenerate.prompt')
            : expand === 'negative'
              ? t('quickGenerate.negativePrompt')
              : ''
        }
        value={expandValue}
        onChange={expandOnChange}
        bundleNames={bundleNames}
      />
      {tagGallery.dialog}
    </div>
  )
}
