import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowExpand01Icon } from '@hugeicons/core-free-icons'
import { LazyPromptEditor } from './lazy-prompt-editor'
import type { QuickGenerateState } from './types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n'
import { useBundleNames } from '@/lib/use-bundles'
import { ExpandedEditorDialog } from '@/components/prompt-editor/expanded-editor-dialog'

export function QuickPromptTab({
  state,
  setState,
}: {
  state: QuickGenerateState
  setState: React.Dispatch<React.SetStateAction<QuickGenerateState>>
}) {
  const { t } = useTranslation()
  const bundleNames = useBundleNames()
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
        <div className="flex items-center justify-between">
          <Label className="text-sm text-muted-foreground uppercase tracking-wider">
            {t('quickGenerate.prompt')}
          </Label>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpand('general')}
            title={t('workspace.expandEditor')}
          >
            <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" />
          </Button>
        </div>
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
        <div className="flex items-center justify-between">
          <Label className="text-sm text-muted-foreground uppercase tracking-wider">
            {t('quickGenerate.negativePrompt')}
          </Label>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpand('negative')}
            title={t('workspace.expandEditor')}
          >
            <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" />
          </Button>
        </div>
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
    </div>
  )
}
