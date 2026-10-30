import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons'
import { usePendingSave } from './pending-saves'
import type { AxisValues, OutfitEntry } from '@/lib/character-parts'
import { AxisSegmented } from '@/components/parts/axis-segmented'
import { OutfitItemsEditor } from '@/components/parts/outfit-items-editor'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { parseAxisValues, parseOutfitEntries } from '@/lib/character-parts'
import { useTranslation } from '@/lib/i18n'
import { updateCharacter } from '@/server/functions/characters'
import {
  createLibraryCharacter,
  detachCharacterSlot,
  getLibrary,
} from '@/server/functions/library'

export interface SlotPartsFields {
  libraryCharacterId: number | null
  /** JSON string */
  outfitItemIds: string | null
  /** JSON string */
  axisValues: string | null
}

interface PartsState {
  libraryCharacterId: number | null
  outfitItemIds: Array<OutfitEntry>
  axisValues: AxisValues
}

function parseState(slot: SlotPartsFields): PartsState {
  return {
    libraryCharacterId: slot.libraryCharacterId,
    outfitItemIds: parseOutfitEntries(slot.outfitItemIds),
    axisValues: parseAxisValues(slot.axisValues),
  }
}

/** Whether the slot's prompt gets library text added (drives the hint). */
export function slotHasParts(slot: SlotPartsFields): boolean {
  return (
    slot.libraryCharacterId !== null ||
    parseOutfitEntries(slot.outfitItemIds).length > 0
  )
}

/**
 * Workspace Chars tab: library character link, default outfit and slot
 * defaults for local axes. Every change is saved immediately and sends only
 * the changed field, so it never clobbers the debounced prompt save.
 */
export function CharacterPartsPanel({
  projectId,
  slotId,
  slotName,
  slot,
}: {
  projectId: number
  slotId: number
  slotName: string
  slot: SlotPartsFields
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [state, setState] = useState<PartsState>(() => parseState(slot))
  const [pickOpen, setPickOpen] = useState(false)
  const [detachOpen, setDetachOpen] = useState(false)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const busyRef = useRef(0)
  const failedRef = useRef(false)
  const slotRef = useRef(slot)
  slotRef.current = slot

  // Re-sync when the server data changes (detach, ...) and nothing is in flight
  const serverKey = `${slot.libraryCharacterId}|${slot.outfitItemIds ?? ''}|${slot.axisValues ?? ''}`
  useEffect(() => {
    if (busyRef.current === 0) setState(parseState(slot))
  }, [serverKey])

  const { data: library } = useQuery({
    queryKey: ['library', projectId],
    queryFn: () => getLibrary({ data: { projectId } }),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
  })

  const linked = library?.characters.find(
    (c) => c.id === state.libraryCharacterId,
  )
  const globalChars = library?.characters.filter((c) => c.projectId === null)
  const projectChars = library?.characters.filter((c) => c.projectId !== null)

  const localAxes = useMemo(() => {
    if (!library) return []
    const itemIds = new Set(state.outfitItemIds.map((e) => e.id))
    return library.axes.filter(
      (a) =>
        (a.ownerCharacterId !== null &&
          a.ownerCharacterId === state.libraryCharacterId) ||
        (a.ownerItemId !== null && itemIds.has(a.ownerItemId)),
    )
  }, [library, state.libraryCharacterId, state.outfitItemIds])

  /** Optimistically update, then save only `patch` (serialized, in order). */
  function persist(
    next: Partial<PartsState>,
    patch: {
      libraryCharacterId?: number | null
      outfitItemIds?: Array<OutfitEntry>
      axisValues?: Record<string, number>
    },
  ) {
    setState((s) => ({ ...s, ...next }))
    busyRef.current++
    chainRef.current = chainRef.current
      .then(async () => {
        await updateCharacter({ data: { id: slotId, ...patch } })
        await router.invalidate()
      })
      .catch(() => {
        toast.error(t('workspace.characterSaveFailed'))
        failedRef.current = true
      })
      .finally(() => {
        busyRef.current--
        // Reset local state from the slot props (server truth)
        if (busyRef.current === 0 && failedRef.current) {
          failedRef.current = false
          setState(parseState(slotRef.current))
        }
      })
  }

  usePendingSave({
    flush: async () => {
      await chainRef.current
    },
  })

  function link(id: number | null) {
    persist({ libraryCharacterId: id }, { libraryCharacterId: id })
  }

  function setAxis(axisId: number, value: number | null) {
    const axisValues = { ...state.axisValues }
    if (value === null) delete axisValues[String(axisId)]
    else axisValues[String(axisId)] = value
    persist({ axisValues }, { axisValues })
  }

  async function createInLibrary() {
    try {
      const row = await createLibraryCharacter({
        data: { name: slotName || t('characters.unnamed') },
      })
      await queryClient.invalidateQueries({ queryKey: ['library'] })
      link(row.id)
      toast.success(t('charParts.created'))
    } catch {
      toast.error(t('charParts.createFailed'))
    }
  }

  async function detach() {
    try {
      await chainRef.current
      await detachCharacterSlot({ data: { characterSlotId: slotId } })
      await router.invalidate()
      await queryClient.invalidateQueries({ queryKey: ['library'] })
      toast.success(t('charParts.detached'))
    } catch {
      toast.error(t('charParts.detachFailed'))
    }
  }

  const libraryHref = linked
    ? `/characters?tab=characters&id=${linked.id}${
        linked.projectId !== null ? `&projectId=${linked.projectId}` : ''
      }`
    : null

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-2.5">
      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground uppercase tracking-wider">
          {t('charParts.libraryCharacter')}
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <Popover open={pickOpen} onOpenChange={setPickOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="max-w-[11rem] justify-between gap-2 text-sm"
                data-library-character-select
              >
                <span className="truncate">
                  {linked ? linked.name : t('charParts.none')}
                </span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  className="size-3.5 shrink-0"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[min(16rem,calc(100vw-2rem))] p-0"
            >
              <Command>
                <CommandInput placeholder={t('charParts.search')} />
                <CommandList>
                  <CommandEmpty>{t('charParts.noneFound')}</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__none__"
                      onSelect={() => {
                        link(null)
                        setPickOpen(false)
                      }}
                    >
                      {t('charParts.none')}
                    </CommandItem>
                  </CommandGroup>
                  {globalChars && globalChars.length > 0 && (
                    <CommandGroup heading={t('parts.groupGlobal')}>
                      {globalChars.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.name} ${c.id}`}
                          onSelect={() => {
                            link(c.id)
                            setPickOpen(false)
                          }}
                        >
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {projectChars && projectChars.length > 0 && (
                    <CommandGroup heading={t('parts.groupProject')}>
                      {projectChars.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.name} ${c.id}`}
                          onSelect={() => {
                            link(c.id)
                            setPickOpen(false)
                          }}
                        >
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {linked && (
            <Badge
              variant={linked.projectId === null ? 'secondary' : 'outline'}
              className="text-xs"
            >
              {linked.projectId === null
                ? t('charParts.linked')
                : t('parts.projectOnly')}
            </Badge>
          )}
          {linked && linked.projectId === null && (
            <Button
              variant="outline"
              size="sm"
              className="text-sm"
              onClick={() => setDetachOpen(true)}
            >
              {t('charParts.detach')}
            </Button>
          )}
          {linked && libraryHref && (
            <Button variant="ghost" size="sm" className="text-sm" asChild>
              <a href={libraryHref} target="_blank" rel="noreferrer">
                <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />
                {t('charParts.editInLibrary')}
              </a>
            </Button>
          )}
          {!linked && (
            <Button
              variant="ghost"
              size="sm"
              className="text-sm"
              onClick={() => void createInLibrary()}
              disabled={!library}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
              {t('charParts.newInLibrary')}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground uppercase tracking-wider">
          {t('charParts.defaultOutfit')}
        </Label>
        <OutfitItemsEditor
          entries={state.outfitItemIds}
          onChange={(next) =>
            persist({ outfitItemIds: next }, { outfitItemIds: next })
          }
          items={library?.items ?? []}
          areas={library?.areas}
          presets={library?.presets}
          projectId={projectId}
          showPresetMenu
        />
      </div>

      {localAxes.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground uppercase tracking-wider">
            {t('charParts.axisDefaults')}
          </Label>
          <div className="space-y-2">
            {localAxes.map((axis) => (
              <AxisSegmented
                key={axis.id}
                axis={axis}
                value={state.axisValues[String(axis.id)] ?? null}
                onChange={(v) => setAxis(axis.id, v)}
                inheritLabel={t('parts.inheritDefault')}
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={detachOpen}
        onOpenChange={setDetachOpen}
        title={t('charParts.detachTitle')}
        description={t('charParts.detachDesc')}
        actionLabel={t('charParts.detach')}
        variant="default"
        onConfirm={() => void detach()}
      />
    </div>
  )
}

export function PartsPromptHint() {
  const { t } = useTranslation()
  return (
    <p className="text-xs text-muted-foreground" data-parts-hint>
      {t('charParts.promptHint')}
    </p>
  )
}
