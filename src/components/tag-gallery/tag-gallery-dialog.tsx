import { useState } from 'react'
import { TagGalleryContent } from './tag-gallery-content'

interface TagGalleryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInsertTag: (tagName: string) => void
}

export function TagGalleryDialog({
  open,
  onOpenChange,
  onInsertTag,
}: TagGalleryDialogProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      {/* Dialog */}
      <div className="relative bg-background rounded-lg border border-border shadow-lg w-[90vw] h-[80vh] max-w-6xl flex flex-col overflow-hidden">
        <TagGalleryContent
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          onInsertTag={(tag) => {
            onInsertTag(tag)
            onOpenChange(false)
          }}
        />
      </div>
    </div>
  )
}
