import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AreaChips, areaOrder } from './area-chips'
import { ConditionEditor } from './condition-editor'
import { useDebouncedSave } from './use-debounced-save'
import { useSerialSave } from './use-serial-save'
import type { AreaOption } from './area-chips'
import type { Condition, PartsAxis } from '@/lib/character-parts'
import {
  DragHandle,
  RowRemoveButton,
  SortableRow,
} from '@/components/common/sortable-list/sortable-list'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
  areas,
  areaIds,
  varNames,
}: {
  id: number
  initialText: string
  conditions: Condition
  /** Outfit item fragments only: body areas for the optional "Areas" picker */
  areas?: Array<AreaOption>
  areaIds?: Array<number>
  /** Outfit item fragments only: names of the item's variables */
  varNames?: Array<string>
  axes: Array<PartsAxis>
  bundleNames: Array<{ name: string; content: string }>
  onTextChange: (id: number, text: string) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [text, setText] = useState(initialText)
  const saver = useDebouncedSave()
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })

  // Follow server-side text changes (e.g. a variable rename rewrote the
  // tokens) unless a local edit is still being saved
  const dirtyRef = useRef(false)
  useEffect(() => {
    if (dirtyRef.current || initialText === text) return
    setText(initialText)
    onTextChange(id, initialText)
  }, [initialText])

  function handleText(next: string) {
    setText(next)
    dirtyRef.current = true
    onTextChange(id, next)
    saver.schedule(async () => {
      try {
        await updateFragment({ data: { id, text: next } })
        dirtyRef.current = false
        void refresh()
      } catch {
        dirtyRef.current = false
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

  const ownAreas = useSerialSave<Array<number>>(
    areaIds ?? [],
    async (next) => {
      await updateFragment({ data: { id, areaIds: next } })
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
              varNames={varNames}
              minHeight="2.5rem"
            />
          </Suspense>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <ConditionEditor
            condition={cond.value}
            axes={axes}
            onChange={cond.commit}
          />
          {areas && areas.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  data-fragment-areas
                  className={
                    ownAreas.value.length > 0
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'text-muted-foreground'
                  }
                >
                  {ownAreas.value.length > 0
                    ? t('library.fragmentAreasOwn', {
                        names: areas
                          .filter((a) => ownAreas.value.includes(a.id))
                          .map((a) => a.name)
                          .join(', '),
                      })
                    : t('library.fragmentAreasInherit')}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[min(26rem,calc(100vw-2rem))] gap-2 p-3"
              >
                <p className="text-xs text-muted-foreground">
                  {t('library.fragmentAreasHint')}
                </p>
                <AreaChips
                  areas={areas}
                  selected={ownAreas.value}
                  label={t('library.fragmentAreas')}
                  onToggle={(aid) =>
                    ownAreas.commit((cur) => {
                      const next = cur.includes(aid)
                        ? cur.filter((x) => x !== aid)
                        : [...cur, aid]
                      const order = areaOrder(areas)
                      return order.filter((x) => next.includes(x))
                    })
                  }
                />
                {ownAreas.value.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="self-start"
                    onClick={() => ownAreas.commit(() => [])}
                  >
                    {t('library.fragmentAreasClear')}
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      <RowRemoveButton
        className="mt-1"
        label={t('library.deleteFragment')}
        onClick={handleDelete}
      />
    </SortableRow>
  )
}
