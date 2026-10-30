import { useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  addBookmarkImagesFromGallery,
  createTagBookmark,
  listTagBookmarks,
} from '@/server/functions/tag-bookmarks'
import { useTranslation } from '@/lib/i18n'

/** Bookmark names are stored like the tags page: spaces as underscores */
const normalizeName = (s: string) => s.trim().replace(/\s+/g, '_')
const displayName = (s: string) => s.replace(/_/g, ' ')

type BookmarkOption = { id: number; name: string; imageCount: number }

/**
 * Pick a tag bookmark (searchable) or create one, then add the given gallery
 * images to it.
 */
export function AddToBookmarkPopover({
  imageIds,
  trigger,
  align = 'end',
  onDone,
}: {
  imageIds: ReadonlyArray<number>
  trigger: ReactNode
  align?: 'start' | 'center' | 'end'
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [bookmarks, setBookmarks] = useState<Array<BookmarkOption> | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery('')
      return
    }
    try {
      const list = await listTagBookmarks({ data: {} })
      setBookmarks(
        list.map((b) => ({
          id: b.id,
          name: b.name,
          imageCount: b.imageCount,
        })),
      )
    } catch {
      setBookmarks([])
    }
  }

  async function addTo(bookmark: { id: number; name: string }) {
    setBusy(true)
    try {
      const res = await addBookmarkImagesFromGallery({
        data: { bookmarkId: bookmark.id, galleryImageIds: [...imageIds] },
      })
      toast.success(
        res.skipped > 0
          ? t('gallery.addedToBookmarkSkipped', {
              count: res.added,
              name: displayName(bookmark.name),
              skipped: res.skipped,
            })
          : t('gallery.addedToBookmark', {
              count: res.added,
              name: displayName(bookmark.name),
            }),
      )
      setOpen(false)
      setQuery('')
      onDone?.()
    } catch {
      toast.error(t('gallery.addToBookmarkFailed'))
    } finally {
      setBusy(false)
    }
  }

  const trimmed = normalizeName(query)
  const canCreate =
    trimmed !== '' &&
    !(bookmarks ?? []).some(
      (b) => b.name.toLowerCase() === trimmed.toLowerCase(),
    )

  async function create() {
    if (busy || !canCreate) return
    setBusy(true)
    try {
      const created = await createTagBookmark({ data: { name: trimmed } })
      setBusy(false)
      await addTo({ id: created.id, name: created.name })
    } catch {
      setBusy(false)
      toast.error(t('gallery.addToBookmarkFailed'))
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-64 gap-0 p-1"
        data-bookmark-popover
      >
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('gallery.bookmarkSearch')}
          />
          <CommandList>
            <CommandEmpty>
              {bookmarks === null
                ? t('common.loading')
                : t('gallery.noBookmarks')}
            </CommandEmpty>
            <CommandGroup>
              {(bookmarks ?? []).map((b) => (
                <CommandItem
                  key={b.id}
                  value={`${b.name} ${displayName(b.name)}`}
                  data-bookmark-option={b.id}
                  disabled={busy}
                  onSelect={() => addTo(b)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {displayName(b.name)}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {b.imageCount}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {canCreate && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${trimmed}`}
                  data-bookmark-create
                  disabled={busy}
                  onSelect={create}
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-4" />
                  <span className="truncate">
                    {t('gallery.createBookmarkNamed', {
                      name: displayName(trimmed),
                    })}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
