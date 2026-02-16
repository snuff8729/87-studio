import { HugeiconsIcon } from '@hugeicons/react'
import { Settings02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const PARAM_HELP: Record<string, string> = {
  width: 'Image width in pixels (default: 832)',
  height: 'Image height in pixels (default: 1216)',
  steps: 'Denoising steps. Higher = better quality, slower (default: 28)',
  cfg_scale: 'CFG Scale. Prompt adherence strength (default: 5)',
  cfg_rescale: 'CFG Rescale. Prevents color bleed (default: 0)',
  sampler: 'Sampler algorithm',
  scheduler: 'Noise scheduler',
  ucPreset: 'Undesired Content preset (0=Heavy, 1=Light, 2=Furry, 3=Human, 4=None)',
  smea: 'SMEA: Resolution-adaptive sampling for composition stability',
  smea_dyn: 'SMEA Dynamic: More varied compositions',
  qualityToggle: 'Auto quality tags (masterpiece, best quality, etc.)',
}

function ParamLabel({ name, label }: { name: string; label: string }) {
  const help = PARAM_HELP[name]
  if (!help) return <Label className="text-xs">{label}</Label>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Label className="text-xs cursor-help border-b border-dashed border-muted-foreground/40">{label}</Label>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-52">
        <p className="text-xs">{help}</p>
      </TooltipContent>
    </Tooltip>
  )
}

interface ParameterPopoverProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

export function ParameterPopover({ params, onChange }: ParameterPopoverProps) {
  function set(key: string, value: unknown) {
    onChange({ ...params, [key]: value })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <HugeiconsIcon icon={Settings02Icon} className="size-3.5" />
          <span className="hidden sm:inline">Parameters</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 max-h-[60vh] overflow-y-auto">
        <h4 className="text-sm font-medium mb-3">Generation Parameters</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <ParamLabel name="width" label="Width" />
            <Input
              type="number"
              min={64}
              max={1856}
              step={64}
              value={String(params.width ?? 832)}
              onChange={(e) => set('width', Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <ParamLabel name="height" label="Height" />
            <Input
              type="number"
              min={64}
              max={2624}
              step={64}
              value={String(params.height ?? 1216)}
              onChange={(e) => set('height', Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <ParamLabel name="steps" label="Steps" />
            <Input
              type="number"
              min={1}
              max={50}
              value={String(params.steps ?? 28)}
              onChange={(e) => set('steps', Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <ParamLabel name="cfg_scale" label="CFG Scale" />
            <Input
              type="number"
              min={0}
              max={20}
              step={0.1}
              value={String(params.cfg_scale ?? 5)}
              onChange={(e) => set('cfg_scale', Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <ParamLabel name="cfg_rescale" label="CFG Rescale" />
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={String(params.cfg_rescale ?? 0)}
              onChange={(e) => set('cfg_rescale', Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <ParamLabel name="sampler" label="Sampler" />
            <Select
              value={String(params.sampler ?? 'k_euler_ancestral')}
              onValueChange={(v) => set('sampler', v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="k_euler_ancestral">k_euler_ancestral</SelectItem>
                <SelectItem value="k_euler">k_euler</SelectItem>
                <SelectItem value="k_dpmpp_2s_ancestral">k_dpmpp_2s_ancestral</SelectItem>
                <SelectItem value="k_dpmpp_2m">k_dpmpp_2m</SelectItem>
                <SelectItem value="k_dpmpp_sde">k_dpmpp_sde</SelectItem>
                <SelectItem value="ddim_v3">ddim_v3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <ParamLabel name="scheduler" label="Scheduler" />
            <Select
              value={String(params.scheduler ?? 'native')}
              onValueChange={(v) => set('scheduler', v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">native</SelectItem>
                <SelectItem value="karras">karras</SelectItem>
                <SelectItem value="exponential">exponential</SelectItem>
                <SelectItem value="polyexponential">polyexponential</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <ParamLabel name="ucPreset" label="UC Preset" />
            <Select
              value={String(params.ucPreset ?? 3)}
              onValueChange={(v) => set('ucPreset', Number(v))}
            >
              <SelectTrigger className="h-7 text-xs">
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
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="param-smea"
              checked={Boolean(params.smea)}
              onCheckedChange={(checked) => set('smea', checked)}
            />
            <ParamLabel name="smea" label="SMEA" />
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="param-smea-dyn"
              checked={Boolean(params.smea_dyn)}
              onCheckedChange={(checked) => set('smea_dyn', checked)}
            />
            <ParamLabel name="smea_dyn" label="SMEA Dyn" />
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="param-quality"
              checked={Boolean(params.qualityToggle ?? true)}
              onCheckedChange={(checked) => set('qualityToggle', checked)}
            />
            <ParamLabel name="qualityToggle" label="Quality Tags" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
