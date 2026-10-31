import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getKoTagsStatus } from '@/server/functions/tag-assist'
import { NAIA_REPO_URL } from '@/lib/ko-tags'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Settings > Tag search: status of the Korean tag data (NAIA2.0) + credit. */
export function KoTagsCard() {
  const { t } = useTranslation()
  const { data: s } = useQuery({
    queryKey: ['ko-tags-status'],
    queryFn: () => getKoTagsStatus(),
    // keep polling while the background download may still be running
    refetchInterval: (q) => (q.state.data?.state === 'ready' ? false : 4000),
  })
  const text =
    s?.state === 'ready'
      ? t('koTags.statusReady', { count: s.tags.toLocaleString() })
      : s?.state === 'unavailable'
        ? t('koTags.statusUnavailable')
        : t('koTags.statusDownloading')
  return (
    <Card data-ko-tags-card>
      <CardHeader>
        <CardTitle>{t('koTags.title')}</CardTitle>
        <CardDescription>{t('koTags.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
          {(!s || s.state === 'downloading') && (
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-4 animate-spin text-muted-foreground"
            />
          )}
          <span
            className={cn(s?.state === 'ready' && 'text-primary')}
            data-ko-tags-status={s?.state ?? 'loading'}
          >
            {text}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('koTags.attribution')}{' '}
          <a
            href={NAIA_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {t('koTags.source')}
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
