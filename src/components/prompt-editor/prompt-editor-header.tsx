import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowExpand01Icon,
  BookmarkCheck01Icon,
} from '@hugeicons/core-free-icons'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n'

interface PromptEditorHeaderProps {
  label: string
  /** Show uppercase tracking style (used in workspace) */
  uppercase?: boolean
  onExpand?: () => void
  onOpenTagGallery?: () => void
}

export function PromptEditorHeader({
  label,
  uppercase,
  onExpand,
  onOpenTagGallery,
}: PromptEditorHeaderProps) {
  const { t } = useTranslation()

  const hasButtons = onExpand || onOpenTagGallery

  return (
    <div className="flex items-center justify-between">
      <Label
        className={`text-sm text-muted-foreground ${uppercase ? 'uppercase tracking-wider' : ''}`}
      >
        {label}
      </Label>
      {hasButtons && (
        <div className="flex gap-0.5">
          {onOpenTagGallery && (
            <button
              type="button"
              onClick={onOpenTagGallery}
              className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
              title={t('tagGallery.panelTitle')}
            >
              <HugeiconsIcon icon={BookmarkCheck01Icon} className="size-4" />
            </button>
          )}
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
              title={t('workspace.expandEditor')}
            >
              <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
