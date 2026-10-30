import { HugeiconsIcon } from '@hugeicons/react'
import { MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import type { IconSvgElement } from '@hugeicons/react'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface MenuEntry {
  id: string
  label: string
  icon: IconSvgElement
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
  /** Draw a separator above this entry */
  separator?: boolean
}

/** The same entries as a "…" dropdown button. */
export function RowMenuButton({
  entries,
  label,
  className,
}: {
  entries: Array<MenuEntry>
  label: string
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-secondary/80 hover:text-foreground',
            className,
          )}
          title={label}
          aria-label={label}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-44"
        onClick={(e) => e.stopPropagation()}
      >
        {entries.map((e) => (
          <div key={e.id}>
            {e.separator && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={e.destructive ? 'destructive' : undefined}
              disabled={e.disabled}
              onSelect={e.onSelect}
            >
              <HugeiconsIcon icon={e.icon} />
              {e.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Right-click menu around a row (children rendered as the trigger). */
export function RowContextMenu({
  entries,
  children,
}: {
  entries: Array<MenuEntry>
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        {entries.map((e) => (
          <div key={e.id}>
            {e.separator && <ContextMenuSeparator />}
            <ContextMenuItem
              variant={e.destructive ? 'destructive' : undefined}
              disabled={e.disabled}
              onSelect={e.onSelect}
            >
              <HugeiconsIcon icon={e.icon} />
              {e.label}
            </ContextMenuItem>
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
