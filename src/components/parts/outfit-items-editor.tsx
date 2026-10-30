import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  BookmarkAdd01Icon,
  Cancel01Icon,
  Layers01Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { createPreset } from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Dimmed "Covered" badge with a tooltip naming the covering item(s). */
export function CoveredBadge({ by }: { by: string }) {
  const { t } = useTranslation()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="ml-1 h-4 px-1 text-[10px]"
          data-covered-badge
          tabIndex={0}
        >
          {t('sceneParts.covered')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t('sceneParts.coveredBy', { name: by })}</TooltipContent>
    </Tooltip>
  )
}

interface OutfitItemInfo {
  id: number
  name: string
  /** null = global library item */
  projectId: number | null
}

interface OutfitPresetInfo {
  id: number
  name: string
  itemIds: Array<number>
}

interface OutfitItemsEditorProps {
  itemIds: Array<number>
  onChange: (ids: Array<number>) => void
  /** Items from getLibrary */
  items: Array<OutfitItemInfo>
  presets?: Array<OutfitPresetInfo>
  /** Used to group project-only items; items of other projects are hidden */
  projectId?: number
  /** Show "Load preset" / "Save as preset" (default true) */
  showPresetMenu?: boolean
  /** itemId -> covering item name(s): shown dimmed with a "Covered" badge */
  covered?: Record<number, string>
  className?: string
}

/** Ordered outfit item chips + add combobox + preset menu. */
export function OutfitItemsEditor({
  itemIds,
  onChange,
  items,
  presets = [],
  projectId,
  showPresetMenu = true,
  covered,
  className,
}: OutfitItemsEditorProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [presetName, setPresetName] = useState('')

  const byId = new Map(items.map((i) => [i.id, i]))
  const selectable = items.filter(
    (i) =>
      !itemIds.includes(i.id) &&
      (i.projectId === null || i.projectId === projectId),
  )
  const globalItems = selectable.filter((i) => i.projectId === null)
  const projectItems = selectable.filter((i) => i.projectId !== null)

  const move = (index: number, dir: -1 | 1) => {
    const next = [...itemIds]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const savePreset = useMutation({
    mutationFn: (name: string) =>
      createPreset({
        data: { name, itemIds: itemIds.filter((id) => byId.has(id)) },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library'] })
      toast.success(t('parts.presetSaved'))
      setSaveOpen(false)
      setPresetName('')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const renderPick = (item: OutfitItemInfo) => (
    <CommandItem
      key={item.id}
      value={`${item.name} ${item.id}`}
      onSelect={() => {
        onChange([...itemIds, item.id])
        setAddOpen(false)
      }}
    >
      {item.name}
    </CommandItem>
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {itemIds.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {t('parts.emptyOutfit')}
          </span>
        )}
        {itemIds.map((id, index) => {
          const item = byId.get(id)
          const name = item ? item.name : t('parts.missingItem')
          return (
            <span
              key={`${id}-${index}`}
              className={cn(
                'inline-flex h-7 items-center gap-0.5 rounded-lg border border-border bg-input/30 pl-2 text-sm',
                !item && 'text-muted-foreground line-through',
              )}
            >
              <span
                className={cn(
                  'max-w-40 truncate',
                  covered?.[id] && 'opacity-50',
                )}
                data-covered={covered?.[id] ? '' : undefined}
              >
                {name}
              </span>
              {covered?.[id] && <CoveredBadge by={covered[id]} />}
              {item?.projectId != null && (
                <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
                  {t('parts.projectOnly')}
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={t('parts.moveUp')}
              >
                <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6"
                disabled={index === itemIds.length - 1}
                onClick={() => move(index, 1)}
                aria-label={t('parts.moveDown')}
              >
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6"
                onClick={() => onChange(itemIds.filter((_, i) => i !== index))}
                aria-label={t('parts.removeItem', { name })}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </span>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-sm"
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              {t('parts.addItem')}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <Command>
              <CommandInput placeholder={t('parts.searchItems')} />
              <CommandList>
                <CommandEmpty>{t('parts.noItemsFound')}</CommandEmpty>
                {globalItems.length > 0 && (
                  <CommandGroup heading={t('parts.groupGlobal')}>
                    {globalItems.map(renderPick)}
                  </CommandGroup>
                )}
                {projectItems.length > 0 && (
                  <CommandGroup heading={t('parts.groupProject')}>
                    {projectItems.map(renderPick)}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {showPresetMenu && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-sm"
                >
                  <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} />
                  {t('parts.loadPreset')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {presets.length === 0 && (
                  <DropdownMenuItem disabled>
                    {t('parts.noPresets')}
                  </DropdownMenuItem>
                )}
                {presets.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => {
                      onChange(p.itemIds.filter((id) => byId.has(id)))
                      toast.success(t('parts.presetLoaded', { name: p.name }))
                    }}
                  >
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover open={saveOpen} onOpenChange={setSaveOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-sm"
                  disabled={itemIds.length === 0}
                >
                  <HugeiconsIcon icon={BookmarkAdd01Icon} strokeWidth={2} />
                  {t('parts.savePreset')}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 gap-2 p-3"
                data-block-shortcuts
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && presetName.trim()) {
                    e.preventDefault()
                    savePreset.mutate(presetName.trim())
                  }
                }}
              >
                <Input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={t('parts.presetName')}
                  aria-label={t('parts.presetName')}
                  className="h-8 text-sm"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSaveOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!presetName.trim() || savePreset.isPending}
                    onClick={() => savePreset.mutate(presetName.trim())}
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
    </div>
  )
}
