import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { usePendingSave } from './pending-saves'
import {
  CharacterPartsPanel,
  PartsPromptHint,
  slotHasParts,
} from './character-parts-panel'
import type { CharacterPatch } from '@/components/characters/characters-editor'
import type { PositionSpec } from '@/lib/character-positions'
import { CharactersEditor } from '@/components/characters/characters-editor'
import { duplicateName, nextCharacterName } from '@/lib/characters'
import { useTranslation } from '@/lib/i18n'
import { AI_POSITION, parsePositionSpec } from '@/lib/character-positions'
import {
  createCharacter,
  deleteCharacter,
  duplicateCharacter,
  moveCharacter,
  updateCharacter,
} from '@/server/functions/characters'

interface ProjectCharacter {
  id: number
  name: string
  charPrompt: string
  charNegative: string
  slotIndex: number | null
  libraryCharacterId: number | null
  outfitItemIds: string | null
  axisValues: string | null
  /** Stored JSON PositionSpec (NULL = ai) */
  position: string | null
}

interface Draft {
  name: string
  prompt: string
  negative: string
  position: PositionSpec
}

const SAVE_DELAY_MS = 1000

/**
 * Workspace Chars tab: edits are kept as local drafts and saved debounced
 * (flushed by Generate through the pending-saves registry).
 */
export function CharactersPanel({
  projectId,
  characters,
  positions,
}: {
  projectId: number
  characters: Array<ProjectCharacter>
  positions: { aspect: number } | false
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const [drafts, setDrafts] = useState<Record<number, Draft | undefined>>({})
  const draftsRef = useRef(drafts)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingIdRef = useRef<number | null>(null)
  const inFlightRef = useRef<Promise<void>>(Promise.resolve())
  const charactersRef = useRef(characters)
  charactersRef.current = characters

  function setDraftsNow(next: Record<number, Draft | undefined>) {
    draftsRef.current = next
    setDrafts(next)
  }

  function dropDraft(id: number) {
    if (!(id in draftsRef.current)) return
    const rest = { ...draftsRef.current }
    delete rest[id]
    setDraftsNow(rest)
  }

  async function save(id: number, draft: Draft) {
    try {
      await updateCharacter({
        data: {
          id,
          // An empty name would leave an unlabeled chip: keep the stored one
          ...(draft.name.trim() ? { name: draft.name } : {}),
          charPrompt: draft.prompt,
          charNegative: draft.negative,
          position: draft.position,
        },
      })
      await router.invalidate()
      // Keep the draft when it changed again while this save was running,
      // or while the name is blank (restored on blur instead)
      if (
        draftsRef.current[id] === draft &&
        pendingIdRef.current !== id &&
        draft.name.trim()
      ) {
        dropDraft(id)
      }
    } catch {
      toast.error(t('workspace.characterSaveFailed'))
      // Let the next flush (Generate) retry this edit
      if (pendingIdRef.current === null && draftsRef.current[id]) {
        pendingIdRef.current = id
      }
    }
  }

  function flush(): Promise<void> {
    clearTimeout(timerRef.current)
    timerRef.current = undefined
    const id = pendingIdRef.current
    pendingIdRef.current = null
    if (id === null) return inFlightRef.current
    const draft = draftsRef.current[id]
    if (!draft) return inFlightRef.current
    const run = save(id, draft)
    inFlightRef.current = Promise.all([inFlightRef.current, run]).then(() => {})
    return run
  }

  usePendingSave({ flush })

  // Unmount: save a pending edit instead of dropping it
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => {
    return () => {
      void flushRef.current()
    }
  }, [])

  function handleUpdate(id: number, patch: CharacterPatch) {
    // Another character's pending edit is saved before switching targets
    if (pendingIdRef.current !== null && pendingIdRef.current !== id) {
      void flush()
    }
    const base =
      draftsRef.current[id] ??
      (() => {
        const c = charactersRef.current.find((ch) => ch.id === id)
        return c
          ? {
              name: c.name,
              prompt: c.charPrompt,
              negative: c.charNegative,
              position: parsePositionSpec(c.position) ?? AI_POSITION,
            }
          : null
      })()
    if (!base) return
    setDraftsNow({
      ...draftsRef.current,
      [id]: {
        name: patch.name ?? base.name,
        prompt: patch.prompt ?? base.prompt,
        negative: patch.negative ?? base.negative,
        position: patch.position ?? base.position,
      },
    })
    pendingIdRef.current = id
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
  }

  /** Blank names fall back to the stored one once the field loses focus. */
  function handleNameBlur(id: number) {
    const draft = draftsRef.current[id]
    if (!draft || draft.name.trim()) return
    const stored = charactersRef.current.find((c) => c.id === id)
    if (stored) handleUpdate(id, { name: stored.name })
  }

  async function handleAdd() {
    try {
      await flush()
      const result = await createCharacter({
        data: {
          projectId,
          name: nextCharacterName(characters.map((c) => c.name)),
        },
      })
      void router.invalidate()
      return result.id
    } catch {
      toast.error(t('workspace.addCharacterFailed'))
      return undefined
    }
  }

  async function handleDuplicate(id: number) {
    const source = characters.find((c) => c.id === id)
    if (!source) return undefined
    try {
      await flush()
      const draftName = draftsRef.current[id]?.name
      const copy = await duplicateCharacter({
        data: {
          id,
          name: duplicateName(
            draftName?.trim() || source.name,
            characters.map((c) => c.name),
          ),
        },
      })
      void router.invalidate()
      return copy.id
    } catch {
      toast.error(t('workspace.addCharacterFailed'))
      return undefined
    }
  }

  async function handleMove(id: number, direction: -1 | 1) {
    try {
      await flush()
      await moveCharacter({ data: { id, direction } })
      await router.invalidate()
    } catch {
      toast.error(t('workspace.characterSaveFailed'))
    }
  }

  async function handleDelete(id: number) {
    const name = characters.find((c) => c.id === id)?.name ?? ''
    // A pending edit of the deleted character must not be saved afterwards
    if (pendingIdRef.current === id) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
      pendingIdRef.current = null
    }
    dropDraft(id)
    try {
      await deleteCharacter({ data: id })
      toast.success(t('workspace.characterDeleted', { name }))
      await router.invalidate()
    } catch {
      toast.error(t('workspace.deleteCharacterFailed'))
    }
  }

  const items = useMemo(
    () =>
      characters.map((c) => {
        const d = drafts[c.id]
        return {
          id: c.id,
          name: d?.name ?? c.name,
          prompt: d?.prompt ?? c.charPrompt,
          negative: d?.negative ?? c.charNegative,
          position: d?.position ?? parsePositionSpec(c.position) ?? AI_POSITION,
        }
      }),
    [characters, drafts],
  )

  return (
    <CharactersEditor
      characters={items}
      onAdd={handleAdd}
      onUpdate={handleUpdate}
      onNameBlur={handleNameBlur}
      onDuplicate={handleDuplicate}
      onMove={handleMove}
      onDelete={handleDelete}
      slots
      renderParts={(c) => {
        const slot = characters.find((x) => x.id === c.id)
        return slot ? (
          <CharacterPartsPanel
            projectId={projectId}
            slotId={slot.id}
            slotName={c.name}
            slot={slot}
          />
        ) : null
      }}
      renderPromptHint={(c) => {
        const slot = characters.find((x) => x.id === c.id)
        return slot && slotHasParts(slot) ? <PartsPromptHint /> : null
      }}
      positions={positions}
    />
  )
}
