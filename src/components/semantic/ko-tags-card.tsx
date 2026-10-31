import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDataset } from '@/components/data/use-data-files'
import { useTranslation } from '@/lib/i18n'

/** Settings > Tag search: pointer to the Korean tag data row in Settings > Data. */
export function KoTagsCard() {
  const { t } = useTranslation()
  const ko = useDataset('ko')
  const text =
    ko?.installedVersion != null
      ? t('data.stateInstalled')
      : t('data.stateNotInstalled')
  return (
    <Card data-ko-tags-card>
      <CardHeader>
        <CardTitle>{t('koTags.title')}</CardTitle>
        <CardDescription>{t('koTags.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="text-sm text-muted-foreground"
          data-ko-tags-status={
            ko?.installedVersion != null ? 'ready' : 'missing'
          }
        >
          {text}
        </span>
        <Button size="sm" variant="outline" asChild>
          <a href="#settings-data">{t('data.needOpenSettings')}</a>
        </Button>
      </CardContent>
    </Card>
  )
}
