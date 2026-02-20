import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  TextIcon,
  ArrowDown01Icon,
  Add01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resolvePlaceholders } from '@/lib/placeholder'
import { resolveBundles } from '@/lib/bundle'
import { useBundleMap } from '@/lib/use-bundles'
import { useTranslation } from '@/lib/i18n'

function StatusDot({ filled, template }: { filled: boolean; template?: boolean }) {
  if (!filled) return <span className="inline-block size-1.5 rounded-full shrink-0 bg-muted-foreground/25 ring-1 ring-muted-foreground/20" />
  if (template) return <span className="inline-block size-1.5 rounded-full shrink-0 bg-amber-500" />
  return <span className="inline-block size-1.5 rounded-full shrink-0 bg-emerald-500" />
}

interface CharacterPlaceholderKeyEntry {
  characterId: number
  characterName: string
  keys: string[]
}

export interface PlaceholderEditorProps {
  sceneId: number
  /** Parsed scene-level placeholders: { key: value } */
  scenePlaceholders: Record<string, string>
  /** Parsed character overrides: charId → { key: value } */
  characterOverrides: Record<number, Record<string, string>>
  /** Keys extracted from prompt templates */
  generalPlaceholderKeys: string[]
  characterPlaceholderKeys: CharacterPlaceholderKeyEntry[]
  characters: Array<{ id: number; name: string; charPrompt?: string; charNegative?: string }>
  /** Save merged general placeholders (full JSON string) */
  onSaveGeneral: (mergedJson: string) => Promise<void>
  /** Save merged character override (full JSON string) */
  onSaveCharOverride: (charId: number, mergedJson: string) => Promise<void>
  onPlaceholdersChange?: () => void
  /** Stable callback to get latest prompt text (avoids re-renders). When provided, shows Prompt Preview. */
  getPrompts?: () => { generalPrompt: string; negativePrompt: string }
}

export const PlaceholderEditor = memo(function PlaceholderEditor({
  sceneId,
  scenePlaceholders,
  characterOverrides,
  generalPlaceholderKeys,
  characterPlaceholderKeys,
  characters,
  onSaveGeneral,
  onSaveCharOverride,
  onPlaceholdersChange,
  getPrompts,
}: PlaceholderEditorProps) {
  const { t } = useTranslation()
  const bundleMap = useBundleMap()

  // ── Collapsed state ──
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set())
  const [filledCollapsed, setFilledCollapsed] = useState(false)
  const [unusedCollapsed, setUnusedCollapsed] = useState(true)

  // ── Pin focused field to prevent section jump on save ──
  const pinnedCellRef = useRef<{ key: string; section: 'unfilled' | 'filled' } | null>(null)
  const [blurTick, setBlurTick] = useState(0)

  // ── Scene Data management ──
  const [addingSceneData, setAddingSceneData] = useState(false)
  const [newSceneDataKey, setNewSceneDataKey] = useState('')

  function toggleSection(charId: number) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(charId)) next.delete(charId)
      else next.add(charId)
      return next
    })
  }

  // ── Local editing state with debounced save ──
  const [localValues, setLocalValues] = useState<Record<string, string>>({})
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Reset local values when scene changes
  useEffect(() => {
    setLocalValues({})
    pinnedCellRef.current = null
  }, [sceneId])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // Clear local overlays once server props reflect the saved values
  useEffect(() => {
    setLocalValues((prev) => {
      if (Object.keys(prev).length === 0) return prev
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) {
        const parts = k.split(':')
        let serverValue: string
        if (parts[0] === 'g') {
          serverValue = scenePlaceholders[parts[1]] ?? ''
        } else {
          const charId = Number(parts[1])
          const placeholder = parts[2]
          serverValue = characterOverrides[charId]?.[placeholder] ?? ''
        }
        if (serverValue !== v) {
          next[k] = v // server hasn't caught up — keep overlay
        }
      }
      return Object.keys(next).length === 0 ? {} : next
    })
  }, [scenePlaceholders, characterOverrides])

  function cellKey(context: 'general' | number, placeholder: string) {
    return context === 'general' ? `g:${placeholder}` : `c:${context}:${placeholder}`
  }

  function getCellValue(key: string, context: 'general' | number): string {
    const ck = cellKey(context, key)
    if (ck in localValues) return localValues[ck]
    if (context === 'general') return scenePlaceholders[key] ?? ''
    return characterOverrides[context]?.[key] ?? ''
  }

  function getGeneralValue(key: string): string {
    const ck = cellKey('general', key)
    if (ck in localValues) return localValues[ck]
    return scenePlaceholders[key] ?? ''
  }

  function getEffectiveCharValue(key: string, charId: number): string {
    return getCellValue(key, charId) || getGeneralValue(key)
  }

  function handleCellChange(context: 'general' | number, key: string, value: string) {
    setLocalValues((prev) => ({ ...prev, [cellKey(context, key)]: value }))
    scheduleSave()
  }

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => flushSave(), 800)
  }

  function handleSectionBlur(ck: string) {
    requestAnimationFrame(() => {
      if (pinnedCellRef.current?.key === ck) {
        pinnedCellRef.current = null
        setBlurTick((t) => t + 1)
      }
    })
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
        onSaveGeneral(JSON.stringify(merged))
          .then(() => onPlaceholdersChange?.())
          .catch(() => toast.error(t('placeholder.failedToSave')))
      }

      for (const [charId, changes] of charChanges) {
        const existing = characterOverrides[charId] ?? {}
        onSaveCharOverride(charId, JSON.stringify({ ...existing, ...changes }))
          .then(() => onPlaceholdersChange?.())
          .catch(() => toast.error(t('placeholder.failedToSaveOverride')))
      }

      return currentLocal // keep overlay until props catch up
    })
  }, [scenePlaceholders, characterOverrides, onSaveGeneral, onSaveCharOverride, onPlaceholdersChange])

  // ── Scene Data key management ──
  async function handleAddSceneDataKey() {
    const key = newSceneDataKey.trim()
    if (!key) return
    if (generalPlaceholderKeys.includes(key) || key in scenePlaceholders) {
      toast.error(t('placeholder.keyAlreadyExists'))
      return
    }
    try {
      await onSaveGeneral(JSON.stringify({ ...scenePlaceholders, [key]: '' }))
      onPlaceholdersChange?.()
      setNewSceneDataKey('')
      setAddingSceneData(false)
    } catch {
      toast.error(t('placeholder.failedToAddKey'))
    }
  }

  async function handleRemoveGeneralKey(key: string) {
    const { [key]: _, ...remaining } = scenePlaceholders
    setLocalValues((prev) => {
      const next = { ...prev }
      delete next[cellKey('general', key)]
      return next
    })
    try {
      await onSaveGeneral(JSON.stringify(remaining))
      onPlaceholdersChange?.()
    } catch {
      toast.error(t('placeholder.failedToRemoveKey'))
    }
  }

  // ── Classification: use SERVER data + pin focused field in its section ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const classifiedKeys = useMemo(() => {
    const pinned = pinnedCellRef.current

    const unfilledGeneral = generalPlaceholderKeys.filter((key) => {
      if (pinned?.key === `g:${key}`) return pinned.section === 'unfilled'
      return !scenePlaceholders[key]
    })
    const filledGeneral = generalPlaceholderKeys.filter((key) => {
      if (pinned?.key === `g:${key}`) return pinned.section === 'filled'
      return !!scenePlaceholders[key]
    })

    const unfilledChars: Array<{ charId: number; charName: string; keys: string[] }> = []
    const filledChars: Array<{ charId: number; charName: string; keys: Array<{ key: string; isTemplate: boolean; generalValue: string }> }> = []

    for (const char of characters) {
      const keys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
      const unfilled: string[] = []
      const filled: Array<{ key: string; isTemplate: boolean; generalValue: string }> = []

      for (const key of keys) {
        const ownValue = characterOverrides[char.id]?.[key] ?? ''
        const generalValue = scenePlaceholders[key] ?? ''
        const ck = `c:${char.id}:${key}`

        if (pinned?.key === ck) {
          if (pinned.section === 'unfilled') {
            unfilled.push(key)
          } else {
            filled.push({ key, isTemplate: !ownValue && !!generalValue, generalValue })
          }
        } else if (!ownValue && !generalValue) {
          unfilled.push(key)
        } else {
          filled.push({ key, isTemplate: !ownValue && !!generalValue, generalValue })
        }
      }

      if (unfilled.length > 0) unfilledChars.push({ charId: char.id, charName: char.name, keys: unfilled })
      if (filled.length > 0) filledChars.push({ charId: char.id, charName: char.name, keys: filled })
    }

    const totalUnfilled = unfilledGeneral.length + unfilledChars.reduce((s, e) => s + e.keys.length, 0)
    const totalFilled = filledGeneral.length + filledChars.reduce((s, e) => s + e.keys.length, 0)

    return { unfilledGeneral, filledGeneral, unfilledChars, filledChars, totalUnfilled, totalFilled }
  }, [scenePlaceholders, characterOverrides, generalPlaceholderKeys, characterPlaceholderKeys, characters, blurTick])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filledCounts = useMemo(() => {
    let filled = 0
    let total = 0
    for (const key of generalPlaceholderKeys) {
      total++
      if (getCellValue(key, 'general')) filled++
    }
    for (const char of characters) {
      const keys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
      for (const key of keys) {
        total++
        if (getEffectiveCharValue(key, char.id)) filled++
      }
    }
    return { filled, total }
  }, [generalPlaceholderKeys, characters, characterPlaceholderKeys, localValues, scenePlaceholders, characterOverrides])

  // Extra keys from scene data not in prompt template
  const extraGeneralKeys = useMemo(
    () => Object.keys(scenePlaceholders).filter((k) => !generalPlaceholderKeys.includes(k)),
    [scenePlaceholders, generalPlaceholderKeys],
  )

  const extraCharacterKeys = useMemo(() => {
    return characters
      .map((char) => {
        const parsed = characterOverrides[char.id] ?? {}
        const promptKeys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
        return { characterId: char.id, characterName: char.name, keys: Object.keys(parsed).filter((k) => !promptKeys.includes(k)) }
      })
      .filter((c) => c.keys.length > 0)
  }, [characters, characterOverrides, characterPlaceholderKeys])

  const unusedCount = extraGeneralKeys.length + extraCharacterKeys.reduce((s, c) => s + c.keys.length, 0)

  // ── Prompt Preview (throttled) ──
  const [previewOpen, setPreviewOpen] = useState(false)
  const [resolvedPrompts, setResolvedPrompts] = useState<{
    general: string
    negative: string
    characters: Array<{ name: string; prompt: string; negative: string }>
  } | null>(null)

  // Pack latest computation inputs into a ref so the interval always reads fresh data
  const previewInputsRef = useRef({
    getCellValue, getPrompts, characters, generalPlaceholderKeys, characterPlaceholderKeys,
    scenePlaceholders, characterOverrides, localValues, bundleMap,
  })
  previewInputsRef.current = {
    getCellValue, getPrompts, characters, generalPlaceholderKeys, characterPlaceholderKeys,
    scenePlaceholders, characterOverrides, localValues, bundleMap,
  }

  useEffect(() => {
    if (!previewOpen || !getPrompts) return

    function compute() {
      const ref = previewInputsRef.current
      if (!ref.getPrompts) return
      const { generalPrompt, negativePrompt } = ref.getPrompts()

      // Build general values
      const allGeneralKeys = new Set([...ref.generalPlaceholderKeys, ...Object.keys(ref.scenePlaceholders)])
      const generalValues: Record<string, string> = {}
      for (const key of allGeneralKeys) {
        const ck = `g:${key}`
        generalValues[key] = (ck in ref.localValues ? ref.localValues[ck] : ref.scenePlaceholders[key]) ?? ''
      }

      const resolvedChars = ref.characters
        .filter((c) => c.charPrompt || c.charNegative)
        .map((char) => {
          const charKeys = ref.characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
          const charValues: Record<string, string> = {}
          for (const key of charKeys) {
            const ck = `c:${char.id}:${key}`
            const ownValue = (ck in ref.localValues ? ref.localValues[ck] : ref.characterOverrides[char.id]?.[key]) ?? ''
            charValues[key] = ownValue || generalValues[key] || ''
          }
          return {
            name: char.name,
            prompt: resolvePlaceholders(resolveBundles(char.charPrompt || '', ref.bundleMap), charValues),
            negative: resolvePlaceholders(resolveBundles(char.charNegative || '', ref.bundleMap), charValues),
          }
        })

      setResolvedPrompts({
        general: resolvePlaceholders(resolveBundles(generalPrompt, ref.bundleMap), generalValues),
        negative: negativePrompt ? resolvePlaceholders(resolveBundles(negativePrompt, ref.bundleMap), generalValues) : '',
        characters: resolvedChars,
      })
    }

    compute()
    const interval = setInterval(compute, 2000)
    return () => clearInterval(interval)
  }, [previewOpen, getPrompts])

  const hasPromptKeys = generalPlaceholderKeys.length > 0 ||
    characterPlaceholderKeys.some((c) => c.keys.length > 0)

  function scrollToSlot(type: 'g' | 'c', key: string, charId?: number) {
    const id = type === 'g' ? `slot-g-${key}` : `slot-c-${charId}-${key}`
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const textarea = el.querySelector('textarea')
      textarea?.focus()
    }
  }

  // ── Empty state ──
  if (!hasPromptKeys && extraGeneralKeys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-xl bg-secondary/30 p-4 mb-3">
          <HugeiconsIcon icon={TextIcon} className="size-6 text-muted-foreground/25" />
        </div>
        <p className="text-sm text-muted-foreground max-w-48">
          {t('placeholder.addPlaceholders')}
        </p>
      </div>
    )
  }

  // ── No prompt keys but has scene data ──
  if (!hasPromptKeys) {
    return (
      <div className="space-y-2.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('placeholder.sceneData', { count: extraGeneralKeys.length })}</span>
        {extraGeneralKeys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground/70 shrink-0 min-w-0 truncate max-w-[8rem]" title={key}>{key}</span>
            <input
              type="text"
              value={getCellValue(key, 'general')}
              onChange={(e) => handleCellChange('general', key, e.target.value)}
              className="flex-1 h-8 rounded-lg border border-dashed border-border bg-input/20 px-2.5 text-sm font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all min-w-0"
              placeholder={t('scene.valueFor', { key })}
            />
            <button
              onClick={() => handleRemoveGeneralKey(key)}
              className="text-muted-foreground/50 hover:text-destructive transition-colors p-1 rounded shrink-0"
              title={t('common.delete')}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground/50 mt-2">
          {t('placeholder.addPlaceholders')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-onboarding="placeholder-editor">
      {/* ── Keys Section ── */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('placeholder.keys')}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {filledCounts.total - filledCounts.filled > 0
              ? <><span className="text-amber-500">{t('placeholder.unfilledCount', { unfilled: filledCounts.total - filledCounts.filled, total: filledCounts.total })}</span></>
              : <>{t('placeholder.filledCount', { filled: filledCounts.total, total: filledCounts.total })}</>
            }
          </span>
        </div>

        {/* General keys */}
        {generalPlaceholderKeys.length > 0 && (
          <div className="mb-2.5">
            {characters.length > 0 && (
              <div className="text-[11px] text-muted-foreground/60 mb-1">{t('workspace.general')}</div>
            )}
            <div className="flex flex-wrap gap-1">
              {generalPlaceholderKeys.map((key) => (
                <Badge
                  key={key}
                  variant="secondary"
                  className="cursor-pointer text-xs gap-1 h-5 px-1.5"
                  onClick={() => scrollToSlot('g', key)}
                >
                  <StatusDot filled={!!getCellValue(key, 'general')} />
                  {key}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Character keys */}
        {characters.map((char) => {
          const keys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
          if (keys.length === 0) return null
          return (
            <div key={char.id} className="mb-2.5">
              <div className="text-[11px] text-muted-foreground/60 mb-1">{char.name}</div>
              <div className="flex flex-wrap gap-1">
                {keys.map((key) => {
                  const ownValue = getCellValue(key, char.id)
                  const generalValue = getGeneralValue(key)
                  const isFilled = !!ownValue
                  const isTemplate = !ownValue && !!generalValue
                  return (
                    <Badge
                      key={key}
                      variant="secondary"
                      className="cursor-pointer text-xs gap-1 h-5 px-1.5"
                      onClick={() => scrollToSlot('c', key, char.id)}
                    >
                      <StatusDot filled={isFilled || isTemplate} template={isTemplate} />
                      {key}
                    </Badge>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-border/50 my-1" />

      {/* ── Unfilled Section ── */}
      {classifiedKeys.totalUnfilled > 0 && (
        <div className="space-y-2.5">
          <span className="text-xs font-medium text-amber-500/80 uppercase tracking-wider">
            {t('placeholder.unfilled', { count: classifiedKeys.totalUnfilled })}
          </span>

          {classifiedKeys.unfilledGeneral.length > 0 && (
            <div className="space-y-2.5">
              {characters.length > 0 && (
                <div className="text-xs text-muted-foreground/60">{t('workspace.general')}</div>
              )}
              {classifiedKeys.unfilledGeneral.map((key) => (
                <div key={key} id={`slot-g-${key}`}>
                  <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                    <StatusDot filled={!!getCellValue(key, 'general')} />
                    <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                      {`\\\\${key}\\\\`}
                    </span>
                  </label>
                  <textarea
                    value={getCellValue(key, 'general')}
                    onChange={(e) => handleCellChange('general', key, e.target.value)}
                    onFocus={() => { pinnedCellRef.current = { key: `g:${key}`, section: 'unfilled' } }}
                    onBlur={() => handleSectionBlur(`g:${key}`)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-12 sm:min-h-[5rem] transition-all"
                    placeholder={t('scene.valueFor', { key })}
                  />
                </div>
              ))}
            </div>
          )}

          {classifiedKeys.unfilledChars.map(({ charId, charName, keys }) => (
            <div key={charId} className="space-y-2.5">
              <div className="text-xs text-muted-foreground/60">{charName}</div>
              {keys.map((key) => (
                <div key={key} id={`slot-c-${charId}-${key}`}>
                  <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                    <StatusDot filled={false} />
                    <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                      {`\\\\${key}\\\\`}
                    </span>
                  </label>
                  <textarea
                    value={getCellValue(key, charId)}
                    onChange={(e) => handleCellChange(charId, key, e.target.value)}
                    onFocus={() => { pinnedCellRef.current = { key: `c:${charId}:${key}`, section: 'unfilled' } }}
                    onBlur={() => handleSectionBlur(`c:${charId}:${key}`)}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-12 sm:min-h-[5rem] transition-all"
                    placeholder={`${charName}: ${key}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Filled Section ── */}
      {classifiedKeys.totalFilled > 0 && (
        <div>
          <button
            onClick={() => setFilledCollapsed(!filledCollapsed)}
            className="w-full flex items-center justify-between text-left py-1"
          >
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('placeholder.filled', { count: classifiedKeys.totalFilled })}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={`size-4 text-muted-foreground transition-transform duration-200 ${filledCollapsed ? '-rotate-90' : ''}`}
            />
          </button>

          {!filledCollapsed && (
            <div className="mt-2.5 space-y-2.5">
              {/* General filled */}
              {classifiedKeys.filledGeneral.length > 0 && (
                <div className="space-y-2.5">
                  {characters.length > 0 && (
                    <div className="text-xs text-muted-foreground/60">{t('workspace.general')}</div>
                  )}
                  {classifiedKeys.filledGeneral.map((key) => (
                    <div key={key} id={`slot-g-${key}`}>
                      <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                        <StatusDot filled={!!getCellValue(key, 'general')} />
                        <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                          {`\\\\${key}\\\\`}
                        </span>
                      </label>
                      <textarea
                        value={getCellValue(key, 'general')}
                        onChange={(e) => handleCellChange('general', key, e.target.value)}
                        onFocus={() => { pinnedCellRef.current = { key: `g:${key}`, section: 'filled' } }}
                        onBlur={() => handleSectionBlur(`g:${key}`)}
                        rows={2}
                        className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-12 sm:min-h-[5rem] transition-all"
                        placeholder={t('scene.valueFor', { key })}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Character filled */}
              {classifiedKeys.filledChars.map(({ charId, charName, keys }) => {
                const isCollapsed = collapsedSections.has(charId)
                return (
                  <div key={charId} className="rounded-lg bg-secondary/15 border-l-2 border-primary/30">
                    <button
                      onClick={() => toggleSection(charId)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-secondary/25 transition-colors rounded-t-lg"
                    >
                      <span className="text-base font-medium">{charName}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground tabular-nums">{keys.length}</span>
                        <HugeiconsIcon
                          icon={ArrowDown01Icon}
                          className={`size-5 text-muted-foreground transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                        />
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="px-4 pb-3 space-y-2.5">
                        {keys.map(({ key, isTemplate }) => (
                          <div key={key} id={`slot-c-${charId}-${key}`}>
                            <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                              <StatusDot filled={true} template={isTemplate} />
                              <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                                {`\\\\${key}\\\\`}
                              </span>
                              {isTemplate && (
                                <span className="text-[10px] text-amber-500/80 bg-amber-500/10 rounded px-1 py-0.5">{t('placeholder.defaultValue')}</span>
                              )}
                            </label>
                            <textarea
                              value={getEffectiveCharValue(key, charId)}
                              onChange={(e) => handleCellChange(charId, key, e.target.value)}
                              onFocus={() => { pinnedCellRef.current = { key: `c:${charId}:${key}`, section: 'filled' } }}
                              onBlur={() => handleSectionBlur(`c:${charId}:${key}`)}
                              rows={2}
                              className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-12 sm:min-h-[5rem] transition-all"
                              placeholder={`${charName}: ${key}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Scene Data / Unused Section ── */}
      {unusedCount > 0 && (
        <>
          <div className="border-t border-border/50 my-1" />
          <div className="space-y-2.5">
            <button
              onClick={() => setUnusedCollapsed(!unusedCollapsed)}
              className="w-full flex items-center justify-between text-left py-1"
            >
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('placeholder.sceneData', { count: unusedCount })}
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className={`size-4 text-muted-foreground transition-transform duration-200 ${unusedCollapsed ? '-rotate-90' : ''}`}
              />
            </button>

            {!unusedCollapsed && (
              <div className="space-y-2.5">
                {extraGeneralKeys.map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground/70 shrink-0 min-w-0 truncate max-w-[8rem]" title={key}>{key}</span>
                    <input
                      type="text"
                      value={getCellValue(key, 'general')}
                      onChange={(e) => handleCellChange('general', key, e.target.value)}
                      className="flex-1 h-8 rounded-lg border border-dashed border-border bg-input/20 px-2.5 text-sm font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all min-w-0"
                      placeholder={t('scene.valueFor', { key })}
                    />
                    <button
                      onClick={() => handleRemoveGeneralKey(key)}
                      className="text-muted-foreground/50 hover:text-destructive transition-colors p-1 rounded shrink-0"
                      title={t('common.delete')}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                    </button>
                  </div>
                ))}

                {addingSceneData ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={newSceneDataKey}
                      onChange={(e) => setNewSceneDataKey(e.target.value)}
                      placeholder={t('common.name')}
                      className="h-8 text-sm w-32 font-mono"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddSceneDataKey()
                        if (e.key === 'Escape') { setAddingSceneData(false); setNewSceneDataKey('') }
                      }}
                    />
                    <Button size="xs" onClick={handleAddSceneDataKey} disabled={!newSceneDataKey.trim()}>{t('common.add')}</Button>
                    <Button size="xs" variant="ghost" onClick={() => { setAddingSceneData(false); setNewSceneDataKey('') }}>{t('common.cancel')}</Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingSceneData(true)}
                    className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1 px-2 rounded-lg border border-dashed border-border/50 hover:border-border"
                  >
                    <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                    {t('placeholder.addData')}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Prompt Preview ── */}
      {getPrompts && (
        <>
          <div className="border-t border-border/50 my-1" />
          <div>
            <button
              onClick={() => setPreviewOpen(!previewOpen)}
              className="w-full flex items-center justify-between text-left py-1"
            >
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('placeholder.promptPreview')}
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className={`size-4 text-muted-foreground transition-transform duration-200 ${previewOpen ? '' : '-rotate-90'}`}
              />
            </button>

            {previewOpen && resolvedPrompts && (
              <div className="mt-2 space-y-3">
                <div>
                  <div className="text-[11px] text-muted-foreground/60 mb-1">{t('placeholder.generalPrompt')}</div>
                  <pre className="text-xs font-mono bg-secondary/30 rounded-lg p-3 whitespace-pre-wrap break-words text-foreground/80 max-h-48 overflow-y-auto">
                    {resolvedPrompts.general || <span className="text-muted-foreground/40 italic">{t('placeholder.empty')}</span>}
                  </pre>
                </div>

                {resolvedPrompts.negative && (
                  <div>
                    <div className="text-[11px] text-muted-foreground/60 mb-1">{t('placeholder.negativePrompt')}</div>
                    <pre className="text-xs font-mono bg-secondary/30 rounded-lg p-3 whitespace-pre-wrap break-words text-foreground/80 max-h-48 overflow-y-auto">
                      {resolvedPrompts.negative}
                    </pre>
                  </div>
                )}

                {resolvedPrompts.characters.map((char) => (
                  <div key={char.name}>
                    <div className="text-[11px] text-muted-foreground/60 mb-1">{char.name}</div>
                    <pre className="text-xs font-mono bg-secondary/30 rounded-lg p-3 whitespace-pre-wrap break-words text-foreground/80 max-h-48 overflow-y-auto">
                      {char.prompt || <span className="text-muted-foreground/40 italic">{t('placeholder.empty')}</span>}
                    </pre>
                    {char.negative && (
                      <>
                        <div className="text-[11px] text-muted-foreground/60 mt-2 mb-1">{char.name} {t('placeholder.negativePrompt')}</div>
                        <pre className="text-xs font-mono bg-secondary/30 rounded-lg p-3 whitespace-pre-wrap break-words text-foreground/80 max-h-48 overflow-y-auto">
                          {char.negative}
                        </pre>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
})
