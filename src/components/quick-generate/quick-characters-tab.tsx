import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons'
import type { CharacterEntry, QuickGenerateState } from './types'
import type { CharacterPatch } from '@/components/characters/characters-editor'
import type { PartsAxis } from '@/lib/character-parts'
import type { QuickPartsFields } from '@/lib/quick-parts'
import { CharactersEditor } from '@/components/characters/characters-editor'
import {
  CharacterPartsView,
  PartsPromptHint,
} from '@/components/workspace/character-parts-panel'
import { AxisSegmented } from '@/components/parts/axis-segmented'
import { AI_POSITION } from '@/lib/character-positions'
import { summarizeEmptyItems } from '@/lib/character-parts'
import {
  buildQuickPromptInput,
  quickCharHasParts,
  setAxisValue,
} from '@/lib/quick-parts'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { getLibrary } from '@/server/functions/library'
import { previewQuickPrompts } from '@/server/functions/quick-generation'

export type PartsPatch = CharacterPatch & QuickPartsFields

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

function valueName(axis: PartsAxis, id: number | undefined) {
  return axis.values.find((v) => v.id === id)?.name
}

export function QuickCharactersTab({
  state,
  addCharacter,
  duplicateCharacter,
  moveCharacter,
  reorderCharacters,
  removeCharacter,
  updateCharacter,
  setGlobalAxis,
  positions,
}: {
  state: QuickGenerateState
  addCharacter: () => string
  duplicateCharacter: (id: string) => string | undefined
  moveCharacter: (id: string, direction: -1 | 1) => void
  reorderCharacters: (ids: Array<string>) => void
  removeCharacter: (id: string) => void
  updateCharacter: (id: string, patch: PartsPatch) => void
  setGlobalAxis: (axisId: number, valueId: number) => void
  positions: { aspect: number } | false
}) {
  const { t } = useTranslation()
  const { characters } = state
  const items = useMemo(
    () =>
      characters.map((c) => ({ ...c, position: c.position ?? AI_POSITION })),
    [characters],
  )
  const anyParts = characters.some(quickCharHasParts)

  const library = useQuery({
    queryKey: ['library', null],
    queryFn: () => getLibrary({ data: { projectId: null } }),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    enabled: anyParts,
  })
  const globalAxes = useMemo(
    () =>
      (library.data?.axes ?? []).filter(
        (a) => a.ownerCharacterId === null && a.ownerItemId === null,
      ),
    [library.data?.axes],
  )

  // Final composed prompts (debounced; also drives the badges)
  const input = useDebounced(
    JSON.stringify(
      buildQuickPromptInput({
        generalPrompt: state.generalPrompt,
        negativePrompt: state.negativePrompt,
        characters,
        globalAxisValues: state.globalAxisValues,
      }),
    ),
    300,
  )
  const preview = useQuery({
    queryKey: ['quick-parts-preview', input, library.dataUpdatedAt],
    queryFn: () =>
      previewQuickPrompts({
        data: JSON.parse(input) as Parameters<
          typeof previewQuickPrompts
        >[0]['data'],
      }),
    enabled: anyParts && !!library.data,
    placeholderData: (prev) => prev,
  })

  return (
    <div className="space-y-3">
      {anyParts && globalAxes.length > 0 && (
        <div
          className="space-y-1.5 rounded-lg border border-border/60 bg-card/40 p-2.5"
          data-testid="quick-global-axes"
        >
          <div className="text-xs font-medium text-muted-foreground">
            {t('quickParts.globalAxes')}
          </div>
          {globalAxes.map((axis) => (
            <AxisSegmented
              key={axis.id}
              axis={axis}
              value={
                state.globalAxisValues?.[String(axis.id)] ??
                axis.values[0]?.id ??
                null
              }
              onChange={(v) => v !== null && setGlobalAxis(axis.id, v)}
              defaultBadge
            />
          ))}
        </div>
      )}
      <CharactersEditor
        characters={items}
        positions={positions}
        onAdd={addCharacter}
        onUpdate={updateCharacter}
        onDuplicate={duplicateCharacter}
        onMove={moveCharacter}
        onReorder={reorderCharacters}
        onDelete={removeCharacter}
        renderParts={(c) => {
          const index = characters.findIndex((x) => x.id === c.id)
          if (index < 0) return null
          return (
            <QuickPartsCard
              character={characters[index]}
              resolved={preview.data?.characterPrompts[index]}
              loading={anyParts && !preview.data}
              globalAxes={globalAxes}
              items={library.data?.items ?? []}
              onChange={(patch) => updateCharacter(c.id, patch)}
            />
          )
        }}
        renderPromptHint={(c) => {
          const x = characters.find((e) => e.id === c.id)
          return x && quickCharHasParts(x) ? <PartsPromptHint /> : null
        }}
      />
    </div>
  )
}

type Resolved = Awaited<
  ReturnType<typeof previewQuickPrompts>
>['characterPrompts'][number]

function QuickPartsCard({
  character,
  resolved,
  loading,
  globalAxes,
  items,
  onChange,
}: {
  character: CharacterEntry
  resolved: Resolved | undefined
  loading: boolean
  globalAxes: Array<PartsAxis>
  items: Array<{
    id: number
    name: string
    fragments?: Array<{ id: number; text: string }>
  }>
  onChange: (patch: QuickPartsFields) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const hasParts = quickCharHasParts(character)

  const nameOf = (id: number) => items.find((i) => i.id === id)?.name
  const covered: Record<number, string> = {}
  for (const h of resolved?.hiddenItems ?? [])
    covered[h.itemId] = h.coveredBy.map(nameOf).filter(Boolean).join(', ')
  const partial: Record<number, Array<{ text: string; by: string }>> = {}
  for (const p of resolved?.partialItems ?? []) {
    const item = items.find((i) => i.id === p.itemId)
    partial[p.itemId] = p.details.map((d) => ({
      text:
        item?.fragments?.find((f) => f.id === d.fragmentId)?.text.trim() ??
        `#${d.fragmentId}`,
      by: d.coveredBy.map(nameOf).filter(Boolean).join(', '),
    }))
  }
  const summary = summarizeEmptyItems(
    (resolved?.outfitEntries ?? []).map((e) => e.id),
    (resolved?.hiddenItems ?? []).map((h) => h.itemId),
    resolved?.emptyItemIds ?? [],
  )
  const values = globalAxes
    .map((a) => valueName(a, resolved?.axisValues?.[String(a.id)]))
    .filter(Boolean)
    .join(' · ')
  const emptyLines: Array<string> = []
  if (resolved?.charEmpty)
    emptyLines.push(t('quickParts.charEmptyLine', { name: character.name }))
  if (summary.allEmpty)
    emptyLines.push(t('quickParts.outfitAllEmpty', { name: character.name }))
  else if (summary.emptyIds.length > 0)
    emptyLines.push(
      t('quickParts.emptyItemsLine', {
        name: character.name,
        items: summary.emptyIds.map(nameOf).filter(Boolean).join(', '),
        values,
      }),
    )

  return (
    <CharacterPartsView
      slotName={character.name}
      state={{
        libraryCharacterId: character.libraryCharacterId ?? null,
        outfitItemIds: character.outfit ?? [],
        axisValues: character.axisValues ?? {},
      }}
      onLink={(id) => onChange({ libraryCharacterId: id })}
      onOutfit={(outfit) => onChange({ outfit })}
      onAxis={(axisId, v) =>
        onChange({ axisValues: setAxisValue(character.axisValues, axisId, v) })
      }
      outfitDecor={{
        covered,
        partial,
        empty: { ids: summary.emptyIds, values },
      }}
    >
      {hasParts && (
        <div className="space-y-2" data-testid="quick-parts-preview">
          {emptyLines.length > 0 && (
            <div
              className="space-y-0.5 text-xs text-muted-foreground"
              data-testid="parts-empty-info"
            >
              {emptyLines.map((line, i) => (
                <p key={i} className="flex items-start gap-1.5">
                  <HugeiconsIcon
                    icon={InformationCircleIcon}
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <span data-empty-line>{line}</span>
                </p>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn(
                'size-4 transition-transform',
                !open && '-rotate-90',
              )}
            />
            {t('quickParts.preview')}
          </button>
          {open && (
            <pre
              className="max-h-40 overflow-y-auto rounded bg-secondary/30 p-2 font-mono text-xs break-words whitespace-pre-wrap"
              data-testid="quick-parts-preview-text"
            >
              {loading ? (
                <span className="text-muted-foreground">
                  {t('common.loading')}
                </span>
              ) : (
                resolved?.prompt || (
                  <span className="text-muted-foreground">
                    {t('sceneParts.emptyPrompt')}
                  </span>
                )
              )}
            </pre>
          )}
        </div>
      )}
    </CharacterPartsView>
  )
}
