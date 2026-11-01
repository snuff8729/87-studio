import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import type { StyleParams } from '@/lib/style-bundles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ParamLabel,
  RESOLUTION_PRESETS,
  SAMPLER_OPTIONS,
  SCHEDULER_OPTIONS,
} from '@/components/workspace/parameter-popover'
import { useTranslation } from '@/lib/i18n'

/**
 * Generation settings stored in a style bundle. Same controls and ranges as
 * the Params tab; an unset item (shown as "—") means the project value is used.
 */
export function StyleSettingsForm({
  value,
  onChange,
}: {
  value: StyleParams
  onChange: (next: StyleParams) => void
}) {
  const { t } = useTranslation()
  const patch = (p: Partial<StyleParams>) => onChange({ ...value, ...p })
  const clear = (...keys: Array<keyof StyleParams>) => {
    const next = { ...value }
    for (const k of keys) delete next[k]
    onChange(next)
  }
  const unset = '—'

  const w = value.width
  const h = value.height
  const hasRes = w != null && h != null
  const activePreset = hasRes
    ? RESOLUTION_PRESETS.find((p) => p.w === w && p.h === h)
    : undefined

  /** Small ✕ that clears an item (back to "use the project value") */
  const clearBtn = (keys: Array<keyof StyleParams>, isSet: boolean) =>
    isSet ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('bundles.styleClear')}
            data-style-clear={keys[0]}
            onClick={() => clear(...keys)}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('bundles.styleClear')}</TooltipContent>
      </Tooltip>
    ) : null

  return (
    <div className="space-y-4" data-style-settings>
      {/* Resolution */}
      <section className="space-y-2">
        <ParamLabel
          name="resolution"
          label={t('params.resolution')}
          value={hasRes ? `${w} × ${h}` : unset}
          trailing={clearBtn(['width', 'height'], hasRes)}
        />
        <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-2">
          <Input
            type="number"
            min={64}
            max={1856}
            step={64}
            value={w != null ? String(w) : ''}
            placeholder={t('params.width')}
            aria-label={t('params.width')}
            data-style-width
            onChange={(e) =>
              e.target.value === ''
                ? clear('width')
                : patch({ width: Number(e.target.value) })
            }
            className="h-8 text-sm tabular-nums"
          />
          <Input
            type="number"
            min={64}
            max={2624}
            step={64}
            value={h != null ? String(h) : ''}
            placeholder={t('params.height')}
            aria-label={t('params.height')}
            data-style-height
            onChange={(e) =>
              e.target.value === ''
                ? clear('height')
                : patch({ height: Number(e.target.value) })
            }
            className="h-8 text-sm tabular-nums"
          />
          <Select
            value={activePreset?.key ?? ''}
            onValueChange={(key) => {
              const p = RESOLUTION_PRESETS.find((x) => x.key === key)
              if (p) patch({ width: p.w, height: p.h })
            }}
          >
            <SelectTrigger className="h-8 text-sm" aria-label="Preset">
              <SelectValue placeholder={t('bundles.styleCustomSize')} />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTION_PRESETS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {t(`params.${p.key}` as any)} · {p.w}×{p.h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-2">
          <ParamLabel
            name="steps"
            label={t('params.steps')}
            value={value.steps ?? unset}
            trailing={clearBtn(['steps'], value.steps != null)}
          />
          <Slider
            min={1}
            max={50}
            step={1}
            value={[value.steps ?? 28]}
            onValueChange={([v]) => patch({ steps: v })}
            className={value.steps == null ? 'opacity-50' : undefined}
          />
        </div>
        <div className="space-y-2">
          <ParamLabel
            name="scale"
            label={t('params.scale')}
            value={value.scale ?? unset}
            trailing={clearBtn(['scale'], value.scale != null)}
          />
          <Slider
            min={0}
            max={20}
            step={0.1}
            value={[value.scale ?? 5]}
            onValueChange={([v]) => patch({ scale: Math.round(v * 10) / 10 })}
            className={value.scale == null ? 'opacity-50' : undefined}
          />
        </div>
        <div className="space-y-2">
          <ParamLabel
            name="cfgRescale"
            label={t('params.cfgRescale')}
            value={value.cfgRescale ?? unset}
            trailing={clearBtn(['cfgRescale'], value.cfgRescale != null)}
          />
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[value.cfgRescale ?? 0]}
            onValueChange={([v]) =>
              patch({ cfgRescale: Math.round(v * 100) / 100 })
            }
            className={value.cfgRescale == null ? 'opacity-50' : undefined}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('params.sampler')}</Label>
            {clearBtn(['sampler'], value.sampler != null)}
          </div>
          <Select
            value={value.sampler ?? ''}
            onValueChange={(v) => patch({ sampler: v })}
          >
            <SelectTrigger className="h-8 text-sm" data-style-sampler>
              <SelectValue placeholder={unset} />
            </SelectTrigger>
            <SelectContent>
              {SAMPLER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('params.scheduler')}</Label>
            {clearBtn(['scheduler'], value.scheduler != null)}
          </div>
          <Select
            value={value.scheduler ?? ''}
            onValueChange={(v) => patch({ scheduler: v })}
          >
            <SelectTrigger className="h-8 text-sm" data-style-scheduler>
              <SelectValue placeholder={unset} />
            </SelectTrigger>
            <SelectContent>
              {SCHEDULER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>
    </div>
  )
}
