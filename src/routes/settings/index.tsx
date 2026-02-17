import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { getSetting, setSetting } from '@/server/functions/settings'
import { useTranslation } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'

export const Route = createFileRoute('/settings/')({
  loader: async () => {
    const [apiKey, delay] = await Promise.all([
      getSetting({ data: 'nai_api_key' }),
      getSetting({ data: 'generation_delay' }),
    ])
    return { apiKey: apiKey ?? '', delay: delay ?? '500' }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { apiKey: initialApiKey, delay: initialDelay } = Route.useLoaderData()
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [showKey, setShowKey] = useState(false)
  const [delay, setDelay] = useState(Number(initialDelay))
  const [saving, setSaving] = useState(false)
  const { t, locale, setLocale } = useTranslation()

  useEffect(() => {
    setApiKey(initialApiKey)
    setDelay(Number(initialDelay))
  }, [initialApiKey, initialDelay])

  async function handleSave() {
    setSaving(true)
    try {
      await Promise.all([
        setSetting({ data: { key: 'nai_api_key', value: apiKey } }),
        setSetting({ data: { key: 'generation_delay', value: String(delay) } }),
      ])
      toast.success(t('settings.saved'))
    } catch {
      toast.error(t('settings.saveFailed'))
    }
    setSaving(false)
  }

  return (
    <div>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.naiApiKey')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="api-key">{t('settings.apiKey')}</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('settings.enterApiKey')}
                />
                <Button variant="outline" onClick={() => setShowKey(!showKey)}>
                  {showKey ? t('common.hide') : t('common.show')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.generationSettings')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-3">
              <Label>
                {t('settings.delayLabel')} <span className="font-mono text-primary">{delay}ms</span>
              </Label>
              <Slider
                value={[delay]}
                onValueChange={([v]) => setDelay(v)}
                min={0}
                max={30000}
                step={100}
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>0ms</span>
                <span>15s</span>
                <span>30s</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.language')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('settings.languageDesc')}</p>
            <div className="flex gap-2">
              {([['en', 'English'], ['ko', '한국어']] as const).map(([code, label]) => (
                <Button
                  key={code}
                  variant={locale === code ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLocale(code as Locale)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? t('common.saving') : t('settings.saveSettings')}
        </Button>
      </div>
    </div>
  )
}
