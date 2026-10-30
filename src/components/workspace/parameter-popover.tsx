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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import {
  DEFAULT_NAI_MODEL,
  NAI_MODELS,
  isDdimSampler,
  isVarietyPlusOn,
  supportsDecrisp,
  supportsSmea,
  supportsVarietyPlus,
} from '@/lib/nai-models'
import { DEFAULT_FILENAME_TEMPLATE } from '@/server/services/download'

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
  model: 'params.modelHelp',
  resolution: 'params.resolutionHelp',
  steps: 'params.stepsHelp',
  scale: 'params.scaleHelp',
  cfgRescale: 'params.cfgRescaleHelp',
  sampler: 'params.samplerHelp',
  scheduler: 'params.schedulerHelp',
  ucPreset: 'params.ucPresetHelp',
  seed: 'params.seedHelp',
  smea: 'params.smeaHelp',
  smeaDyn: 'params.smeaDynHelp',
  varietyPlus: 'params.varietyPlusHelp',
  decrisp: 'params.decrispHelp',
  randomResolution: 'params.randomResolutionHelp',
}

function ParamLabel({
  name,
  label,
  value,
}: {
  name: string
  label: string
  value?: string | number
}) {
  const { t } = useTranslation()
  const helpKey = PARAM_HELP[name]
  const help = helpKey ? t(helpKey as any) : undefined
  const labelEl = (
    <div className="flex items-center justify-between">
      {help ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Label className="text-sm cursor-help border-b border-dashed border-muted-foreground/40">
              {label}
            </Label>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-52">
            <p className="text-sm">{help}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Label className="text-sm">{label}</Label>
      )}
      {value !== undefined && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {value}
        </span>
      )}
    </div>
  )
  return labelEl
}

function ToggleRow({
  id,
  name,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string
  name: string
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className={cn('flex items-center gap-2', disabled && 'opacity-50')}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v === true)}
      />
      <ParamLabel name={name} label={label} />
    </div>
  )
}

// --- Shared form ---
export interface ParameterFormProps {
  localParams: Record<string, unknown>
  set: (key: string, value: unknown) => void
}

export function ParameterForm({ localParams, set }: ParameterFormProps) {
  const { t } = useTranslation()
  const w = Number(localParams.width ?? 832)
  const h = Number(localParams.height ?? 1216)
  const steps = Number(localParams.steps ?? 28)
  const scale = Number(localParams.scale ?? 5)
  const cfgRescale = Number(localParams.cfgRescale ?? 0)

  const model = String(localParams.model ?? DEFAULT_NAI_MODEL)
  const sampler = String(localParams.sampler ?? 'k_euler_ancestral')
  const randomRes = localParams.randomResolution === true
  const showSmea = supportsSmea(model)
  const ddim = isDdimSampler(sampler)
  const smeaDyn = localParams.smeaDyn === true
  const smea = localParams.smea === true || smeaDyn
  const showVarPlus = supportsVarietyPlus(model)
  const varPlus = isVarietyPlusOn(
    model,
    typeof localParams.varietyPlus === 'boolean'
      ? localParams.varietyPlus
      : undefined,
  )
  const showDecrisp = supportsDecrisp(model)

  const activePreset = RESOLUTION_PRESETS.find((p) => p.w === w && p.h === h)

  return (
    <div className="space-y-4">
      {/* Model */}
      <section className="space-y-1.5">
        <ParamLabel name="model" label={t('params.model')} />
        <Select
          value={String(localParams.model ?? DEFAULT_NAI_MODEL)}
          onValueChange={(v) => set('model', v)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NAI_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <hr className="border-border" />

      {/* Resolution */}
      <section className="space-y-2.5">
        <ParamLabel
          name="resolution"
          label={t('params.resolution')}
          value={`${w} × ${h}`}
        />
        <div className="flex flex-wrap gap-1.5">
          {RESOLUTION_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={randomRes}
              onClick={() => {
                set('width', p.w)
                set('height', p.h)
              }}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
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
            <Label className="text-xs text-muted-foreground">
              {t('params.width')}
            </Label>
            <Input
              type="number"
              min={64}
              max={1856}
              step={64}
              value={String(w)}
              disabled={randomRes}
              onChange={(e) => set('width', Number(e.target.value))}
              className="h-8 text-sm tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t('params.height')}
            </Label>
            <Input
              type="number"
              min={64}
              max={2624}
              step={64}
              value={String(h)}
              disabled={randomRes}
              onChange={(e) => set('height', Number(e.target.value))}
              className="h-8 text-sm tabular-nums"
            />
          </div>
        </div>
        <ToggleRow
          id="random-resolution"
          name="randomResolution"
          label={t('params.randomResolution')}
          checked={randomRes}
          onChange={(v) => set('randomResolution', v)}
        />
        {randomRes && (
          <p className="text-xs text-muted-foreground">
            {t('params.randomResolutionNote')}
          </p>
        )}
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
          <ParamLabel
            name="cfgRescale"
            label={t('params.cfgRescale')}
            value={cfgRescale}
          />
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[cfgRescale]}
            onValueChange={([v]) =>
              set('cfgRescale', Math.round(v * 100) / 100)
            }
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

      {/* Generation options */}
      {(showSmea || showVarPlus || showDecrisp) && (
        <>
          <section className="space-y-2">
            {showSmea && (
              <>
                <ToggleRow
                  id="opt-smea"
                  name="smea"
                  label="SMEA"
                  checked={!ddim && smea}
                  disabled={ddim}
                  onChange={(v) => {
                    set('smea', v)
                    if (!v) set('smeaDyn', false)
                  }}
                />
                <ToggleRow
                  id="opt-smea-dyn"
                  name="smeaDyn"
                  label="DYN"
                  checked={!ddim && smeaDyn}
                  disabled={ddim}
                  onChange={(v) => {
                    set('smeaDyn', v)
                    if (v) set('smea', true)
                  }}
                />
              </>
            )}
            {showVarPlus && (
              <ToggleRow
                id="opt-variety-plus"
                name="varietyPlus"
                label="VAR+"
                checked={varPlus}
                onChange={(v) => set('varietyPlus', v)}
              />
            )}
            {showDecrisp && (
              <ToggleRow
                id="opt-decrisp"
                name="decrisp"
                label="DECRISP"
                checked={localParams.decrisp === true}
                onChange={(v) => set('decrisp', v)}
              />
            )}
          </section>

          <hr className="border-border" />
        </>
      )}

      {/* Seed */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="seed-fixed"
            checked={localParams.seed != null}
            onCheckedChange={(checked) => {
              if (checked) {
                set('seed', 0)
              } else {
                set('seed', undefined)
              }
            }}
          />
          <ParamLabel name="seed" label={t('params.seedFixed')} />
        </div>
        {localParams.seed != null ? (
          <Input
            type="number"
            min={0}
            max={4294967295}
            value={String(localParams.seed || 0)}
            onChange={(e) => {
              const v = Math.max(
                0,
                Math.min(4294967295, Math.floor(Number(e.target.value) || 0)),
              )
              set('seed', v)
            }}
            className="h-8 text-sm tabular-nums"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {t('params.seedRandom')}
          </p>
        )}
      </section>

      <hr className="border-border" />

      {/* Download Settings */}
      <section className="space-y-2">
        <Label className="text-sm font-medium">
          {t('export.exportSettings')}
        </Label>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {t('export.filenameTemplate')}
          </Label>
          <Input
            value={String(
              localParams.filenameTemplate ?? DEFAULT_FILENAME_TEMPLATE,
            )}
            onChange={(e) => set('filenameTemplate', e.target.value)}
            placeholder={DEFAULT_FILENAME_TEMPLATE}
            className="h-8 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('export.templateHelp')}
          </p>
        </div>
      </section>
    </div>
  )
}
