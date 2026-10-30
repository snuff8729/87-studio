import { useState } from 'react'
import { createPortal } from 'react-dom'
import { TagGalleryContent } from './tag-gallery-content'

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
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  if (!open) return null

  const nested = !!container

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
        className="absolute inset-0 bg-black/50"
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
        <TagGalleryContent
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
