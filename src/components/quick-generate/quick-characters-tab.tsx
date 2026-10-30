import { useMemo } from 'react'
import type { CharacterEntry } from './types'
import type { CharacterPatch } from '@/components/characters/characters-editor'
import { CharactersEditor } from '@/components/characters/characters-editor'
import { AI_POSITION } from '@/lib/character-positions'

export function QuickCharactersTab({
  characters,
  addCharacter,
  duplicateCharacter,
  moveCharacter,
  removeCharacter,
  updateCharacter,
  positions,
}: {
  characters: Array<CharacterEntry>
  addCharacter: () => string
  duplicateCharacter: (id: string) => string | undefined
  moveCharacter: (id: string, direction: -1 | 1) => void
  removeCharacter: (id: string) => void
  updateCharacter: (id: string, patch: CharacterPatch) => void
  positions: { aspect: number } | false
}) {
  const items = useMemo(
    () =>
      characters.map((c) => ({ ...c, position: c.position ?? AI_POSITION })),
    [characters],
  )
  return (
    <CharactersEditor
      characters={items}
      positions={positions}
      onAdd={addCharacter}
      onUpdate={updateCharacter}
      onDuplicate={duplicateCharacter}
      onMove={moveCharacter}
      onDelete={removeCharacter}
    />
  )
}
