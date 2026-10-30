import { useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
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
  bulkUpdateImageTags,
  getImageTagCounts,
} from '@/server/functions/gallery'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type TagOption = { id: number; name: string }

/** How many of the selected images carry a tag. */
export type TagState = 'all' | 'some' | 'none'

export function tagStateFor(count: number, total: number): TagState {
  if (count <= 0) return 'none'
  return count >= total ? 'all' : 'some'
}

/**
 * Add / remove tags on the selected gallery images. A tag every selected image
 * has is removed on click, anything else is added to all of them.
 */
export function BulkTagPopover({
  imageIds,
  tags,
  onTagsCreated,
  trigger,
}: {
  imageIds: ReadonlyArray<number>
  tags: Array<TagOption>
  /** Tags created through the popover, so the page can extend its tag list */
  onTagsCreated: (created: Array<TagOption>) => void
  trigger: ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const total = imageIds.length

  async function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setQuery('')
      return
    }
    try {
      const rows = await getImageTagCounts({
        data: { imageIds: [...imageIds] },
      })
      setCounts(Object.fromEntries(rows.map((r) => [r.tagId, r.count])))
    } catch {
      setCounts({})
    }
  }

  async function toggle(tag: TagOption) {
    if (busy) return
    const state = tagStateFor(counts[tag.id] ?? 0, total)
    setBusy(true)
    try {
      await bulkUpdateImageTags({
        data: {
          imageIds: [...imageIds],
          ...(state === 'all'
            ? { removeTagIds: [tag.id] }
            : { addTagIds: [tag.id] }),
        },
      })
      setCounts((prev) => ({ ...prev, [tag.id]: state === 'all' ? 0 : total }))
      toast.success(
        t(state === 'all' ? 'gallery.tagRemoved' : 'gallery.tagAdded', {
          name: tag.name,
          count: total,
        }),
      )
    } catch {
      toast.error(t('gallery.bulkFailed'))
    } finally {
      setBusy(false)
    }
  }

  const trimmed = query.trim().toLowerCase()
  const canCreate = trimmed !== '' && !tags.some((x) => x.name === trimmed)

  async function create() {
    if (busy || !canCreate) return
    setBusy(true)
    try {
      const res = await bulkUpdateImageTags({
        data: { imageIds: [...imageIds], addTagNames: [trimmed] },
      })
      onTagsCreated(res.tags)
      setCounts((prev) => ({
        ...prev,
        ...Object.fromEntries(res.tags.map((x) => [x.id, total])),
      }))
      toast.success(t('gallery.tagAdded', { name: trimmed, count: total }))
      setQuery('')
    } catch {
      toast.error(t('gallery.bulkFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 gap-0 p-1"
        data-bulk-tag-popover
      >
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('gallery.tagSearch')}
          />
          <CommandList>
            <CommandEmpty>{t('gallery.noTags')}</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => {
                const state = tagStateFor(counts[tag.id] ?? 0, total)
                return (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    data-tag-option={tag.id}
                    data-tag-state={state}
                    onSelect={() => toggle(tag)}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border',
                        state !== 'none' &&
                          'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {state === 'all' && (
                        <HugeiconsIcon icon={Tick02Icon} className="size-3" />
                      )}
                      {state === 'some' && (
                        <span className="h-0.5 w-2 rounded bg-current" />
                      )}
                    </span>
                    <span className="truncate">{tag.name}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {canCreate && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${trimmed}`}
                  data-tag-create
                  onSelect={create}
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-4" />
                  <span className="truncate">
                    {t('gallery.createTagNamed', { name: trimmed })}
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
