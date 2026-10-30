import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import {
  isSemanticBusy,
  semanticStatusText,
  useSemanticActions,
  useSemanticStatus,
} from './use-semantic'
import { Switch } from '@/components/ui/switch'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Compact on/off switch for the Tag Search window (mirrors the setting). */
export function SemanticToggle({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { data: status } = useSemanticStatus()
  const { toggle } = useSemanticActions()
  const busy = isSemanticBusy(status)
  const on = !!status?.enabled
  return (
    <div
      className={cn('flex min-w-0 items-center gap-2 text-xs', className)}
      data-semantic-toggle
      data-semantic-phase={status?.phase ?? 'off'}
    >
      <Switch
        size="sm"
        checked={on}
        disabled={!status || toggle.isPending}
        onCheckedChange={(v) => toggle.mutate(v)}
        aria-label={t('semantic.toggleTitle')}
        title={t('semantic.toggleTitle')}
        data-semantic-switch
      />
      <span className="shrink-0 text-muted-foreground">
        {t('semantic.toggle')}
      </span>
      {busy && (
        <HugeiconsIcon
          icon={Loading03Icon}
          className="size-3.5 shrink-0 animate-spin text-muted-foreground"
        />
      )}
      {on && status && status.phase !== 'ready' && (
        <span
          className={cn(
            'min-w-0 truncate text-[10px]',
            status.phase === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
          title={semanticStatusText(t, status)}
          data-semantic-status-text
        >
          {semanticStatusText(t, status)}
        </span>
      )}
    </div>
  )
}
