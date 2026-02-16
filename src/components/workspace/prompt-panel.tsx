import { lazy, Suspense, useState, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { extractPlaceholders } from '@/lib/placeholder'
import { updateCharacter } from '@/server/functions/characters'

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
          className="font-mono text-sm"
          rows={3}
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
}: PromptPanelProps) {
  const generalPlaceholders = extractPlaceholders(generalPrompt)

  return (
    <div className="p-3 space-y-4">
      {/* General Prompt */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
          General Prompt
        </Label>
        <LazyPromptEditor
          value={generalPrompt}
          onChange={onGeneralPromptChange}
          placeholder="Enter general prompt with {{placeholders}}..."
          minHeight="80px"
        />
        {generalPlaceholders.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {generalPlaceholders.map((p) => (
              <Badge key={p} variant="secondary" className="text-[10px]">{`{{${p}}}`}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Character Prompts */}
      {characters.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            Character Prompts
          </Label>
          {characters.map((char) => (
            <CharacterPromptSection key={char.id} character={char} />
          ))}
        </div>
      )}

      {/* Negative Prompt */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
          Negative Prompt
        </Label>
        <LazyPromptEditor
          value={negativePrompt}
          onChange={onNegativePromptChange}
          placeholder="Enter negative prompt..."
          minHeight="60px"
        />
      </div>
    </div>
  )
}

function CharacterPromptSection({
  character,
}: {
  character: { id: number; name: string; charPrompt: string; charNegative: string }
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(true)
  const [prompt, setPrompt] = useState(character.charPrompt)
  const [negative, setNegative] = useState(character.charNegative)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const placeholders = [
    ...extractPlaceholders(prompt),
    ...extractPlaceholders(negative),
  ]
  const uniquePlaceholders = [...new Set(placeholders)]

  async function saveCharacter(fields: { charPrompt?: string; charNegative?: string }) {
    try {
      await updateCharacter({ data: { id: character.id, ...fields } })
      router.invalidate()
    } catch {
      toast.error('Character save failed')
    }
  }

  function handlePromptChange(value: string) {
    setPrompt(value)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveCharacter({ charPrompt: value }), 1000)
  }

  function handleNegativeChange(value: string) {
    setNegative(value)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => saveCharacter({ charNegative: value }), 1000)
  }

  return (
    <div className="rounded-lg bg-secondary/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-secondary/50 transition-colors"
      >
        <span className="text-xs font-medium">{character.name}</span>
        <div className="flex items-center gap-1">
          {uniquePlaceholders.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{uniquePlaceholders.length} placeholders</span>
          )}
          <span className="text-[10px] text-muted-foreground">{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2">
          <LazyPromptEditor
            value={prompt}
            onChange={handlePromptChange}
            placeholder={`${character.name} prompt...`}
            minHeight="60px"
          />
          <LazyPromptEditor
            value={negative}
            onChange={handleNegativeChange}
            placeholder={`${character.name} negative...`}
            minHeight="40px"
          />
          {uniquePlaceholders.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {uniquePlaceholders.map((p) => (
                <Badge key={p} variant="outline" className="text-[10px]">{`{{${p}}}`}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
