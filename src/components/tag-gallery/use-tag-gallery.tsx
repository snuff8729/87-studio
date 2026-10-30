import { useCallback, useRef, useState } from 'react'
import { TagGalleryDialog } from './tag-gallery-dialog'

/** Append a tag to a comma-separated prompt. */
export function appendTag(value: string, tag: string): string {
  return value.trim() ? value.trimEnd().replace(/,$/, '') + ', ' + tag : tag
}

/**
 * Shared tag-gallery wiring: call `openFor(insert)` from a prompt header's
 * bookmark button, render `dialog` once.
 */
export function useTagGallery() {
  const [open, setOpen] = useState(false)
  const insertRef = useRef<((tag: string) => void) | null>(null)

  const openFor = useCallback((insert: (tag: string) => void) => {
    insertRef.current = insert
    setOpen(true)
  }, [])

  const dialog = (
    <TagGalleryDialog
      open={open}
      onOpenChange={setOpen}
      onInsertTag={(tag) => insertRef.current?.(tag)}
    />
  )

  return { openFor, dialog }
}
