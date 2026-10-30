import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { usePendingSave } from './pending-saves'
import type { PositionSpec, ScenePositionSpec } from '@/lib/character-positions'
import {
  PositionStage,
  formatPoint,
  usePositionSnap,
} from '@/components/characters/position-stage'
import { Segmented } from '@/components/common/segmented'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  AI_POSITION,
  applyOverride,
  cellLabel,
  parsePositionSpec,
} from '@/lib/character-positions'
import { setCharacterPositionOverride } from '@/server/functions/project-scenes'

const SAVE_DELAY_MS = 600

export interface ScenePositionCharacter {
  id: number
  name: string
  /** Stored JSON (NULL = ai) */
  position: string | null
}

export interface ScenePositionOverride {
  characterId: number
  /** Stored JSON (NULL = inherit) */
  position: string | null
}

function useSectionOpen(projectId: number) {
  const storageKey = `87studio-scene-positions-open:${projectId}`
  const [open, setOpenState] = useState(false)
  useEffect(() => {
    try {
      setOpenState(localStorage.getItem(storageKey) === '1')
    } catch {
      setOpenState(false)
    }
  }, [storageKey])
  const setOpen = useCallback(
    (value: boolean) => {
      setOpenState(value)
      try {
        localStorage.setItem(storageKey, value ? '1' : '0')
      } catch {
        // ignore
      }
    },
    [storageKey],
  )
  return [open, setOpen] as const
}

/** "Fixed C3", "Random", "AI" */
export function useSpecLabel() {
  const { t } = useTranslation()
  return (spec: PositionSpec) =>
    spec.mode === 'fixed'
      ? `${t('positions.fixed')} ${cellLabel(spec.x ?? 0.5, spec.y ?? 0.5)}`
      : spec.mode === 'random'
        ? t('positions.random')
        : t('positions.ai')
}

/** Collapsible per-scene override of the character positions */
export function ScenePositionsSection({
  projectId,
  sceneId,
  characters,
  overrides,
  aspect,
  onChange,
}: {
  projectId: number
  sceneId: number
  characters: Array<ScenePositionCharacter>
  overrides: Array<ScenePositionOverride>
  aspect: number
  /** After a save: reload the overrides */
  onChange: () => void
}) {
  const { t } = useTranslation()
  const specLabel = useSpecLabel()
  const [open, setOpen] = useSectionOpen(projectId)
  const [snap, setSnap] = usePositionSnap()

  const serverSpecs = useMemo(() => {
    const m = new Map<number, ScenePositionSpec>()
    for (const o of overrides) {
      m.set(
        o.characterId,
        parsePositionSpec(o.position, true) ?? { mode: 'inherit' },
      )
    }
    return m
  }, [overrides])

  const [local, setLocal] = useState<Record<number, ScenePositionSpec>>({})
  const localRef = useRef(local)
  localRef.current = local
  const pendingRef = useRef(new Set<number>())
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inFlightRef = useRef<Promise<void>>(Promise.resolve())
  const [activeId, setActiveId] = useState<number | null>(null)

  const specOf = (id: number): ScenePositionSpec =>
    local[id] ?? serverSpecs.get(id) ?? { mode: 'inherit' }

  const defaultOf = (c: ScenePositionCharacter): PositionSpec =>
    parsePositionSpec(c.position) ?? AI_POSITION

  async function save(ids: Array<number>) {
    try {
      for (const id of ids) {
        const spec = localRef.current[id]
        if (!spec) continue
        await setCharacterPositionOverride({
          data: {
            projectSceneIds: [sceneId],
            characterId: id,
            position: spec.mode === 'inherit' ? null : spec,
          },
        })
      }
      onChange()
    } catch {
      toast.error(t('positions.saveFailed'))
      for (const id of ids) pendingRef.current.add(id)
    }
  }
  const saveRef = useRef(save)
  saveRef.current = save

  const flush = useCallback((): Promise<void> => {
    clearTimeout(timerRef.current)
    timerRef.current = undefined
    const ids = [...pendingRef.current]
    pendingRef.current.clear()
    if (ids.length === 0) return inFlightRef.current
    const run = saveRef.current(ids)
    inFlightRef.current = Promise.all([inFlightRef.current, run]).then(() => {})
    return run
  }, [])

  // Scene deletion discards via discard('scene:<id>') without a stray save
  usePendingSave({
    flush,
    key: `scene:${sceneId}`,
    discard: () => {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
      pendingRef.current.clear()
    },
  })

  useEffect(() => {
    return () => {
      void flush()
    }
  }, [flush])

  // Drop local copies that are not waiting for a save (server data is current)
  useEffect(() => {
    setLocal((prev) => {
      const ids = Object.keys(prev)
        .map(Number)
        .filter((id) => !pendingRef.current.has(id))
      if (ids.length === 0) return prev
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
  }, [serverSpecs])

  function update(id: number, spec: ScenePositionSpec) {
    const next = { ...localRef.current, [id]: spec }
    localRef.current = next
    setLocal(next)
    pendingRef.current.add(id)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  function setMode(c: ScenePositionCharacter, mode: ScenePositionSpec['mode']) {
    if (mode === 'fixed') {
      const prev = specOf(c.id)
      const base: ScenePositionSpec =
        prev.mode === 'fixed' ? prev : defaultOf(c)
      update(c.id, {
        mode: 'fixed',
        x: base.mode === 'fixed' ? (base.x ?? 0.5) : 0.5,
        y: base.mode === 'fixed' ? (base.y ?? 0.5) : 0.5,
      })
      setActiveId(c.id)
    } else {
      update(c.id, { mode })
    }
  }

  const effective = (c: ScenePositionCharacter): PositionSpec =>
    applyOverride(defaultOf(c), specOf(c.id))

  const dots = characters.flatMap((c, i) => {
    const eff = effective(c)
    if (eff.mode !== 'fixed') return []
    return [
      {
        id: c.id,
        index: i + 1,
        name: c.name,
        x: eff.x ?? 0.5,
        y: eff.y ?? 0.5,
        draggable: specOf(c.id).mode === 'fixed',
      },
    ]
  })
  const active =
    dots.find((d) => d.id === activeId && d.draggable) ??
    dots.find((d) => d.draggable)

  const overrideCount = characters.filter(
    (c) => specOf(c.id).mode !== 'inherit',
  ).length

  return (
    <section className="flex shrink-0 flex-col border-b" data-scene-positions>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn('size-4 transition-transform', !open && '-rotate-90')}
        />
        {t('positions.sceneTitle')}
        {overrideCount > 0 && (
          <span className="tabular-nums text-muted-foreground/60">
            {overrideCount}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-4 sm:px-4">
          <div className="space-y-2">
            {characters.map((c, i) => {
              const spec = specOf(c.id)
              return (
                <div
                  key={c.id}
                  data-scene-position-row={c.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className="flex min-w-0 max-w-[10rem] items-center gap-1.5 text-sm"
                  >
                    <span className="grid size-5 shrink-0 place-content-center rounded-full bg-secondary text-xs">
                      {i + 1}
                    </span>
                    <span className="truncate">
                      {c.name || t('characters.unnamed')}
                    </span>
                  </button>
                  <Segmented
                    value={spec.mode}
                    label={c.name}
                    onChange={(mode) => setMode(c, mode)}
                    options={[
                      { value: 'inherit', label: t('positions.default') },
                      { value: 'ai', label: t('positions.ai') },
                      { value: 'random', label: t('positions.random') },
                      { value: 'fixed', label: t('positions.fixed') },
                    ]}
                  />
                  {spec.mode === 'inherit' && (
                    <span
                      className="text-xs text-muted-foreground"
                      data-position-default-hint
                    >
                      {t('positions.defaultResolves', {
                        value: specLabel(defaultOf(c)),
                      })}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {dots.length > 0 && (
            <div className="space-y-2">
              <PositionStage
                aspect={aspect}
                dots={dots}
                activeId={active?.id}
                snap={snap}
                onActivate={(id) => setActiveId(Number(id))}
                onMove={(id, x, y) =>
                  update(Number(id), { mode: 'fixed', x, y })
                }
              />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span data-position-label>
                  {active
                    ? `${active.index} · ${formatPoint(active.x, active.y)}`
                    : ''}
                </span>
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={snap}
                    onCheckedChange={(v) => setSnap(v === true)}
                  />
                  {t('positions.snap')}
                </label>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
