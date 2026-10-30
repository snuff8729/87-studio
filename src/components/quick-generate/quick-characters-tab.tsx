import type { CharacterEntry } from './types'
import type { CharacterPatch } from '@/components/characters/characters-editor'
import { CharactersEditor } from '@/components/characters/characters-editor'

export function QuickCharactersTab({
  characters,
  addCharacter,
  duplicateCharacter,
  moveCharacter,
  removeCharacter,
  updateCharacter,
}: {
  characters: Array<CharacterEntry>
  addCharacter: () => string
  duplicateCharacter: (id: string) => string | undefined
  moveCharacter: (id: string, direction: -1 | 1) => void
  removeCharacter: (id: string) => void
  updateCharacter: (id: string, patch: CharacterPatch) => void
}) {
  return (
    <CharactersEditor
      characters={characters}
      onAdd={addCharacter}
      onUpdate={updateCharacter}
      onDuplicate={duplicateCharacter}
      onMove={moveCharacter}
      onDelete={removeCharacter}
    />
  )
}
