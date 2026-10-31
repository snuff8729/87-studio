import { useSyncExternalStore } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
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
import { useDataset } from '@/components/datasets/use-data-files'
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
  const navigate = useNavigate()
  const tagDb = useDataset('danbooru')
  const noTagData = !!tagDb && tagDb.installedVersion == null
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
            onClick={() => {
              if (noTagData) {
                toast(t('data.toggleNeedsData'), {
                  action: {
                    label: t('data.toggleNeedsDataAction'),
                    onClick: () =>
                      void navigate({
                        to: '/settings',
                        search: { imageDetail: undefined },
                        hash: 'settings-data',
                      }),
                  },
                })
                return
              }
              setTagInfoEnabled(!cardOn)
            }}
            aria-pressed={cardOn}
            data-tag-info-toggle
            data-state={cardOn ? 'on' : 'off'}
            className={cn(
              'relative rounded p-1 transition-colors',
              cardOn
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-muted-foreground/60 hover:text-foreground',
            )}
            title={cardOn ? t('tagAssist.cardOn') : t('tagAssist.cardOff')}
            aria-label={cardOn ? t('tagAssist.cardOn') : t('tagAssist.cardOff')}
          >
            <HugeiconsIcon
              icon={InformationCircleIcon}
              className={cn('size-4', !cardOn && 'opacity-60')}
            />
            {!cardOn && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1 h-px w-[calc(100%-0.5rem)] -rotate-45 bg-current"
              />
            )}
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
