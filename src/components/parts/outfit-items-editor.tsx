import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { BookmarkAdd01Icon, Layers01Icon } from '@hugeicons/core-free-icons'
import type { ItemVariable, OutfitEntry } from '@/lib/character-parts'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  DragHandle,
  RowRemoveButton,
  SortableList,
  SortableRow,
} from '@/components/common/sortable-list/sortable-list'
import { AddRowButton } from '@/components/common/sortable-list/add-row'
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

/** Dimmed "Partly covered" badge; tooltip lists "<fragment> - covered by <item>". */
export function PartlyCoveredBadge({
  lines,
}: {
  lines: Array<{ text: string; by: string }>
}) {
  const { t } = useTranslation()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className="ml-1 h-4 px-1 text-[10px]"
          data-partly-covered-badge
          tabIndex={0}
        >
          {t('sceneParts.partlyCovered')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="flex flex-col gap-0.5" data-partly-covered-tip>
        {lines.map((l, i) => (
          <span key={i}>
            {t('sceneParts.partlyCoveredLine', { text: l.text, name: l.by })}
          </span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

/** Variable value input: commits on blur / Enter; empty = use the item default. */
function VarInput({
  name,
  placeholder,
  value,
  onCommit,
}: {
  name: string
  placeholder: string
  value: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const next = draft.trim()
    if (next !== value) onCommit(next)
  }
  return (
    <label className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
      <span className="shrink-0">{name}</span>
      <Input
        value={draft}
        placeholder={placeholder}
        aria-label={name}
        data-outfit-var={name}
        data-block-shortcuts
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setDraft(value)
            e.currentTarget.blur()
          }
        }}
        className="h-6 w-28 px-1.5 text-xs"
      />
    </label>
  )
}

interface OutfitItemInfo {
  id: number
  name: string
  /** Variables of the item (an input per variable is shown in its row) */
  variables?: Array<ItemVariable>
  /** null = global library item */
  projectId: number | null
  /** Body areas the item occupies (shown small in the row) */
  areaIds?: Array<number>
}

interface OutfitPresetInfo {
  id: number
  name: string
  entries: Array<OutfitEntry>
}

interface OutfitItemsEditorProps {
  entries: Array<OutfitEntry>
  onChange: (entries: Array<OutfitEntry>) => void
  /** Items from getLibrary */
  items: Array<OutfitItemInfo>
  presets?: Array<OutfitPresetInfo>
  /** Used to group project-only items; items of other projects are hidden */
  projectId?: number
  /** Show "Load preset" / "Save as preset" (default true) */
  showPresetMenu?: boolean
  /** itemId -> covering item name(s): shown dimmed with a "Covered" badge */
  covered?: Record<number, string>
  /** itemId -> hidden fragments (text + covering item name): "Partly covered" */
  partial?: Record<number, Array<{ text: string; by: string }>>
  /** Body areas (names for the small area labels) */
  areas?: Array<{ id: number; name: string }>
  className?: string
}

/** Ordered outfit item chips + add combobox + preset menu. */
export function OutfitItemsEditor({
  entries,
  onChange,
  items,
  presets = [],
  projectId,
  showPresetMenu = true,
  covered,
  partial,
  areas,
  className,
}: OutfitItemsEditorProps) {
  const itemIds = entries.map((e) => e.id)
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

  // Sortable ids: item ids, disambiguated only if an item is listed twice
  const hasDupes = new Set(itemIds).size !== itemIds.length
  const rowKeys = itemIds.map((id, i) => (hasDupes ? `${id}-${i}` : String(id)))
  const areaName = new Map((areas ?? []).map((a) => [a.id, a.name]))

  const savePreset = useMutation({
    mutationFn: (name: string) =>
      createPreset({
        data: { name, itemIds: entries.filter((e) => byId.has(e.id)) },
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
        onChange([...entries, { id: item.id }])
        setAddOpen(false)
      }}
    >
      {item.name}
    </CommandItem>
  )

  return (
    <div className={cn('flex max-w-[32rem] flex-col gap-1.5', className)}>
      {itemIds.length === 0 ? (
        <span className="px-1 text-xs text-muted-foreground">
          {t('parts.emptyOutfit')}
        </span>
      ) : (
        <span className="px-1 text-[11px] text-muted-foreground">
          {t('parts.outfitOrder')}
        </span>
      )}
      <SortableList
        ids={rowKeys}
        onReorder={(keys) =>
          onChange(keys.map((k) => entries[rowKeys.indexOf(String(k))]))
        }
      >
        <div className="flex flex-col gap-1" data-outfit-list>
          {entries.map((entry, index) => {
            const id = entry.id
            const item = byId.get(id)
            const vars = item?.variables ?? []
            const name = item ? item.name : t('parts.missingItem')
            const areaNames = (item?.areaIds ?? [])
              .map((a) => areaName.get(a))
              .filter(Boolean)
              .join(', ')
            return (
              <SortableRow
                key={rowKeys[index]}
                id={rowKeys[index]}
                data-outfit-row
                className="flex flex-col rounded-lg border border-border bg-input/20 pr-1 pl-0.5"
              >
                <div className="flex h-9 items-center gap-1.5">
                  <DragHandle />
                  <span
                    className={cn(
                      'min-w-0 truncate text-sm',
                      !item && 'text-muted-foreground line-through',
                      covered?.[id] && 'opacity-50',
                    )}
                    data-covered={covered?.[id] ? '' : undefined}
                  >
                    {name}
                  </span>
                  {areaNames && (
                    <span
                      className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
                      data-item-areas-label
                    >
                      {areaNames}
                    </span>
                  )}
                  {!areaNames && <span className="flex-1" />}
                  {covered?.[id] && <CoveredBadge by={covered[id]} />}
                  {!covered?.[id] && partial?.[id] && (
                    <PartlyCoveredBadge lines={partial[id]} />
                  )}
                  {item?.projectId != null && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      {t('parts.projectOnly')}
                    </Badge>
                  )}
                  <RowRemoveButton
                    label={t('parts.removeItem', { name })}
                    onClick={() =>
                      onChange(entries.filter((_, i) => i !== index))
                    }
                  />
                </div>
                {vars.length > 0 && (
                  <div
                    className="flex flex-wrap gap-x-3 gap-y-1 pb-1.5 pl-6"
                    data-outfit-vars
                  >
                    {vars.map((v) => (
                      <VarInput
                        key={v.name}
                        name={v.name}
                        placeholder={v.default || t('parts.varEmpty')}
                        value={entry.vars?.[v.name] ?? ''}
                        onCommit={(value) =>
                          onChange(
                            entries.map((e, i) => {
                              if (i !== index) return e
                              const next = { ...(e.vars ?? {}) }
                              if (value) next[v.name] = value
                              else delete next[v.name]
                              return Object.keys(next).length > 0
                                ? { id: e.id, vars: next }
                                : { id: e.id }
                            }),
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </SortableRow>
            )
          })}
        </div>
      </SortableList>

      <div className="flex flex-wrap items-center gap-1.5">
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <AddRowButton label={t('parts.addItem')} className="w-auto" />
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
                      onChange(
                        p.entries
                          .filter((e) => byId.has(e.id))
                          .map((e) => ({
                            ...e,
                            ...(e.vars ? { vars: { ...e.vars } } : {}),
                          })),
                      )
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
                  disabled={entries.length === 0}
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
