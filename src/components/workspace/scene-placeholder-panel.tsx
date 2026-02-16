import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  TextIcon,
  ArrowDown01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { extractPlaceholders, resolvePlaceholders } from '@/lib/placeholder'
import {
  updateProjectScene,
  upsertCharacterOverride,
} from '@/server/functions/project-scenes'

interface CharacterData {
  id: number
  name: string
  charPrompt: string
  charNegative: string
}

interface CharacterOverrideData {
  characterId: number
  placeholders: string | null
}

interface ScenePlaceholderPanelProps {
  sceneId: number
  scenePlaceholders: Record<string, string>
  characterOverrides: CharacterOverrideData[]
  generalPrompt: string
  negativePrompt: string
  characters: CharacterData[]
  onPlaceholdersChange?: () => void
}

export function ScenePlaceholderPanel({
  sceneId,
  scenePlaceholders,
  characterOverrides,
  generalPrompt,
  negativePrompt,
  characters,
  onPlaceholdersChange,
}: ScenePlaceholderPanelProps) {
  // Collapsed state for character sections
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set())
  const [previewOpen, setPreviewOpen] = useState(false)

  function toggleSection(charId: number) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(charId)) next.delete(charId)
      else next.add(charId)
      return next
    })
  }

  // Placeholder keys from prompts
  const generalPlaceholderKeys = useMemo(
    () => [...new Set([
      ...extractPlaceholders(generalPrompt),
      ...extractPlaceholders(negativePrompt),
    ])],
    [generalPrompt, negativePrompt],
  )

  const characterPlaceholderKeys = useMemo(
    () =>
      characters.map((char) => ({
        characterId: char.id,
        characterName: char.name,
        keys: [...new Set([
          ...extractPlaceholders(char.charPrompt),
          ...extractPlaceholders(char.charNegative),
        ])],
      })),
    [characters],
  )

  // ── Local editing state with debounced save ──
  const [localValues, setLocalValues] = useState<Record<string, string>>({})
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Reset local values when scene changes
  useEffect(() => {
    setLocalValues({})
  }, [sceneId])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  function cellKey(context: 'general' | number, placeholder: string) {
    return context === 'general'
      ? `g:${placeholder}`
      : `c:${context}:${placeholder}`
  }

  function getCellValue(key: string, context: 'general' | number): string {
    const ck = cellKey(context, key)
    if (ck in localValues) return localValues[ck]

    if (context === 'general') {
      return scenePlaceholders[key] ?? ''
    }

    const override = characterOverrides.find((o) => o.characterId === context)
    if (override) {
      const parsed = JSON.parse(override.placeholders || '{}')
      return parsed[key] ?? ''
    }
    return ''
  }

  function handleCellChange(context: 'general' | number, key: string, value: string) {
    setLocalValues((prev) => ({ ...prev, [cellKey(context, key)]: value }))
    scheduleSave()
  }

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => flushSave(), 800)
  }

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    setLocalValues((currentLocal) => {
      if (Object.keys(currentLocal).length === 0) return currentLocal

      const generalChanges: Record<string, string> = {}
      const charChanges = new Map<number, Record<string, string>>()

      for (const [k, v] of Object.entries(currentLocal)) {
        const parts = k.split(':')
        if (parts[0] === 'g') {
          generalChanges[parts[1]] = v
        } else {
          const charId = Number(parts[1])
          const placeholder = parts[2]
          if (!charChanges.has(charId)) charChanges.set(charId, {})
          charChanges.get(charId)![placeholder] = v
        }
      }

      if (Object.keys(generalChanges).length > 0) {
        const merged = { ...scenePlaceholders, ...generalChanges }
        updateProjectScene({ data: { id: sceneId, placeholders: JSON.stringify(merged) } })
          .then(() => onPlaceholdersChange?.())
          .catch(() => toast.error('Failed to save'))
      }

      for (const [charId, changes] of charChanges) {
        const existing = characterOverrides.find((o) => o.characterId === charId)
        const existingParsed = existing ? JSON.parse(existing.placeholders || '{}') : {}
        upsertCharacterOverride({
          data: {
            projectSceneId: sceneId,
            characterId: charId,
            placeholders: JSON.stringify({ ...existingParsed, ...changes }),
          },
        })
          .then(() => onPlaceholdersChange?.())
          .catch(() => toast.error('Failed to save override'))
      }

      return {}
    })
  }, [sceneId, scenePlaceholders, characterOverrides, onPlaceholdersChange])

  // Stored keys (from scene data, possibly including template-defined extras)
  const storedGeneralKeys = Object.keys(scenePlaceholders)
  const storedCharKeys = characters.map((char) => {
    const override = characterOverrides.find((o) => o.characterId === char.id)
    const parsed = override ? JSON.parse(override.placeholders || '{}') as Record<string, string> : {}
    return { characterId: char.id, characterName: char.name, keys: Object.keys(parsed) }
  })

  // Extra keys from scene data that aren't in current prompt
  const extraGeneralKeys = storedGeneralKeys.filter((k) => !generalPlaceholderKeys.includes(k))
  const extraCharacterKeys = storedCharKeys
    .map(({ characterId, characterName, keys }) => {
      const promptKeys = characterPlaceholderKeys.find((c) => c.characterId === characterId)?.keys ?? []
      return { characterId, characterName, keys: keys.filter((k) => !promptKeys.includes(k)) }
    })
    .filter((c) => c.keys.length > 0)

  const hasAnyPlaceholders = generalPlaceholderKeys.length > 0 ||
    characterPlaceholderKeys.some((c) => c.keys.length > 0) ||
    storedGeneralKeys.length > 0 ||
    storedCharKeys.some((c) => c.keys.length > 0)

  // ── Prompt preview (resolved) ──
  const resolvedPrompts = useMemo(() => {
    const generalValues: Record<string, string> = {}
    for (const key of generalPlaceholderKeys) {
      generalValues[key] = getCellValue(key, 'general')
    }
    for (const key of extraGeneralKeys) {
      generalValues[key] = getCellValue(key, 'general')
    }

    const resolvedGeneral = resolvePlaceholders(generalPrompt, generalValues)
    const resolvedNegative = resolvePlaceholders(negativePrompt, generalValues)

    const resolvedCharacters = characters.map((char) => {
      const charValues: Record<string, string> = {}
      const charKeys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
      for (const key of charKeys) {
        charValues[key] = getCellValue(key, char.id)
      }
      const extraKeys = extraCharacterKeys.find((c) => c.characterId === char.id)?.keys ?? []
      for (const key of extraKeys) {
        charValues[key] = getCellValue(key, char.id)
      }
      return {
        name: char.name,
        prompt: resolvePlaceholders(char.charPrompt, charValues),
        negative: resolvePlaceholders(char.charNegative, charValues),
      }
    })

    return { general: resolvedGeneral, negative: resolvedNegative, characters: resolvedCharacters }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generalPrompt, negativePrompt, characters, characterPlaceholderKeys, extraGeneralKeys, extraCharacterKeys, generalPlaceholderKeys, localValues, scenePlaceholders, characterOverrides])

  return (
    <div className="p-4 space-y-4">
      {hasAnyPlaceholders ? (
        <>
          {/* General Placeholders */}
          {generalPlaceholderKeys.length > 0 && (
            <div className="space-y-2.5">
              {characters.length > 0 && (
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  General
                </div>
              )}
              {generalPlaceholderKeys.map((key) => (
                <div key={key}>
                  <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                    <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                      {`{{${key}}}`}
                    </span>
                  </label>
                  <textarea
                    value={getCellValue(key, 'general')}
                    onChange={(e) => handleCellChange('general', key, e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-[5rem] transition-all"
                    placeholder={`Value for ${key}...`}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Character Placeholder Sections */}
          {characterPlaceholderKeys.map(({ characterId, characterName, keys }) => {
            if (keys.length === 0) return null
            const isCollapsed = collapsedSections.has(characterId)

            return (
              <div
                key={characterId}
                className="rounded-lg bg-secondary/15 border-l-2 border-primary/30"
              >
                <button
                  onClick={() => toggleSection(characterId)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-secondary/25 transition-colors rounded-t-lg"
                >
                  <span className="text-base font-medium">{characterName}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {keys.length} {keys.length === 1 ? 'field' : 'fields'}
                    </span>
                    <HugeiconsIcon
                      icon={ArrowDown01Icon}
                      className={`size-5 text-muted-foreground transition-transform duration-200 ${
                        isCollapsed ? '-rotate-90' : ''
                      }`}
                    />
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="px-4 pb-3 space-y-2.5">
                    {keys.map((key) => (
                      <div key={key}>
                        <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                          <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                            {`{{${key}}}`}
                          </span>
                        </label>
                        <textarea
                          value={getCellValue(key, characterId)}
                          onChange={(e) => handleCellChange(characterId, key, e.target.value)}
                          rows={4}
                          className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-[5rem] transition-all"
                          placeholder={`${characterName}: ${key}...`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Template-defined keys not in current prompt */}
          {(extraGeneralKeys.length > 0 || extraCharacterKeys.length > 0) && (
            <div className="space-y-2.5 border-t border-border/50 pt-4">
              <div className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                From template (unused in prompt)
              </div>
              {extraGeneralKeys.map((key) => (
                <div key={`extra-${key}`} className="opacity-60">
                  <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                    <span className="inline-block rounded bg-secondary/50 border border-dashed border-border px-1.5 py-0.5">
                      {`{{${key}}}`}
                    </span>
                  </label>
                  <textarea
                    value={getCellValue(key, 'general')}
                    onChange={(e) => handleCellChange('general', key, e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-dashed border-border bg-input/20 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-[5rem] transition-all"
                    placeholder={`Value for ${key}...`}
                  />
                </div>
              ))}
              {extraCharacterKeys.map(({ characterId, characterName, keys }) =>
                keys.map((key) => (
                  <div key={`extra-${characterId}-${key}`} className="opacity-60">
                    <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                      <span className="inline-block rounded bg-secondary/50 border border-dashed border-primary/20 px-1.5 py-0.5 text-primary/50">
                        {characterName}: {`{{${key}}}`}
                      </span>
                    </label>
                    <textarea
                      value={getCellValue(key, characterId)}
                      onChange={(e) => handleCellChange(characterId, key, e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-dashed border-border bg-input/20 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-[5rem] transition-all"
                      placeholder={`${characterName}: ${key}...`}
                    />
                  </div>
                )),
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-xl bg-secondary/30 p-4 mb-3">
            <HugeiconsIcon icon={TextIcon} className="size-6 text-muted-foreground/25" />
          </div>
          <p className="text-sm text-muted-foreground max-w-48">
            Add {'{{placeholders}}'} to your prompts to see editable fields here.
          </p>
        </div>
      )}

      {/* ── Prompt Preview ── */}
      {resolvedPrompts && (
        <div className="border-t border-border/50 pt-4">
          <button
            onClick={() => setPreviewOpen(!previewOpen)}
            className="w-full flex items-center justify-between text-left group/preview"
          >
            <div className="flex items-center gap-1.5">
              <HugeiconsIcon icon={ViewIcon} className="size-5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Prompt Preview
              </span>
            </div>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={`size-5 text-muted-foreground transition-transform duration-200 ${
                previewOpen ? '' : '-rotate-90'
              }`}
            />
          </button>

          {previewOpen && (
            <div className="mt-3 space-y-3">
              {/* General prompt */}
              <div>
                <div className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                  General Prompt
                </div>
                <div className="rounded-lg bg-secondary/20 border border-border/50 px-3 py-2 text-sm font-mono text-foreground/80 whitespace-pre-wrap break-all select-all">
                  {resolvedPrompts.general || <span className="text-muted-foreground/40 italic">empty</span>}
                </div>
              </div>

              {/* Negative prompt */}
              {resolvedPrompts.negative && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                    Negative Prompt
                  </div>
                  <div className="rounded-lg bg-secondary/20 border border-border/50 px-3 py-2 text-sm font-mono text-foreground/80 whitespace-pre-wrap break-all select-all">
                    {resolvedPrompts.negative}
                  </div>
                </div>
              )}

              {/* Character prompts */}
              {resolvedPrompts.characters.map((char) => (
                (char.prompt || char.negative) && (
                  <div key={char.name}>
                    <div className="text-xs font-medium text-primary/60 uppercase tracking-wider mb-1.5">
                      {char.name}
                    </div>
                    {char.prompt && (
                      <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 text-sm font-mono text-foreground/80 whitespace-pre-wrap break-all select-all">
                        {char.prompt}
                      </div>
                    )}
                    {char.negative && (
                      <div className="rounded-lg bg-secondary/20 border border-border/50 px-3 py-2 text-sm font-mono text-foreground/60 whitespace-pre-wrap break-all select-all mt-1.5">
                        <span className="text-xs text-muted-foreground/50">neg: </span>
                        {char.negative}
                      </div>
                    )}
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
