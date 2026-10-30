import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons'
import type { NAIMetadata } from '@/lib/nai-metadata'
import type {
  ImportSelection,
  ImportSettingKey,
  NaiImportParams,
} from '@/lib/nai-import'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import {
  IMPORT_SETTINGS_OPT_IN,
  IMPORT_SETTING_KEYS,
  availableSettings,
  defaultImportSelection,
  naiMetadataToParams,
  naiMetadataToPrompts,
} from '@/lib/nai-import'
import { getUcPresetLabel } from '@/lib/nai-metadata'
import {
  DEFAULT_NAI_MODEL,
  NAI_MODELS,
  isVarietyPlusOn,
} from '@/lib/nai-models'

export function useMetadataImport(metadata: NAIMetadata) {
  const imported = useMemo(() => naiMetadataToParams(metadata), [metadata])
  const [selection, setSelection] = useState<ImportSelection>(() =>
    defaultImportSelection(naiMetadataToParams(metadata)),
  )
  return { imported, selection, setSelection }
}

type Params = Record<string, unknown>

function modelName(id: unknown): string {
  return NAI_MODELS.find((m) => m.id === id)?.name ?? String(id)
}

function valueText(
  key: ImportSettingKey,
  p: Params,
  t: (k: any, o?: any) => string,
): string {
  switch (key) {
    case 'model':
      return modelName(p.model ?? DEFAULT_NAI_MODEL)
    case 'size':
      return `${p.width ?? 832} × ${p.height ?? 1216}`
    case 'steps':
      return String(p.steps ?? 28)
    case 'scale':
      return String(p.scale ?? 5)
    case 'cfgRescale':
      return String(p.cfgRescale ?? 0)
    case 'sampler':
      return String(p.sampler ?? 'k_euler_ancestral')
    case 'scheduler':
      return String(p.scheduler ?? 'karras')
    case 'ucPreset':
      return getUcPresetLabel(Number(p.ucPreset ?? 0))
    case 'smea':
      return p.smeaDyn === true
        ? 'SMEA + DYN'
        : p.smea === true
          ? 'SMEA'
          : t('metadataImport.off')
    case 'varietyPlus': {
      const model = String(p.model ?? DEFAULT_NAI_MODEL)
      const on = isVarietyPlusOn(
        model,
        typeof p.varietyPlus === 'boolean' ? p.varietyPlus : undefined,
      )
      return on ? t('metadataImport.on') : t('metadataImport.off')
    }
    case 'decrisp':
      return p.decrisp === true
        ? t('metadataImport.on')
        : t('metadataImport.off')
    case 'seed':
      return p.seed != null ? String(p.seed) : t('metadataImport.seedRandom')
  }
}

function SettingRow({
  settingKey,
  checked,
  onChange,
  current,
  imported,
  extra,
}: {
  settingKey: ImportSettingKey
  checked: boolean
  onChange: (v: boolean) => void
  current: Params
  imported: Params
  extra?: React.ReactNode
}) {
  const { t } = useTranslation()
  const cur = valueText(settingKey, current, t)
  const next = valueText(settingKey, imported, t)
  const same = cur === next
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5 shrink-0"
        data-import-setting={settingKey}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm">{t(`metadataImport.${settingKey}`)}</span>
          <span className="min-w-0 break-all font-mono text-xs text-muted-foreground">
            {same ? (
              <>
                {next}{' '}
                <span className="opacity-60">({t('metadataImport.same')})</span>
              </>
            ) : (
              <>
                {cur} <span className="opacity-60">→</span>{' '}
                <span className="text-foreground">{next}</span>
              </>
            )}
          </span>
        </div>
        {extra}
      </div>
    </label>
  )
}

function Group({
  title,
  open,
  onOpenChange,
  lead,
  children,
  summary,
}: {
  title: string
  open: boolean
  onOpenChange: (v: boolean) => void
  lead?: React.ReactNode
  summary?: React.ReactNode
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="rounded-md border">
      <div className="flex items-center gap-2 px-3 py-2">
        {lead}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${t('metadataImport.toggleGroup')}: ${title}`}
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <HugeiconsIcon
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="text-sm font-medium">{title}</span>
          {summary}
        </button>
      </div>
      {open && <div className="space-y-0.5 border-t px-3 py-2">{children}</div>}
    </section>
  )
}

function PromptRow({
  checked,
  onChange,
  label,
  preview,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  preview?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 overflow-hidden py-1">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <span className="text-sm">{label}</span>
        {preview && (
          <p className="mt-0.5 line-clamp-2 break-all text-xs text-muted-foreground">
            {preview}
          </p>
        )}
      </div>
    </label>
  )
}

export function MetadataImportOptions({
  metadata,
  imported,
  selection,
  onChange,
  currentParameters,
}: {
  metadata: NAIMetadata
  imported: NaiImportParams
  selection: ImportSelection
  onChange: (next: ImportSelection) => void
  /** Existing parameters (Quick Generate); empty = app defaults. */
  currentParameters?: Params
}) {
  const { t } = useTranslation()
  const [promptsOpen, setPromptsOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const prompts = useMemo(() => naiMetadataToPrompts(metadata), [metadata])
  const current = currentParameters ?? {}
  const avail = useMemo(() => availableSettings(imported), [imported])
  const synced = avail.filter((k) => !IMPORT_SETTINGS_OPT_IN.includes(k))
  const syncedOn = synced.filter((k) => selection.settings[k]).length
  const model = imported.model

  function setSetting(k: ImportSettingKey, v: boolean) {
    onChange({ ...selection, settings: { ...selection.settings, [k]: v } })
  }
  function setAll(v: boolean) {
    const settings = { ...selection.settings }
    for (const k of synced) settings[k] = v
    onChange({ ...selection, settings })
  }

  const modelLabel = model
    ? [
        t('metadataImport.detected', { name: model.name }),
        model.assumed === 'full' && t('metadataImport.fullAssumed'),
        model.assumed === 'anime' && t('metadataImport.animeAssumed'),
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <div className="space-y-2" data-metadata-import-options>
      <Group
        title={t('metadataImport.prompts')}
        open={promptsOpen}
        onOpenChange={setPromptsOpen}
      >
        <PromptRow
          checked={selection.generalPrompt}
          onChange={(v) => onChange({ ...selection, generalPrompt: v })}
          label={t('metadataImport.positive')}
          preview={prompts.generalPrompt || undefined}
        />
        <PromptRow
          checked={selection.negativePrompt}
          onChange={(v) => onChange({ ...selection, negativePrompt: v })}
          label={t('metadataImport.negative')}
          preview={prompts.negativePrompt || undefined}
        />
        {prompts.characters.length > 0 && (
          <PromptRow
            checked={selection.characters}
            onChange={(v) => onChange({ ...selection, characters: v })}
            label={t('metadataImport.characters', {
              count: prompts.characters.length,
            })}
            preview={prompts.characters.map((c) => c.prompt).join(' | ')}
          />
        )}
      </Group>

      <Group
        title={t('metadataImport.syncAll')}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        lead={
          <Checkbox
            checked={synced.length > 0 && syncedOn === synced.length}
            disabled={synced.length === 0}
            onCheckedChange={(v) => setAll(v === true)}
            aria-label={t('metadataImport.syncAll')}
            data-import-sync-all
          />
        }
        summary={
          <Badge variant="secondary" className="ml-1 font-normal">
            {syncedOn}/{synced.length}
          </Badge>
        }
      >
        {IMPORT_SETTING_KEYS.filter((k) => avail.includes(k)).map((k) => (
          <SettingRow
            key={k}
            settingKey={k}
            checked={selection.settings[k]}
            onChange={(v) => setSetting(k, v)}
            current={current}
            imported={imported.parameters}
            extra={
              k === 'model' && modelLabel ? (
                <p
                  className={cn(
                    'text-xs',
                    model?.assumed || model?.confidence === 'low'
                      ? 'text-primary'
                      : 'text-muted-foreground',
                  )}
                  data-model-detected
                >
                  {modelLabel}
                  {model?.confidence === 'low' &&
                    ` · ${t('metadataImport.lowConfidence')}`}
                </p>
              ) : undefined
            }
          />
        ))}
      </Group>

      {!model && (
        <p
          className="flex items-start gap-1.5 text-xs text-muted-foreground"
          data-model-unknown
        >
          <HugeiconsIcon
            icon={AlertCircleIcon}
            className="mt-0.5 size-3.5 shrink-0"
          />
          {t('metadataImport.modelUnknown')}
        </p>
      )}
      {imported.skipped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('metadataImport.skipped', { list: imported.skipped.join(', ') })}
        </p>
      )}
    </div>
  )
}
