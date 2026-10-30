import { useSyncExternalStore } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowExpand01Icon,
  BookmarkCheck01Icon,
  InformationCircleIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import {
  isTagInfoEnabled,
  setTagInfoEnabled,
  subscribeTagInfoEnabled,
} from './tag-info-client'
import { Label } from '@/components/ui/label'
import { useTagSearch } from '@/components/tag-search/tag-search-provider'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

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
  const { openSearch } = useTagSearch()
  const cardOn = useSyncExternalStore(
    subscribeTagInfoEnabled,
    isTagInfoEnabled,
    () => true,
  )

  const hasButtons = true

  return (
    <div className="flex items-center justify-between">
      <Label
        className={`text-sm text-muted-foreground ${uppercase ? 'uppercase tracking-wider' : ''}`}
      >
        {label}
      </Label>
      {hasButtons && (
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => setTagInfoEnabled(!cardOn)}
            aria-pressed={cardOn}
            data-tag-info-toggle
            className={cn(
              'p-1 rounded transition-colors hover:text-foreground',
              cardOn ? 'text-primary' : 'text-muted-foreground',
            )}
            title={t('tagAssist.cardToggle')}
          >
            <HugeiconsIcon icon={InformationCircleIcon} className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => openSearch()}
            data-tag-search-open
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
            title={t('tagAssist.openSearch')}
          >
            <HugeiconsIcon icon={Search01Icon} className="size-4" />
          </button>
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
