import type { AxisValues, PartsAxis } from '@/lib/character-parts'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * "Combination check": which global-axis combinations produce output. Two or
 * more axes: rows = first axis, columns = second. One axis: a single row.
 * Clicking a cell selects that combination for the preview.
 */
export function CombinationGrid({
  axes,
  effective,
  isEmpty,
  onPick,
}: {
  /** Referenced global axes (non-empty, in axis order) */
  axes: Array<PartsAxis>
  /** Current preview values (highlights the matching cell) */
  effective: AxisValues
  /** Is the composed output empty for these axis values? */
  isEmpty: (pick: AxisValues) => boolean
  onPick: (pick: AxisValues) => void
}) {
  const { t } = useTranslation()
  const [rowAxis, colAxis] = axes
  const cols = colAxis ? colAxis.values : [null]
  const key = (a: PartsAxis, id: number) => String(a.id) + ':' + id

  return (
    <div className="space-y-1.5" data-combo-grid>
      <div className="text-sm text-muted-foreground">
        {t('library.comboCheck')}
      </div>
      <div className="max-w-full overflow-x-auto rounded-md border border-border">
        <table className="border-collapse text-xs">
          {colAxis && (
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-left font-normal text-muted-foreground">
                  {rowAxis.name} \ {colAxis.name}
                </th>
                {colAxis.values.map((c) => (
                  <th
                    key={c.id}
                    className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rowAxis.values.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                  {r.name}
                </th>
                {cols.map((c) => {
                  const pick: AxisValues = { [String(rowAxis.id)]: r.id }
                  if (colAxis && c) pick[String(colAxis.id)] = c.id
                  const empty = isEmpty(pick)
                  const current =
                    effective[String(rowAxis.id)] === r.id &&
                    (!colAxis || !c || effective[String(colAxis.id)] === c.id)
                  return (
                    <td key={c ? key(colAxis, c.id) : 'one'} className="p-1">
                      <button
                        type="button"
                        data-combo-cell
                        data-empty={empty ? '' : undefined}
                        data-current={current ? '' : undefined}
                        aria-label={
                          [r.name, c?.name].filter(Boolean).join(' · ') +
                          ': ' +
                          (empty ? t('library.comboEmpty') : 'OK')
                        }
                        onClick={() => onPick(pick)}
                        className={cn(
                          'inline-flex h-7 w-full min-w-16 items-center justify-center gap-1 rounded-md px-2 whitespace-nowrap transition-colors',
                          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                          empty
                            ? 'text-muted-foreground/70 hover:bg-muted'
                            : 'text-foreground hover:bg-primary/10',
                          current && 'bg-primary/15 ring-1 ring-primary/50',
                        )}
                      >
                        {empty ? `– ${t('library.comboEmpty')}` : '✓'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t('library.comboHint')}</p>
    </div>
  )
}
