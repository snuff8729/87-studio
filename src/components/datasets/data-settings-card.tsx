import { useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { useDataActions, useDataStatus } from './use-data-files'
import type { DatasetStatus } from '@/server/functions/data'
import type { DatasetKey } from '@/lib/data-manifest'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { useTranslation } from '@/lib/i18n'
import { formatBytes } from '@/lib/data-manifest'
import { cn } from '@/lib/utils'

const NAME_KEY = {
  danbooru: 'data.danbooruName',
  ko: 'data.koName',
  semantic: 'data.semanticName',
} as const
const PURPOSE_KEY = {
  danbooru: 'data.danbooruPurpose',
  ko: 'data.koPurpose',
  semantic: 'data.semanticPurpose',
} as const

function DataRow({
  d,
  onDelete,
}: {
  d: DatasetStatus
  onDelete: (key: DatasetKey) => void
}) {
  const { t } = useTranslation()
  const { install, cancel } = useDataActions()
  const blocked = d.missing.length > 0
  const downloading = d.state === 'downloading'
  const installed = d.installedVersion != null

  const stateText =
    d.state === 'notInstalled'
      ? t('data.stateNotInstalled')
      : d.state === 'downloading'
        ? d.pct != null
          ? t('data.stateDownloading', { pct: d.pct })
          : t('data.stateDownloadingNoPct')
        : d.state === 'installed'
          ? t('data.stateInstalled')
          : d.state === 'updateAvailable'
            ? t('data.stateUpdate', { version: d.latestVersion ?? '' })
            : t('data.stateError', { message: d.error ?? '' })

  const sizeText =
    d.key === 'semantic'
      ? t('data.semanticSize', { size: formatBytes(d.size) })
      : formatBytes(d.size)

  const start = () => install.mutate(d.key)

  return (
    <div
      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
      data-dataset={d.key}
      data-state={d.state}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{t(NAME_KEY[d.key])}</span>
          <span className="text-xs text-muted-foreground">{sizeText}</span>
          {installed && (
            <span className="text-xs text-muted-foreground">
              {t('data.installedVersion', {
                version: d.installedVersion ?? '',
              })}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t(PURPOSE_KEY[d.key])}</p>
        <div
          className={cn(
            'flex items-center gap-1.5 text-xs',
            d.state === 'installed' && 'text-emerald-400',
            d.state === 'updateAvailable' && 'text-amber-400',
            d.state === 'error' && 'text-destructive',
            (d.state === 'notInstalled' || downloading) &&
              'text-muted-foreground',
          )}
          data-dataset-state-text
        >
          {downloading && (
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-3.5 animate-spin"
            />
          )}
          <span className="min-w-0 break-words">{stateText}</span>
        </div>
        {blocked && !installed && (
          <p className="text-xs text-muted-foreground" data-dataset-needs>
            {t('data.needsDanbooru')}
          </p>
        )}
        {downloading && d.pct != null && (
          <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-brand-gradient transition-[width]"
              style={{ width: `${d.pct}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {downloading ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => cancel.mutate(d.key)}
            data-dataset-cancel
          >
            {t('data.cancel')}
          </Button>
        ) : (
          <>
            {(d.state === 'notInstalled' ||
              (d.state === 'error' && !installed)) && (
              <Button
                size="sm"
                disabled={blocked || install.isPending}
                onClick={start}
                data-dataset-install
              >
                {t('data.install')}
              </Button>
            )}
            {d.state === 'updateAvailable' && (
              <Button
                size="sm"
                disabled={blocked || install.isPending}
                onClick={start}
                data-dataset-update
              >
                {t('data.update')}
              </Button>
            )}
            {installed && (d.state === 'installed' || d.state === 'error') && (
              <Button
                size="sm"
                variant="outline"
                disabled={install.isPending}
                onClick={start}
                title={t('data.redownloadHint')}
                data-dataset-redownload
              >
                {t('data.redownload')}
              </Button>
            )}
            {installed && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDelete(d.key)}
                data-dataset-delete
              >
                {t('data.delete')}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Settings > Data: one row per optional dataset + update check. */
export function DataSettingsCard({ id }: { id: string }) {
  const { t, locale } = useTranslation()
  const { data: s } = useDataStatus()
  const { remove, check } = useDataActions()
  const [deleting, setDeleting] = useState<DatasetKey | null>(null)

  const checked = s?.checkedAt
    ? t('data.lastChecked', {
        time: new Date(s.checkedAt).toLocaleString(
          locale === 'ko' ? 'ko-KR' : 'en-US',
        ),
      })
    : t('data.neverChecked')

  return (
    <section id={id} className="scroll-mt-28" data-data-card>
      <Card>
        <CardHeader>
          <CardTitle>{t('data.title')}</CardTitle>
          <CardDescription>{t('data.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y">
            {s?.datasets.map((d) => (
              <DataRow key={d.key} d={d} onDelete={setDeleting} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
            <div className="min-w-0 space-y-0.5">
              <div data-data-checked>{checked}</div>
              {s?.source === 'builtin' && s.checkedAt && (
                <div>{t('data.builtinNote')}</div>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={check.isPending}
              onClick={() => check.mutate()}
              data-data-check
            >
              {check.isPending ? t('data.checking') : t('data.checkUpdates')}
            </Button>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('data.deleteTitle', {
          name: deleting ? t(NAME_KEY[deleting]) : '',
        })}
        description={
          deleting === 'danbooru'
            ? t('data.deleteDanbooruDesc')
            : t('data.deleteDesc')
        }
        actionLabel={t('data.delete')}
        onConfirm={async () => {
          if (!deleting) return
          await remove.mutateAsync(deleting)
          toast.success(t('data.deleted'))
        }}
      />
    </section>
  )
}
