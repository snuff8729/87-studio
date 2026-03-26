import { memo, useMemo } from 'react'
import { PlaceholderEditor } from './placeholder-editor'
import {
  updateProjectScene,
  upsertCharacterOverride,
} from '@/server/functions/project-scenes'

interface CharacterOverrideData {
  characterId: number
  placeholders: string | null
}

interface CharacterPlaceholderKeyEntry {
  characterId: number
  characterName: string
  keys: Array<string>
}

interface ScenePlaceholderPanelProps {
  sceneId: number
  scenePlaceholders: Record<string, string>
  characterOverrides: Array<CharacterOverrideData>
  generalPlaceholderKeys: Array<string>
  characterPlaceholderKeys: Array<CharacterPlaceholderKeyEntry>
  characters: Array<{
    id: number
    name: string
    charPrompt: string
    charNegative: string
  }>
  onPlaceholdersChange?: () => void
  getPrompts?: () => { generalPrompt: string; negativePrompt: string }
}

export const ScenePlaceholderPanel = memo(function ScenePlaceholderPanel({
  sceneId,
  scenePlaceholders,
  characterOverrides,
  generalPlaceholderKeys,
  characterPlaceholderKeys,
  characters,
  onPlaceholdersChange,
  getPrompts,
}: ScenePlaceholderPanelProps) {
  // Parse character overrides for PlaceholderEditor
  const parsedCharOverrides = useMemo(() => {
    const result: Record<number, Record<string, string>> = {}
    for (const o of characterOverrides) {
      result[o.characterId] = JSON.parse(o.placeholders || '{}')
    }
    return result
  }, [characterOverrides])

  return (
    <div className="p-4">
      <PlaceholderEditor
        sceneId={sceneId}
        scenePlaceholders={scenePlaceholders}
        characterOverrides={parsedCharOverrides}
        generalPlaceholderKeys={generalPlaceholderKeys}
        characterPlaceholderKeys={characterPlaceholderKeys}
        characters={characters}
        onSaveGeneral={async (mergedJson) => {
          await updateProjectScene({
            data: { id: sceneId, placeholders: mergedJson },
          })
        }}
        onSaveCharOverride={async (charId, mergedJson) => {
          await upsertCharacterOverride({
            data: {
              projectSceneId: sceneId,
              characterId: charId,
              placeholders: mergedJson,
            },
          })
        }}
        onPlaceholdersChange={onPlaceholdersChange}
        getPrompts={getPrompts}
      />
    </div>
  )
})
