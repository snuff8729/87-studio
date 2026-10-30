import { Suspense, lazy, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { ConditionEditor } from './condition-editor'
import { useDebouncedSave } from './use-debounced-save'
import type { Condition, PartsAxis } from '@/lib/character-parts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { deleteFragment, updateFragment } from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

export function FragmentRow({
  id,
  initialText,
  conditions,
  axes,
  index,
  count,
  bundleNames,
  onMove,
  onTextChange,
}: {
  id: number
  initialText: string
  conditions: Condition
  axes: Array<PartsAxis>
  index: number
  count: number
  bundleNames: Array<{ name: string; content: string }>
  onMove: (dir: -1 | 1) => void
  onTextChange: (id: number, text: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [text, setText] = useState(initialText)
  const saver = useDebouncedSave()
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })

  function handleText(next: string) {
    setText(next)
    onTextChange(id, next)
    saver.schedule(async () => {
      try {
        await updateFragment({ data: { id, text: next } })
        void refresh()
      } catch {
        toast.error(t('library.saveFailed'))
      }
    })
  }

  async function handleCondition(next: Condition) {
    try {
      await updateFragment({ data: { id, conditions: next } })
      await refresh()
    } catch {
      toast.error(t('library.saveFailed'))
    }
  }

  async function handleDelete() {
    saver.cancel()
    try {
      await deleteFragment({ data: id })
      await refresh()
    } catch {
      toast.error(t('library.failed'))
    }
  }

  return (
    <div
      data-fragment-row
      className="space-y-2 rounded-lg border border-border bg-card/40 p-2.5"
    >
      {/* Grows with content (1 line min); scrolls after ~8 lines */}
      <div className="[&_.cm-scroller]:max-h-[12rem] [&_.cm-scroller]:overflow-y-auto">
        <Suspense
          fallback={
            <Textarea
              value={text}
              onChange={(e) => handleText(e.target.value)}
              placeholder={t('library.fragmentPlaceholder')}
              className="min-h-[2.5rem] font-mono text-base"
              rows={1}
            />
          }
        >
          <PromptEditor
            value={text}
            onChange={handleText}
            placeholder={t('library.fragmentPlaceholder')}
            bundleNames={bundleNames}
            minHeight="2.5rem"
          />
        </Suspense>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <ConditionEditor
            condition={conditions}
            axes={axes}
            onChange={handleCondition}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label={t('library.moveUp')}
        >
          <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          aria-label={t('library.moveDown')}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleDelete}
          aria-label={t('library.deleteFragment')}
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
        </Button>
      </div>
    </div>
  )
}
