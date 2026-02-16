import { lazy, Suspense, useState, useRef, useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { extractPlaceholders } from '@/lib/placeholder'
import { updateCharacter, createCharacter, deleteCharacter } from '@/server/functions/characters'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

function LazyPromptEditor(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: string
}) {
  return (
    <Suspense
      fallback={
        <Textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          className="font-mono text-base min-h-[200px]"
          rows={8}
        />
      }
    >
      <PromptEditor {...props} />
    </Suspense>
  )
}

interface PromptPanelProps {
  generalPrompt: string
  negativePrompt: string
  characters: Array<{
    id: number
    name: string
    charPrompt: string
    charNegative: string
    slotIndex: number | null
  }>
  onGeneralPromptChange: (value: string) => void
  onNegativePromptChange: (value: string) => void
  projectId: number
}

export function PromptPanel({
  generalPrompt,
  negativePrompt,
  characters,
  onGeneralPromptChange,
  onNegativePromptChange,
  projectId,
}: PromptPanelProps) {
  const router = useRouter()
  // 'general' = General tab, 'character' = Character tab (no chars), number = specific character
  const [activeContext, setActiveContext] = useState<'general' | 'character' | number>('general')
  const isCharacterTab = activeContext !== 'general'

  // Character-local editing state
  const [charPrompt, setCharPrompt] = useState('')
  const [charNegative, setCharNegative] = useState('')
  const charSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Add character popover
  const [addOpen, setAddOpen] = useState(false)
  const [newCharName, setNewCharName] = useState('')

  // When selected character is deleted, select first remaining or show empty state
  useEffect(() => {
    if (isCharacterTab && typeof activeContext === 'number' && !characters.find((c) => c.id === activeContext)) {
      if (characters.length > 0) {
        switchToCharacter(characters[0].id)
      } else {
        setActiveContext('character')
      }
    }
  }, [characters, activeContext]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync character local state when server data updates
  useEffect(() => {
    if (isCharacterTab) {
      const char = characters.find((c) => c.id === activeContext)
      if (char) {
        setCharPrompt(char.charPrompt)
        setCharNegative(char.charNegative)
      }
    }
  }, [characters]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeChar = typeof activeContext === 'number' ? characters.find((c) => c.id === activeContext) ?? null : null

  // ── Character save (debounced) ──
  async function saveChar(charId: number, prompt: string, negative: string) {
    try {
      await updateCharacter({ data: { id: charId, charPrompt: prompt, charNegative: negative } })
      router.invalidate()
    } catch {
      toast.error('Character save failed')
    }
  }

  function debouncedCharSave(charId: number, prompt: string, negative: string) {
    if (charSaveRef.current) clearTimeout(charSaveRef.current)
    charSaveRef.current = setTimeout(() => saveChar(charId, prompt, negative), 1000)
  }

  function flushCharSave() {
    if (charSaveRef.current && typeof activeContext === 'number') {
      clearTimeout(charSaveRef.current)
      charSaveRef.current = undefined
      saveChar(activeContext, charPrompt, charNegative)
    }
  }

  function switchToGeneral() {
    if (activeContext === 'general') return
    flushCharSave()
    setActiveContext('general')
  }

  function switchToCharacter(charId: number) {
    flushCharSave()
    setActiveContext(charId)
    const char = characters.find((c) => c.id === charId)
    setCharPrompt(char?.charPrompt ?? '')
    setCharNegative(char?.charNegative ?? '')
  }

  function switchToCharacterTab() {
    if (isCharacterTab) return
    if (characters.length > 0) {
      switchToCharacter(characters[0].id)
    } else {
      setActiveContext('character')
    }
  }

  useEffect(() => {
    return () => {
      if (charSaveRef.current) clearTimeout(charSaveRef.current)
    }
  }, [])

  // ── Display values ──
  const displayPrompt = activeContext === 'general' ? generalPrompt : charPrompt
  const displayNegative = activeContext === 'general' ? negativePrompt : charNegative

  const promptPlaceholders = extractPlaceholders(displayPrompt)
  const negativePlaceholders = extractPlaceholders(displayNegative)

  function handlePromptChange(value: string) {
    if (activeContext === 'general') {
      onGeneralPromptChange(value)
    } else {
      setCharPrompt(value)
      debouncedCharSave(activeContext as number, value, charNegative)
    }
  }

  function handleNegativeChange(value: string) {
    if (activeContext === 'general') {
      onNegativePromptChange(value)
    } else {
      setCharNegative(value)
      debouncedCharSave(activeContext as number, charPrompt, value)
    }
  }

  // ── Character CRUD ──
  async function handleAddCharacter() {
    const name = newCharName.trim()
    if (!name) return
    try {
      const result = await createCharacter({ data: { projectId, name } })
      setNewCharName('')
      setAddOpen(false)
      toast.success('Character added')
      router.invalidate()
      // Auto-switch to the new character
      if (result?.id) {
        switchToCharacter(result.id)
      }
    } catch {
      toast.error('Failed to add character')
    }
  }

  async function handleDeleteCharacter(charId: number, charName: string) {
    try {
      await deleteCharacter({ data: charId })
      toast.success(`${charName} deleted`)
      router.invalidate()
    } catch {
      toast.error('Failed to delete character')
    }
  }

  return (
    <div className="p-3 space-y-3">
      {/* Top-level tabs: General / Character(n) */}
      <div className="flex items-center bg-muted rounded-4xl p-[3px] h-9 min-w-0">
        <button
          onClick={switchToGeneral}
          className={`flex-1 h-full rounded-3xl text-sm font-medium transition-all ${
            !isCharacterTab
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          General
        </button>
        <button
          onClick={switchToCharacterTab}
          className={`flex-1 h-full rounded-3xl text-sm font-medium transition-all ${
            isCharacterTab
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Character{characters.length > 0 ? ` (${characters.length})` : ''}
        </button>
      </div>

      {/* Character sub-bar: selector + add + delete (only when characters exist) */}
      {isCharacterTab && characters.length > 0 && (
        <div className="flex items-center gap-1.5">
          {characters.length === 1 ? (
            <span className="flex-1 text-sm font-medium truncate">{activeChar?.name}</span>
          ) : (
            <Select
              value={String(activeContext)}
              onValueChange={(v) => switchToCharacter(Number(v))}
            >
              <SelectTrigger size="sm" className="flex-1 h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {characters.map((char) => (
                  <SelectItem key={char.id} value={String(char.id)}>
                    {char.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" title="Add character">
                <HugeiconsIcon icon={Add01Icon} className="size-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end" className="w-52 p-3">
              <div className="space-y-2">
                <Label className="text-sm">New Character</Label>
                <div className="flex gap-1.5">
                  <Input
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    placeholder="Name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCharacter()
                      if (e.key === 'Escape') { setAddOpen(false); setNewCharName('') }
                    }}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <Button size="xs" onClick={handleAddCharacter} disabled={!newCharName.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {activeChar && (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" title="Delete character">
                  <HugeiconsIcon icon={Delete02Icon} className="size-5" />
                </Button>
              }
              title="Delete Character"
              description={`Delete "${activeChar.name}"? This will also remove all scene overrides for this character.`}
              onConfirm={() => handleDeleteCharacter(activeChar.id, activeChar.name)}
            />
          )}
        </div>
      )}

      {/* Character tab empty state: no characters yet */}
      {isCharacterTab && characters.length === 0 && (
        <div className="flex flex-col items-center py-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            No characters yet. Add one to define character-specific prompts.
          </p>
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
                Add Character
              </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" className="w-52 p-3">
              <div className="space-y-2">
                <Label className="text-sm">New Character</Label>
                <div className="flex gap-1.5">
                  <Input
                    value={newCharName}
                    onChange={(e) => setNewCharName(e.target.value)}
                    placeholder="Name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCharacter()
                      if (e.key === 'Escape') { setAddOpen(false); setNewCharName('') }
                    }}
                    className="h-7 text-sm"
                    autoFocus
                  />
                  <Button size="xs" onClick={handleAddCharacter} disabled={!newCharName.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Prompt Editor — shown for General, or when Character tab has a selection */}
      {(activeContext === 'general' || activeChar) && (
        <>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground uppercase tracking-wider">
              {isCharacterTab ? 'Character Prompt' : 'Prompt'}
            </Label>
            <LazyPromptEditor
              key={`prompt-${activeContext}`}
              value={displayPrompt}
              onChange={handlePromptChange}
              placeholder={
                isCharacterTab
                  ? `${activeChar?.name} prompt with {{placeholders}}...`
                  : 'Enter general prompt with {{placeholders}}...'
              }
              minHeight="200px"
            />
            {promptPlaceholders.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {promptPlaceholders.map((p) => (
                  <Badge
                    key={p}
                    variant={isCharacterTab ? 'outline' : 'secondary'}
                    className="text-xs"
                  >
                    {`{{${p}}}`}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground uppercase tracking-wider">
              {isCharacterTab ? 'Char Negative' : 'Negative Prompt'}
            </Label>
            <LazyPromptEditor
              key={`negative-${activeContext}`}
              value={displayNegative}
              onChange={handleNegativeChange}
              placeholder={
                isCharacterTab
                  ? `${activeChar?.name} negative...`
                  : 'Enter negative prompt...'
              }
              minHeight="120px"
            />
            {negativePlaceholders.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {negativePlaceholders.map((p) => (
                  <Badge
                    key={p}
                    variant={isCharacterTab ? 'outline' : 'secondary'}
                    className="text-xs"
                  >
                    {`{{${p}}}`}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
