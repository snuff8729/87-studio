import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Image01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import type { MenuEntry } from '@/components/workspace/scene-templates/row-menu'
import {
  RowContextMenu,
  RowMenuButton,
} from '@/components/workspace/scene-templates/row-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export interface ListEntry {
  id: number
  title: string
  subtitle: string
  projectOnly?: boolean
  /** Show a thumbnail slot (characters / items) */
  hasThumb?: boolean
  thumbnailPath?: string | null
}

/** Search + ＋ New + rows with a ⋯ / right-click menu. */
export function LibraryList({
  header,
  entries,
  selectedId,
  onSelect,
  searchPlaceholder,
  emptyText,
  newTitle,
  renderNewForm,
  menuFor,
}: {
  /** Tabs (rendered above the search) */
  header: ReactNode
  entries: Array<ListEntry>
  selectedId: number | null
  onSelect: (id: number) => void
  searchPlaceholder: string
  emptyText: string
  newTitle: string
  renderNewForm: (close: () => void) => ReactNode
  menuFor: (entry: ListEntry, index: number) => Array<MenuEntry>
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const q = search.trim().toLowerCase()
  const filtered = q
    ? entries.filter((e) => e.title.toLowerCase().includes(q))
    : entries

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        {header}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <Popover open={newOpen} onOpenChange={setNewOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                data-new-entry
              >
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
                {t('library.newShort')}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 gap-3 p-3"
              data-block-shortcuts
            >
              <div className="text-sm font-medium">{newTitle}</div>
              {renderNewForm(() => setNewOpen(false))}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {entries.length === 0 ? emptyText : t('library.noMatches')}
          </p>
        ) : (
          <div className="space-y-0.5 p-1.5">
            {filtered.map((entry, i) => {
              const active = entry.id === selectedId
              const menu = menuFor(entry, entries.indexOf(entry))
              return (
                <RowContextMenu key={entry.id} entries={menu}>
                  <div
                    role="button"
                    tabIndex={0}
                    data-list-row
                    data-active={active || undefined}
                    onClick={() => onSelect(entry.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect(entry.id)
                      }
                    }}
                    className={cn(
                      'group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      active ? 'bg-primary/15' : 'hover:bg-accent',
                    )}
                    data-index={i}
                  >
                    {entry.hasThumb && (
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary text-muted-foreground">
                        {entry.thumbnailPath ? (
                          <img
                            src={`/api/thumbnails/${entry.thumbnailPath.replace('data/thumbnails/', '')}`}
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                            data-list-thumb
                          />
                        ) : (
                          <HugeiconsIcon
                            icon={Image01Icon}
                            className="size-4"
                          />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {entry.title}
                        </span>
                        {entry.projectOnly && (
                          <Badge
                            variant="outline"
                            className="h-4 shrink-0 px-1 text-[10px] font-normal"
                          >
                            {t('library.projectOnly')}
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {entry.subtitle}
                      </div>
                    </div>
                    <RowMenuButton
                      entries={menu}
                      label={t('library.rowMenu')}
                      className="md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 data-[state=open]:opacity-100"
                    />
                  </div>
                </RowContextMenu>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
