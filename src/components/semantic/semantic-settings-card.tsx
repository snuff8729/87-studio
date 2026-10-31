import { useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import {
  isSemanticBusy,
  semanticStatusText,
  useSemanticActions,
  useSemanticStatus,
} from './use-semantic'
import { KoTagsCard } from './ko-tags-card'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function fmtBytes(n: number): string {
  if (n <= 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

/** Settings > Tag search: manual on/off, status, files. */
export function SemanticSettingsCard({ id }: { id: string }) {
  const { t } = useTranslation()
  const { data: s } = useSemanticStatus()
  const { toggle, remove } = useSemanticActions()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const busy = isSemanticBusy(s)
  const hasFiles = !!s && (s.indexDownloaded || s.modelBytes > 0)

  return (
    <section id={id} className="scroll-mt-28 space-y-4" data-semantic-card>
      <Card>
        <CardHeader>
          <CardTitle>{t('semantic.title')}</CardTitle>
          <CardDescription>{t('semantic.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="semantic-switch" className="text-sm font-medium">
                {t('semantic.switchLabel')}
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('semantic.switchHint')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('semantic.terms')}{' '}
                <a
                  href="https://ai.google.dev/gemma/terms"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {t('semantic.termsLink')}
                </a>
              </p>
            </div>
            <Switch
              id="semantic-switch"
              checked={!!s?.enabled}
              disabled={!s || toggle.isPending}
              onCheckedChange={(v) => toggle.mutate(v)}
              data-semantic-switch
            />
          </div>

          <div
            className="space-y-2 rounded-md bg-muted/50 px-3 py-2"
            data-semantic-status
            data-semantic-phase={s?.phase ?? 'off'}
          >
            <div className="flex items-center gap-2 text-sm">
              {busy && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  className="size-4 animate-spin text-muted-foreground"
                />
              )}
              <span
                className={cn(
                  'min-w-0 flex-1 break-words',
                  s?.phase === 'error' && 'text-destructive',
                  s?.phase === 'ready' && 'text-primary',
                )}
                data-semantic-status-text
              >
                {semanticStatusText(t, s)}
              </span>
              {s?.phase === 'error' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(true)}
                  data-semantic-retry
                >
                  {t('semantic.retry')}
                </Button>
              )}
            </div>
            {busy && s?.pct != null && (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-brand-gradient transition-[width]"
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span data-semantic-files>
              {hasFiles && s
                ? t('semantic.filesValue', {
                    model: fmtBytes(s.modelBytes),
                    index: fmtBytes(s.indexBytes),
                    count: s.count,
                  })
                : t('semantic.filesNone')}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasFiles || remove.isPending}
              onClick={() => setConfirmDelete(true)}
              data-semantic-delete
            >
              {t('semantic.deleteFiles')}
            </Button>
          </div>
          {s?.dbMismatch && (
            <p className="text-xs text-muted-foreground">
              {t('semantic.dbMismatch')}
            </p>
          )}
        </CardContent>
      </Card>
      <KoTagsCard />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('semantic.deleteConfirmTitle')}
        description={t('semantic.deleteConfirmDesc')}
        actionLabel={t('semantic.deleteFiles')}
        onConfirm={async () => {
          await remove.mutateAsync()
          toast.success(t('semantic.deleted'))
        }}
      />
    </section>
  )
}
