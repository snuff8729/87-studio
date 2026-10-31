import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import { usePendingSave } from './pending-saves'
import type { PresenceSetting } from '@/lib/scene-characters'
import { Segmented } from '@/components/common/segmented'
import { PromptEditorHeader } from '@/components/prompt-editor/prompt-editor-header'
import { LazyPromptEditor } from '@/components/quick-generate/lazy-prompt-editor'
import {
  appendTag,
  useTagGallery,
} from '@/components/tag-gallery/use-tag-gallery'
import { useBundleNames } from '@/lib/use-bundles'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { effectivePresence, parsePresenceSetting } from '@/lib/scene-characters'
import { setCharacterPresence } from '@/server/functions/project-scenes'

const SAVE_DELAY_MS = 800

export interface SceneCastCharacter {
  id: number
  name: string
  appearance?: string | null
}

export interface SceneCastOverride {
  characterId: number
  presence?: string | null
  replacePrompt?: string | null
  replaceNegative?: string | null
}

function useSectionOpen(projectId: number) {
  const storageKey = `87studio-scene-cast-open:${projectId}`
  const [open, setOpenState] = useState(true)
  useEffect(() => {
    try {
      setOpenState(localStorage.getItem(storageKey) !== '0')
    } catch {
      setOpenState(true)
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

interface TextDraft {
  prompt?: string
  negative?: string
}

/** Collapsible "Characters in this scene": presence + Replace text per character */
export function SceneCharactersSection({
  projectId,
  sceneId,
  characters,
  overrides,
  onChange,
}: {
  projectId: number
  sceneId: number
  characters: Array<SceneCastCharacter>
  overrides: Array<SceneCastOverride>
  /** After a save: reload the overrides */
  onChange: () => void
}) {
  const { t } = useTranslation()
  const bundleNames = useBundleNames()
  const tagGallery = useTagGallery()
  const [open, setOpen] = useSectionOpen(projectId)

  const serverById = useMemo(
    () => new Map(overrides.map((o) => [o.characterId, o])),
    [overrides],
  )

  // Optimistic presence until the reloaded overrides arrive
  const [presenceLocal, setPresenceLocal] = useState<
    Record<number, PresenceSetting>
  >({})
  useEffect(() => setPresenceLocal({}), [overrides])

  const [drafts, setDrafts] = useState<Record<number, TextDraft>>({})
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const pendingRef = useRef(new Set<number>())
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inFlightRef = useRef<Promise<void>>(Promise.resolve())
  const [negOpen, setNegOpen] = useState<Record<number, boolean>>({})

  const presenceOf = (id: number): PresenceSetting =>
    id in presenceLocal
      ? presenceLocal[id]
      : parsePresenceSetting(serverById.get(id)?.presence)
  const promptOf = (id: number) =>
    drafts[id]?.prompt ?? serverById.get(id)?.replacePrompt ?? ''
  const negativeOf = (id: number) =>
    drafts[id]?.negative ?? serverById.get(id)?.replaceNegative ?? ''

  async function save(ids: Array<number>) {
    try {
      for (const id of ids) {
        const d = draftsRef.current[id]
        if (!d) continue
        await setCharacterPresence({
          data: {
            sceneId,
            characterId: id,
            replacePrompt: d.prompt,
            replaceNegative: d.negative,
          },
        })
      }
      onChange()
    } catch {
      toast.error(t('sceneCast.saveFailed'))
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

  // Drop drafts that are saved (server data is current)
  useEffect(() => {
    setDrafts((prev) => {
      const ids = Object.keys(prev)
        .map(Number)
        .filter((id) => !pendingRef.current.has(id))
      if (ids.length === 0) return prev
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
  }, [overrides])

  function editText(id: number, patch: TextDraft) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
    pendingRef.current.add(id)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  async function setPresence(id: number, presence: PresenceSetting) {
    setPresenceLocal((prev) => ({ ...prev, [id]: presence }))
    try {
      await setCharacterPresence({
        data: { sceneId, characterId: id, presence },
      })
      onChange()
    } catch {
      setPresenceLocal((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      toast.error(t('sceneCast.saveFailed'))
    }
  }

  const effective = (c: SceneCastCharacter) =>
    effectivePresence(c.appearance, presenceOf(c.id))
  const presentCount = characters.filter((c) => effective(c) !== 'off').length
  const overrideCount = characters.filter(
    (c) => presenceOf(c.id) !== null,
  ).length
  const stateLabel = (p: 'on' | 'off' | 'replace') => t(`sceneCast.${p}`)

  return (
    <section className="flex shrink-0 flex-col border-b" data-scene-cast>
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
        {t('sceneCast.title')}
        <span className="tabular-nums text-muted-foreground/60">
          {presentCount}/{characters.length}
        </span>
        {overrideCount > 0 && (
          <span className="normal-case tracking-normal text-muted-foreground/60">
            {t('sceneCast.customized', { count: overrideCount })}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-4 sm:px-4">
          {characters.map((c, i) => {
            const setting = presenceOf(c.id)
            const eff = effective(c)
            return (
              <div
                key={c.id}
                data-scene-cast-row={c.id}
                data-presence={eff}
                className="space-y-2"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex min-w-0 max-w-[10rem] items-center gap-1.5 text-sm">
                    <span className="grid size-5 shrink-0 place-content-center rounded-full bg-secondary text-xs">
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        'truncate',
                        eff === 'off' && 'text-muted-foreground',
                      )}
                    >
                      {c.name || t('characters.unnamed')}
                    </span>
                  </span>
                  <Segmented
                    value={setting ?? 'default'}
                    label={c.name}
                    onChange={(v) =>
                      void setPresence(
                        c.id,
                        v === 'default' ? null : (v),
                      )
                    }
                    options={[
                      { value: 'default', label: t('sceneCast.default') },
                      { value: 'on', label: t('sceneCast.on') },
                      { value: 'off', label: t('sceneCast.off') },
                      { value: 'replace', label: t('sceneCast.replace') },
                    ]}
                  />
                  {setting === null && (
                    <span
                      className="text-xs text-muted-foreground"
                      data-cast-default-hint
                    >
                      {t('sceneCast.defaultResolves', {
                        value: stateLabel(eff),
                      })}
                    </span>
                  )}
                </div>
                {eff === 'replace' && (
                  <div
                    className="space-y-2 rounded-lg border border-border/60 p-2.5"
                    data-scene-cast-replace={c.id}
                  >
                    <p className="text-xs text-muted-foreground">
                      {t('sceneCast.replaceHint')}
                    </p>
                    <PromptEditorHeader
                      label={t('sceneCast.replacePrompt')}
                      uppercase
                      onOpenTagGallery={() =>
                        tagGallery.openFor((tag) =>
                          editText(c.id, {
                            prompt: appendTag(promptOf(c.id), tag),
                          }),
                        )
                      }
                    />
                    <LazyPromptEditor
                      value={promptOf(c.id)}
                      onChange={(v) => editText(c.id, { prompt: v })}
                      placeholder={t('sceneCast.replacePlaceholder')}
                      minHeight="3rem"
                      bundleNames={bundleNames}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNegOpen((p) => ({ ...p, [c.id]: !p[c.id] }))
                      }
                      aria-expanded={!!negOpen[c.id] || !!negativeOf(c.id)}
                      className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        className={cn(
                          'size-4 transition-transform',
                          !(negOpen[c.id] || negativeOf(c.id)) && '-rotate-90',
                        )}
                      />
                      {t('sceneCast.replaceNegative')}
                    </button>
                    {(negOpen[c.id] || !!negativeOf(c.id)) && (
                      <LazyPromptEditor
                        value={negativeOf(c.id)}
                        onChange={(v) => editText(c.id, { negative: v })}
                        placeholder={t('sceneCast.replaceNegativePlaceholder')}
                        minHeight="3rem"
                        bundleNames={bundleNames}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
