import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { TagGalleryContent } from './tag-gallery-content'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

interface TagGalleryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsertTag: (tagName: string) => void
  /**
   * Render inside this element (e.g. a Radix dialog's content, which would
   * otherwise trap focus and block pointer events for a body-level portal).
   */
  container?: HTMLElement | null
}

export function TagGalleryDialog({
  open,
  onOpenChange,
  onInsertTag,
  container,
}: TagGalleryDialogProps) {
  const { t } = useTranslation()
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const nested = !!container

  // Esc closes only the gallery, not the Radix dialog it is nested in (that
  // listens on the document in the capture phase, so intercept on window)
  useEffect(() => {
    if (!open || !nested) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, nested, onOpenChange])

  if (!open) return null

  return createPortal(
    <div
      className={
        nested
          ? 'absolute inset-0 z-10 flex items-center justify-center rounded-[inherit]'
          : 'fixed inset-0 z-50 flex items-center justify-center'
      }
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 supports-backdrop-filter:backdrop-blur-xs"
        onClick={() => onOpenChange(false)}
      />
      {/* Dialog */}
      <div
        className={
          nested
            ? 'relative bg-background rounded-lg border border-border shadow-lg w-[calc(100%-1rem)] h-[calc(100%-1rem)] flex flex-col overflow-hidden'
            : 'relative bg-background rounded-lg border border-border shadow-lg w-[90vw] h-[80vh] max-w-6xl flex flex-col overflow-hidden'
        }
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
          <span className="text-sm font-medium">
            {t('tagGallery.panelTitle')}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label={t('common.close')}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </div>
        <TagGalleryContent
          layoutId="tag-dialog"
          embedded
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          onInsertTag={(tag) => {
            onInsertTag(tag)
            onOpenChange(false)
          }}
        />
      </div>
    </div>,
    container ?? document.body,
  )
}
