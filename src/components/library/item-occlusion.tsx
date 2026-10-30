import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { useQueryClient } from '@tanstack/react-query'
import { ConditionEditor } from './condition-editor'
import { useSerialSave } from './use-serial-save'
import type { CoverRule, PartsAxis } from '@/lib/character-parts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { updateOutfitItem } from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type Area = { id: number; name: string }

/** Multi-select chips over the body areas. */
function AreaChips({
  areas,
  selected,
  onToggle,
  label,
}: {
  areas: Array<Area>
  selected: Array<number>
  onToggle: (id: number) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {areas.map((a) => {
        const on = selected.includes(a.id)
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            data-area-chip={a.id}
            onClick={() => onToggle(a.id)}
            className={cn(
              'h-7 rounded-lg border px-2.5 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              on
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border bg-input/30 text-muted-foreground hover:text-foreground',
            )}
          >
            {a.name}
          </button>
        )
      })}
    </div>
  )
}

/** Outfit item: "Areas" picker + "Covers" rules. Edits compose via serial saves. */
export function ItemOcclusion({
  itemId,
  areas,
  areaIds,
  coverRules,
  relevant,
}: {
  itemId: number
  areas: Array<Area>
  areaIds: Array<number>
  coverRules: Array<CoverRule>
  /** Axes usable in rule conditions (global + this item's local) */
  relevant: Array<PartsAxis>
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })
  const onError = () => toast.error(t('library.saveFailed'))

  const areaSave = useSerialSave<Array<number>>(
    areaIds,
    async (next) => {
      await updateOutfitItem({ data: { id: itemId, areaIds: next } })
      await refresh()
    },
    onError,
  )
  const ruleSave = useSerialSave<Array<CoverRule>>(
    coverRules,
    async (next) => {
      await updateOutfitItem({ data: { id: itemId, coverRules: next } })
      await refresh()
    },
    onError,
  )

  const rules = ruleSave.value
  const updateRule = (i: number, fn: (r: CoverRule) => CoverRule) =>
    ruleSave.commit((cur) => cur.map((r, j) => (j === i ? fn(r) : r)))
  const toggleIn = (list: Array<number>, id: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  const orderByAreas = (ids: Array<number>) =>
    areas.map((a) => a.id).filter((id) => ids.includes(id))

  return (
    <>
      <section className="space-y-2" data-item-areas>
        <Label className="text-sm text-muted-foreground">
          {t('library.itemAreas')}
        </Label>
        {areas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('library.noAreasDefined')}
          </p>
        ) : (
          <AreaChips
            areas={areas}
            selected={areaSave.value}
            label={t('library.itemAreas')}
            onToggle={(id) =>
              areaSave.commit((cur) => orderByAreas(toggleIn(cur, id)))
            }
          />
        )}
        <p className="text-xs text-muted-foreground">
          {t('library.itemAreasHint')}
        </p>
      </section>

      <section className="space-y-2" data-cover-rules>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm text-muted-foreground">
            {t('library.covers')}
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-add-rule
            onClick={() =>
              ruleSave.commit((cur) => [
                ...cur,
                { conditions: {}, areaIds: [] },
              ])
            }
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            {t('library.addRule')}
          </Button>
        </div>
        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('library.noRules')}
          </p>
        )}
        <div className="space-y-2">
          {rules.map((rule, i) => (
            <div
              key={i}
              data-cover-rule
              className="space-y-2 rounded-lg border border-border bg-card/40 p-2.5"
            >
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
                  <ConditionEditor
                    condition={rule.conditions}
                    axes={relevant}
                    prefix={t('library.onlyWhen')}
                    onChange={(fn) =>
                      updateRule(i, (r) => ({
                        ...r,
                        conditions: fn(r.conditions),
                      }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {t('library.ruleCovers')}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t('library.deleteRule')}
                  onClick={() =>
                    ruleSave.commit((cur) => cur.filter((_, j) => j !== i))
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                </Button>
              </div>
              {areas.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('library.noAreasDefined')}
                </p>
              ) : (
                <AreaChips
                  areas={areas}
                  selected={rule.areaIds}
                  label={t('library.pickAreas')}
                  onToggle={(id) =>
                    updateRule(i, (r) => ({
                      ...r,
                      areaIds: orderByAreas(toggleIn(r.areaIds, id)),
                    }))
                  }
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('library.coversHint')}
        </p>
      </section>
    </>
  )
}
