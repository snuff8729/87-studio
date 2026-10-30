import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowExpand01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { LazyPromptEditor } from './lazy-prompt-editor'
import type { CharacterEntry } from './types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n'
import { useBundleNames } from '@/lib/use-bundles'
import { ExpandedEditorDialog } from '@/components/prompt-editor/expanded-editor-dialog'

export function QuickCharactersTab({
  characters,
  addCharacter,
  removeCharacter,
  updateCharacterField,
}: {
  characters: Array<CharacterEntry>
  addCharacter: () => void
  removeCharacter: (id: string) => void
  updateCharacterField: (
    id: string,
    field: keyof CharacterEntry,
    value: string,
  ) => void
}) {
  const { t } = useTranslation()
  const bundleNames = useBundleNames()
  const [expandTarget, setExpandTarget] = useState<{
    type: 'charPrompt' | 'charNegative'
    charId: string
    label: string
  } | null>(null)

  const expandChar = expandTarget
    ? characters.find((c) => c.id === expandTarget.charId)
    : undefined
  const expandValue = expandTarget
    ? expandTarget.type === 'charPrompt'
      ? (expandChar?.prompt ?? '')
      : (expandChar?.negative ?? '')
    : ''

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground uppercase tracking-wider">
          {t('quickGenerate.characters')}
        </Label>
        <Button variant="ghost" size="icon-sm" onClick={addCharacter}>
          <HugeiconsIcon icon={Add01Icon} className="size-5" />
        </Button>
      </div>

      {characters.map((char) => (
        <div
          key={char.id}
          className="rounded-lg border border-border p-2 space-y-2"
        >
          <div className="flex items-center gap-1.5">
            <Input
              value={char.name}
              onChange={(e) =>
                updateCharacterField(char.id, 'name', e.target.value)
              }
              placeholder={t('quickGenerate.characterName')}
              className="h-7 text-sm flex-1"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => removeCharacter(char.id)}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </Button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {t('quickGenerate.prompt')}
              </Label>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  setExpandTarget({
                    type: 'charPrompt',
                    charId: char.id,
                    label: `${char.name || t('quickGenerate.characters')} — ${t('quickGenerate.prompt')}`,
                  })
                }
                title={t('workspace.expandEditor')}
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
              </Button>
            </div>
            <LazyPromptEditor
              value={char.prompt}
              onChange={(v) => updateCharacterField(char.id, 'prompt', v)}
              placeholder={t('quickGenerate.characterPrompt')}
              minHeight="80px"
              bundleNames={bundleNames}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {t('quickGenerate.negativePrompt')}
              </Label>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  setExpandTarget({
                    type: 'charNegative',
                    charId: char.id,
                    label: `${char.name || t('quickGenerate.characters')} — ${t('quickGenerate.negativePrompt')}`,
                  })
                }
                title={t('workspace.expandEditor')}
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
              </Button>
            </div>
            <LazyPromptEditor
              value={char.negative}
              onChange={(v) => updateCharacterField(char.id, 'negative', v)}
              placeholder={t('quickGenerate.characterNegative')}
              minHeight="60px"
              bundleNames={bundleNames}
            />
          </div>
        </div>
      ))}

      <ExpandedEditorDialog
        open={expandTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExpandTarget(null)
        }}
        title={expandTarget?.label ?? ''}
        value={expandValue}
        onChange={(v) => {
          if (!expandTarget) return
          updateCharacterField(
            expandTarget.charId,
            expandTarget.type === 'charPrompt' ? 'prompt' : 'negative',
            v,
          )
        }}
        bundleNames={bundleNames}
      />
    </div>
  )
}
