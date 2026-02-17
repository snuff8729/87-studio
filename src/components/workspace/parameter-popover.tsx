import { memo, useState, useSyncExternalStore, useCallback } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Settings02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { DEFAULT_FILENAME_TEMPLATE } from '@/server/services/download'

// --- useIsMobile hook ---
const MOBILE_QUERY = '(max-width: 639px)'
function subscribe(cb: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}
function getSnapshot() { return window.matchMedia(MOBILE_QUERY).matches }
function getServerSnapshot() { return false }
function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// --- Resolution presets ---
const RESOLUTION_PRESETS = [
  { key: 'portrait' as const, w: 832, h: 1216 },
  { key: 'landscape' as const, w: 1216, h: 832 },
  { key: 'square' as const, w: 1024, h: 1024 },
  { key: 'wide' as const, w: 1472, h: 832 },
  { key: 'tall' as const, w: 832, h: 1472 },
] as const

// --- Param label with tooltip ---
const PARAM_HELP: Record<string, string> = {
  resolution: 'params.resolutionHelp',
  steps: 'params.stepsHelp',
  scale: 'params.scaleHelp',
  cfgRescale: 'params.cfgRescaleHelp',
  sampler: 'params.samplerHelp',
  scheduler: 'params.schedulerHelp',
  ucPreset: 'params.ucPresetHelp',
}

function ParamLabel({ name, label, value }: { name: string; label: string; value?: string | number }) {
  const { t } = useTranslation()
  const helpKey = PARAM_HELP[name]
  const help = helpKey ? t(helpKey as any) : undefined
  const labelEl = (
    <div className="flex items-center justify-between">
      {help ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Label className="text-sm cursor-help border-b border-dashed border-muted-foreground/40">{label}</Label>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-52">
            <p className="text-sm">{help}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Label className="text-sm">{label}</Label>
      )}
      {value !== undefined && (
        <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
      )}
    </div>
  )
  return labelEl
}

// --- Shared form ---
function ParameterForm({
  localParams,
  set,
}: {
  localParams: Record<string, unknown>
  set: (key: string, value: unknown) => void
}) {
  const { t } = useTranslation()
  const w = Number(localParams.width ?? 832)
  const h = Number(localParams.height ?? 1216)
  const steps = Number(localParams.steps ?? 28)
  const scale = Number(localParams.scale ?? 5)
  const cfgRescale = Number(localParams.cfgRescale ?? 0)

  const activePreset = RESOLUTION_PRESETS.find((p) => p.w === w && p.h === h)

  return (
    <div className="space-y-4">
      {/* Resolution */}
      <section className="space-y-2.5">
        <ParamLabel name="resolution" label={t('params.resolution')} value={`${w} × ${h}`} />
        <div className="flex flex-wrap gap-1.5">
          {RESOLUTION_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => { set('width', p.w); set('height', p.h) }}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                activePreset?.key === p.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/60 text-secondary-foreground hover:bg-secondary',
              )}
            >
              {t(`params.${p.key}` as any)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('params.width')}</Label>
            <Input
              type="number"
              min={64}
              max={1856}
              step={64}
              value={String(w)}
              onChange={(e) => set('width', Number(e.target.value))}
              className="h-8 text-sm tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('params.height')}</Label>
            <Input
              type="number"
              min={64}
              max={2624}
              step={64}
              value={String(h)}
              onChange={(e) => set('height', Number(e.target.value))}
              className="h-8 text-sm tabular-nums"
            />
          </div>
        </div>
      </section>

      <hr className="border-border" />

      {/* Quality */}
      <section className="space-y-3">
        <div className="space-y-2">
          <ParamLabel name="steps" label={t('params.steps')} value={steps} />
          <Slider
            min={1}
            max={50}
            step={1}
            value={[steps]}
            onValueChange={([v]) => set('steps', v)}
          />
        </div>
        <div className="space-y-2">
          <ParamLabel name="scale" label={t('params.scale')} value={scale} />
          <Slider
            min={0}
            max={20}
            step={0.1}
            value={[scale]}
            onValueChange={([v]) => set('scale', Math.round(v * 10) / 10)}
          />
        </div>
        <div className="space-y-2">
          <ParamLabel name="cfgRescale" label={t('params.cfgRescale')} value={cfgRescale} />
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[cfgRescale]}
            onValueChange={([v]) => set('cfgRescale', Math.round(v * 100) / 100)}
          />
        </div>
      </section>

      <hr className="border-border" />

      {/* Sampling */}
      <section className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <ParamLabel name="sampler" label={t('params.sampler')} />
          <Select
            value={String(localParams.sampler ?? 'k_euler_ancestral')}
            onValueChange={(v) => set('sampler', v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="k_euler_ancestral">Euler A</SelectItem>
              <SelectItem value="k_euler">Euler</SelectItem>
              <SelectItem value="k_dpmpp_2s_ancestral">DPM++ 2S A</SelectItem>
              <SelectItem value="k_dpmpp_2m">DPM++ 2M</SelectItem>
              <SelectItem value="k_dpmpp_sde">DPM++ SDE</SelectItem>
              <SelectItem value="ddim_v3">DDIM v3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <ParamLabel name="scheduler" label={t('params.scheduler')} />
          <Select
            value={String(localParams.scheduler ?? 'karras')}
            onValueChange={(v) => set('scheduler', v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="native">Native</SelectItem>
              <SelectItem value="karras">Karras</SelectItem>
              <SelectItem value="exponential">Exponential</SelectItem>
              <SelectItem value="polyexponential">Polyexponential</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <ParamLabel name="ucPreset" label={t('params.ucPreset')} />
          <Select
            value={String(localParams.ucPreset ?? 0)}
            onValueChange={(v) => set('ucPreset', Number(v))}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Heavy</SelectItem>
              <SelectItem value="1">Light</SelectItem>
              <SelectItem value="2">Furry</SelectItem>
              <SelectItem value="3">Human Focus</SelectItem>
              <SelectItem value="4">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <hr className="border-border" />

      {/* Download Settings */}
      <section className="space-y-2">
        <Label className="text-sm font-medium">{t('download.downloadSettings')}</Label>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('download.filenameTemplate')}</Label>
          <Input
            value={String(localParams.filenameTemplate ?? DEFAULT_FILENAME_TEMPLATE)}
            onChange={(e) => set('filenameTemplate', e.target.value)}
            placeholder={DEFAULT_FILENAME_TEMPLATE}
            className="h-8 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('download.templateHelp')}
          </p>
        </div>
      </section>
    </div>
  )
}

// --- Main component ---
interface ParameterPopoverProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

export const ParameterPopover = memo(function ParameterPopover({ params, onChange }: ParameterPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [localParams, setLocalParams] = useState(params)
  const isMobile = useIsMobile()

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setLocalParams(params)
    } else {
      onChange(localParams)
    }
    setOpen(isOpen)
  }

  const set = useCallback((key: string, value: unknown) => {
    setLocalParams((prev) => ({ ...prev, [key]: value }))
  }, [])

  const trigger = (
    <Button variant="ghost" size="sm">
      <HugeiconsIcon icon={Settings02Icon} className="size-5" />
      <span className="hidden sm:inline">{t('generation.parameters')}</span>
    </Button>
  )

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="!top-auto !bottom-0 !translate-y-0 !translate-x-[-50%] !rounded-b-none max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('generation.generationParameters')}</DialogTitle>
          </DialogHeader>
          <ParameterForm localParams={localParams} set={set} />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-96 max-h-[70vh] overflow-y-auto">
        <h4 className="text-base font-medium">{t('generation.generationParameters')}</h4>
        <ParameterForm localParams={localParams} set={set} />
      </PopoverContent>
    </Popover>
  )
})
