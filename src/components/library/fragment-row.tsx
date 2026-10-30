import { Suspense, lazy, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ConditionEditor } from './condition-editor'
import { useDebouncedSave } from './use-debounced-save'
import { useSerialSave } from './use-serial-save'
import type { Condition, PartsAxis } from '@/lib/character-parts'
import {
  DragHandle,
  RowRemoveButton,
  SortableRow,
} from '@/components/common/sortable-list/sortable-list'
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
  bundleNames,
  onTextChange,
}: {
  id: number
  initialText: string
  conditions: Condition
  axes: Array<PartsAxis>
  bundleNames: Array<{ name: string; content: string }>
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

  const cond = useSerialSave<Condition>(
    conditions,
    async (next) => {
      await updateFragment({ data: { id, conditions: next } })
      await refresh()
    },
    () => toast.error(t('library.saveFailed')),
  )

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
    <SortableRow
      id={id}
      data-fragment-row
      className="flex items-start gap-1 rounded-lg border border-border bg-card/40 p-2 pl-1"
    >
      <DragHandle className="mt-1" />
      <div className="min-w-0 flex-1 space-y-2">
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
        <ConditionEditor
          condition={cond.value}
          axes={axes}
          onChange={cond.commit}
        />
      </div>
      <RowRemoveButton
        className="mt-1"
        label={t('library.deleteFragment')}
        onClick={handleDelete}
      />
    </SortableRow>
  )
}
