import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { ToggleGroup } from 'radix-ui'
import { usePendingSave } from './pending-saves'
import type { AxisValues, PartsAxis } from '@/lib/character-parts'
import {
  parseAxisValues,
  parseIdList,
  relevantAxes,
} from '@/lib/character-parts'
import { AxisSegmented } from '@/components/parts/axis-segmented'
import {
  CoveredBadge,
  OutfitItemsEditor,
} from '@/components/parts/outfit-items-editor'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { getLibrary } from '@/server/functions/library'
import { previewPrompts } from '@/server/functions/generation'
import {
  updateCharacterOverrideParts,
  updateSceneParts,
} from '@/server/functions/project-scenes'

export interface ScenePartsSlot {
  id: number
  name: string
  libraryCharacterId?: number | null
  /** Raw JSON string */
  outfitItemIds?: string | null
  /** Raw JSON string (local-axis defaults) */
  axisValues?: string | null
}

export interface ScenePartsOverride {
  characterId: number
  axisValues?: string | null
  /** Raw JSON string; null = slot default */
  outfitItemIds?: string | null
}

interface OverrideState {
  axisValues: AxisValues
  outfitItemIds: Array<number> | null
}

const DEBOUNCE_MS = 800

/** Whether a slot uses the parts system at all. */
export function slotHasParts(slot: ScenePartsSlot): boolean {
  return (
    slot.libraryCharacterId != null ||
    parseIdList(slot.outfitItemIds ?? '[]').length > 0
  )
}

function parseOverride(o: ScenePartsOverride | undefined): OverrideState {
  let outfit: Array<number> | null = null
  if (o && o.outfitItemIds != null) outfit = parseIdList(o.outfitItemIds)
  return {
    axisValues: parseAxisValues(o?.axisValues ?? '{}'),
    outfitItemIds: outfit,
  }
}

function valueName(axis: PartsAxis, id: number | undefined) {
  return axis.values.find((v) => v.id === id)?.name
}

export function ScenePartsSection({
  projectId,
  sceneId,
  sceneAxisValues,
  slots,
  overrides,
  onSaved,
}: {
  projectId: number
  sceneId: number
  /** Raw JSON from project_scenes.axis_values */
  sceneAxisValues: string | null | undefined
  /** Only slots that use parts */
  slots: Array<ScenePartsSlot>
  overrides: Array<ScenePartsOverride>
  /** Called after every completed save (route reloads workspace data) */
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const library = useQuery({
    queryKey: ['library', projectId],
    queryFn: () => getLibrary({ data: { projectId } }),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
  })
  const axes = library.data?.axes
  const globalAxes = useMemo(
    () =>
      (axes ?? []).filter(
        (a) => a.ownerCharacterId === null && a.ownerItemId === null,
      ),
    [axes],
  )

  // ── Local, authoritative-while-editing state ──
  const [sceneAxes, setSceneAxes] = useState<AxisValues>(() =>
    parseAxisValues(sceneAxisValues ?? '{}'),
  )
  const [ov, setOv] = useState<Record<number, OverrideState>>(() => {
    const out: Record<number, OverrideState> = {}
    for (const o of overrides) out[o.characterId] = parseOverride(o)
    return out
  })
  const sceneAxesRef = useRef(sceneAxes)
  const ovRef = useRef(ov)
  const dirtySceneRef = useRef(false)
  const dirtyCharsRef = useRef(new Set<number>())
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inFlightRef = useRef<Promise<void>>(Promise.resolve())
  const pendingCountRef = useRef(0)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const [version, setVersion] = useState(0)

  // Resync from server props when nothing local is pending
  const propsKey = JSON.stringify([
    sceneAxisValues ?? '{}',
    overrides.map((o) => [o.characterId, o.axisValues, o.outfitItemIds]),
  ])
  useEffect(() => {
    if (
      dirtySceneRef.current ||
      dirtyCharsRef.current.size > 0 ||
      pendingCountRef.current > 0
    ) {
      return
    }
    const nextScene = parseAxisValues(sceneAxisValues ?? '{}')
    const nextOv: Record<number, OverrideState> = {}
    for (const o of overrides) nextOv[o.characterId] = parseOverride(o)
    sceneAxesRef.current = nextScene
    ovRef.current = nextOv
    setSceneAxes(nextScene)
    setOv(nextOv)
  }, [propsKey])

  const flush = useCallback((): Promise<void> => {
    clearTimeout(timerRef.current)
    timerRef.current = undefined
    const saves: Array<Promise<unknown>> = []
    const sentScene = dirtySceneRef.current
    const sentChars = [...dirtyCharsRef.current]
    if (dirtySceneRef.current) {
      dirtySceneRef.current = false
      saves.push(
        updateSceneParts({
          data: { sceneId, axisValues: sceneAxesRef.current },
        }),
      )
    }
    for (const characterId of dirtyCharsRef.current) {
      const state = ovRef.current[characterId]
      saves.push(
        updateCharacterOverrideParts({
          data: {
            sceneId,
            characterId,
            axisValues: state.axisValues,
            outfitItemIds: state.outfitItemIds,
          },
        }),
      )
    }
    dirtyCharsRef.current = new Set()
    if (saves.length === 0) return inFlightRef.current
    pendingCountRef.current += 1
    const done = Promise.all(saves)
      .then(() => {
        setVersion((v) => v + 1)
        onSavedRef.current()
      })
      .catch(() => {
        toast.error(t('sceneParts.failedToSave'))
        // Keep the UI value and let the next flush (Generate) retry
        if (sentScene) dirtySceneRef.current = true
        for (const id of sentChars) dirtyCharsRef.current.add(id)
      })
      .finally(() => {
        pendingCountRef.current -= 1
      })
    inFlightRef.current = Promise.all([inFlightRef.current, done]).then(
      () => undefined,
    )
    return done
  }, [sceneId, t])

  const flushRef = useRef(flush)
  flushRef.current = flush

  usePendingSave({
    key: `scene:${sceneId}`,
    flush: () => flushRef.current().then(() => inFlightRef.current),
    discard: () => {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
      dirtySceneRef.current = false
      dirtyCharsRef.current = new Set()
    },
  })

  // Scene switch / unmount (the section is keyed by scene)
  useEffect(
    () => () => {
      void flushRef.current()
    },
    [],
  )

  function schedule() {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS)
  }

  function setSceneAxis(axisId: number, valueId: number | null) {
    if (valueId === null) return
    const next = { ...sceneAxesRef.current, [String(axisId)]: valueId }
    sceneAxesRef.current = next
    dirtySceneRef.current = true
    setSceneAxes(next)
    schedule()
  }

  function updateOverride(
    characterId: number,
    fn: (cur: OverrideState) => OverrideState,
  ) {
    const cur = ovRef.current[characterId] ?? {
      axisValues: {},
      outfitItemIds: null,
    }
    const next = { ...ovRef.current, [characterId]: fn(cur) }
    ovRef.current = next
    dirtyCharsRef.current.add(characterId)
    setOv(next)
    schedule()
  }

  // ── Preview ──
  const [previewOpen, setPreviewOpen] = useState(false)
  // Refetch when item areas / cover rules / areas change in the library
  const libraryKey = JSON.stringify([
    library.data?.areas.map((a) => a.id),
    library.data?.items.map((i) => [i.id, i.areaIds, i.coverRules]),
    // Chars tab edits: library character / default outfit / axis defaults
    slots.map((s) => [
      s.id,
      s.libraryCharacterId,
      s.outfitItemIds,
      s.axisValues,
    ]),
  ])
  const preview = useQuery({
    queryKey: ['scene-preview', projectId, sceneId, version, libraryKey],
    queryFn: () =>
      previewPrompts({ data: { projectId, projectSceneId: sceneId } }),
    // Also drives the "Covered" chips in the character rows
    enabled: !!axes,
    placeholderData: (prev) => prev,
  })

  if (!axes) return null

  const items = library.data?.items ?? []
  const presets = library.data?.presets ?? []
  const hiddenBySlot = new Map(
    (preview.data?.characterPrompts ?? []).map((c) => [
      c.characterId,
      c.hiddenItems ?? [],
    ]),
  )

  return (
    <div className="space-y-3" data-testid="scene-parts">
      {/* Scene row */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">
          {t('sceneParts.sceneContext')}
        </div>
        {globalAxes.map((axis) => (
          <AxisSegmented
            key={axis.id}
            axis={axis}
            value={sceneAxes[String(axis.id)] ?? axis.values[0]?.id ?? null}
            onChange={(v) => setSceneAxis(axis.id, v)}
            defaultBadge
          />
        ))}
      </div>

      {/* Characters */}
      <div className="space-y-1.5">
        {slots.map((slot) => (
          <CharacterRow
            key={slot.id}
            slot={slot}
            state={ov[slot.id]}
            axes={axes}
            globalAxes={globalAxes}
            items={items}
            presets={presets}
            hidden={hiddenBySlot.get(slot.id)}
            projectId={projectId}
            onAxis={(axisId, v) =>
              updateOverride(slot.id, (cur) => {
                const nextAxes = { ...cur.axisValues }
                if (v === null) delete nextAxes[String(axisId)]
                else nextAxes[String(axisId)] = v
                return { ...cur, axisValues: nextAxes }
              })
            }
            onOutfit={(ids) =>
              updateOverride(slot.id, (cur) => ({ ...cur, outfitItemIds: ids }))
            }
            onReset={() =>
              updateOverride(slot.id, () => ({
                axisValues: {},
                outfitItemIds: null,
              }))
            }
          />
        ))}
      </div>

      {/* Final prompt preview */}
      <div className="rounded-md border border-border/60">
        <button
          type="button"
          onClick={() => setPreviewOpen((o) => !o)}
          aria-expanded={previewOpen}
          className="flex h-8 w-full items-center gap-1.5 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              'size-4 transition-transform',
              !previewOpen && '-rotate-90',
            )}
          />
          {t('sceneParts.preview')}
        </button>
        {previewOpen && (
          <div
            className="space-y-2 border-t border-border/60 p-2.5"
            data-testid="parts-preview"
          >
            {!preview.data ? (
              <p className="text-xs text-muted-foreground">
                {t('common.loading')}
              </p>
            ) : (
              <>
                <PreviewBlock
                  label={t('sceneParts.generalPrompt')}
                  text={preview.data.generalPrompt}
                />
                {preview.data.characterPrompts.map((c) => (
                  <PreviewBlock
                    key={c.characterId}
                    label={c.name}
                    text={c.prompt}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewBlock({ label, text }: { label: string; text: string }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-40 overflow-y-auto rounded bg-secondary/30 p-2 font-mono text-xs break-words whitespace-pre-wrap">
        {text || (
          <span className="text-muted-foreground">
            {t('sceneParts.emptyPrompt')}
          </span>
        )}
      </pre>
    </div>
  )
}

function CharacterRow({
  slot,
  state,
  axes,
  globalAxes,
  items,
  presets,
  hidden,
  projectId,
  onAxis,
  onOutfit,
  onReset,
}: {
  slot: ScenePartsSlot
  state: OverrideState | undefined
  axes: Array<PartsAxis>
  globalAxes: Array<PartsAxis>
  items: Array<{ id: number; name: string; projectId: number | null }>
  presets: Array<{ id: number; name: string; itemIds: Array<number> }>
  /** Items hidden by occlusion for this character in this scene */
  hidden: Array<{ itemId: number; coveredBy: Array<number> }> | undefined
  projectId: number
  onAxis: (axisId: number, v: number | null) => void
  onOutfit: (ids: Array<number> | null) => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const cur: OverrideState = state ?? { axisValues: {}, outfitItemIds: null }
  const slotOutfit = parseIdList(slot.outfitItemIds ?? '[]')
  const effectiveOutfit = cur.outfitItemIds ?? slotOutfit
  const localAxes = relevantAxes(
    axes,
    slot.libraryCharacterId ?? null,
    effectiveOutfit,
  ).filter((a) => a.ownerCharacterId !== null || a.ownerItemId !== null)

  const parts: Array<string> = []
  for (const axis of [...globalAxes, ...localAxes]) {
    const name = valueName(axis, cur.axisValues[String(axis.id)])
    if (name) parts.push(`${axis.name}: ${name}`)
  }
  const summary =
    (parts.length > 0 ? parts.join(' · ') : t('sceneParts.followsScene')) +
    ' · ' +
    (cur.outfitItemIds
      ? t('sceneParts.outfitReplaced')
      : t('sceneParts.defaultOutfit'))
  const modified = parts.length > 0 || cur.outfitItemIds !== null
  const covered: Record<number, string> = {}
  for (const h of hidden ?? []) {
    const names = h.coveredBy
      .map((id) => items.find((i) => i.id === id)?.name)
      .filter(Boolean)
    covered[h.itemId] = names.join(', ')
  }

  return (
    <div
      className="rounded-md border border-border/60"
      data-testid="parts-character"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-9 w-full items-center gap-1.5 px-2.5 py-1 text-left"
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90',
          )}
        />
        <span className="shrink-0 text-sm font-medium">{slot.name}</span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-xs',
            modified ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {summary}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/60 p-2.5">
          {globalAxes.map((axis) => (
            <AxisSegmented
              key={axis.id}
              axis={axis}
              value={cur.axisValues[String(axis.id)] ?? null}
              onChange={(v) => onAxis(axis.id, v)}
              inheritLabel={t('parts.inheritScene')}
            />
          ))}
          {localAxes.map((axis) => (
            <AxisSegmented
              key={axis.id}
              axis={axis}
              value={cur.axisValues[String(axis.id)] ?? null}
              onChange={(v) => onAxis(axis.id, v)}
              inheritLabel={t('parts.inheritDefault')}
            />
          ))}

          <div className="space-y-1.5">
            <ToggleGroup.Root
              type="single"
              value={cur.outfitItemIds ? 'replace' : 'default'}
              onValueChange={(v) => {
                if (v === 'replace') onOutfit([...slotOutfit])
                else if (v === 'default') onOutfit(null)
              }}
              aria-label={t('sceneParts.outfit')}
              className="inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-input/30 p-0.5"
            >
              {(['default', 'replace'] as const).map((m) => (
                <ToggleGroup.Item
                  key={m}
                  value={m}
                  className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
                >
                  {m === 'default'
                    ? t('sceneParts.defaultOutfit')
                    : t('sceneParts.replaceOutfit')}
                </ToggleGroup.Item>
              ))}
            </ToggleGroup.Root>
            {cur.outfitItemIds ? (
              <OutfitItemsEditor
                itemIds={cur.outfitItemIds}
                onChange={(ids) => onOutfit(ids)}
                items={items}
                presets={presets}
                projectId={projectId}
                covered={covered}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                {slotOutfit.length === 0 && t('parts.emptyOutfit')}
                {slotOutfit.map((id, i) => {
                  const item = items.find((x) => x.id === id)
                  if (!item) return null
                  return (
                    <span
                      key={`${id}-${i}`}
                      className="inline-flex items-center"
                    >
                      <span
                        className={cn(
                          covered[id] !== undefined && 'opacity-50',
                        )}
                        data-covered={
                          covered[id] !== undefined ? '' : undefined
                        }
                      >
                        {item.name}
                        {i < slotOutfit.length - 1 && covered[id] === undefined
                          ? ','
                          : ''}
                      </span>
                      {covered[id] !== undefined && (
                        <CoveredBadge by={covered[id]} />
                      )}
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="xs"
            disabled={!modified}
            onClick={onReset}
          >
            {t('sceneParts.reset')}
          </Button>
        </div>
      )}
    </div>
  )
}
