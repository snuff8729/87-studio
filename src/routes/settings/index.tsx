import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { getSetting, setSetting, validateApiKey } from '@/server/functions/settings'
import { getStorageStats, cleanupOrphanFiles } from '@/server/functions/storage'
import { useTranslation } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import { useOnboardingMaybe } from '@/lib/onboarding'

function PendingComponent() {
  return (
    <div>
      {/* PageHeader */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border">
            <div className="p-6 pb-3">
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="px-6 pb-6 space-y-3">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>
        ))}
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/settings/')({
  loader: async () => {
    const [apiKey, delay] = await Promise.all([
      getSetting({ data: 'nai_api_key' }),
      getSetting({ data: 'generation_delay' }),
    ])
    return { apiKey: apiKey ?? '', delay: delay ?? '500' }
  },
  component: SettingsPage,
  pendingComponent: PendingComponent,
})

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function SettingsPage() {
  const { apiKey: initialApiKey, delay: initialDelay } = Route.useLoaderData()
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [showKey, setShowKey] = useState(false)
  const [delay, setDelay] = useState(Number(initialDelay))
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const { t, locale, setLocale } = useTranslation()
  const onboarding = useOnboardingMaybe()

  function handleRestartTutorial() {
    onboarding?.restart()
  }

  // Storage management state
  const [storageStats, setStorageStats] = useState<Awaited<ReturnType<typeof getStorageStats>> | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)

  useEffect(() => {
    setApiKey(initialApiKey)
    setDelay(Number(initialDelay))
  }, [initialApiKey, initialDelay])

  async function handleScan() {
    setScanning(true)
    try {
      const stats = await getStorageStats()
      setStorageStats(stats)
    } catch {
      toast.error(t('settings.cleanupFailed'))
    }
    setScanning(false)
  }

  async function handleCleanup() {
    setCleaningUp(true)
    try {
      const result = await cleanupOrphanFiles()
      toast.success(t('settings.cleanupSuccess', { count: String(result.deleted) }))
      // Re-scan after cleanup
      const stats = await getStorageStats()
      setStorageStats(stats)
    } catch {
      toast.error(t('settings.cleanupFailed'))
    }
    setCleaningUp(false)
  }

  async function handleValidate() {
    if (!apiKey.trim()) {
      toast.error(t('settings.apiKeyEmpty'))
      return
    }
    setValidating(true)
    try {
      const result = await validateApiKey({ data: apiKey })
      if (result.valid) {
        toast.success(t('settings.apiKeyValid'))
      } else if (result.error === 'unauthorized') {
        toast.error(t('settings.apiKeyInvalid'))
      } else if (result.error === 'network') {
        toast.error(t('settings.apiKeyNetworkError'))
      } else {
        toast.error(t('settings.apiKeyUnknownError'))
      }
    } catch {
      toast.error(t('settings.apiKeyUnknownError'))
    }
    setValidating(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await Promise.all([
        setSetting({ data: { key: 'nai_api_key', value: apiKey } }),
        setSetting({ data: { key: 'generation_delay', value: String(delay) } }),
      ])
      toast.success(t('settings.saved'))
      window.dispatchEvent(new CustomEvent('onboarding:api-key-saved'))
    } catch {
      toast.error(t('settings.saveFailed'))
    }
    setSaving(false)
  }

  return (
    <div>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <div className="max-w-2xl space-y-6">
        <Card data-onboarding="api-key-section">
          <CardHeader>
            <CardTitle>{t('settings.naiApiKey')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="api-key">{t('settings.apiKey')}</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  data-onboarding="api-key-input"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('settings.enterApiKey')}
                />
                <Button variant="outline" onClick={() => setShowKey(!showKey)}>
                  {showKey ? t('common.hide') : t('common.show')}
                </Button>
                <Button variant="outline" onClick={handleValidate} disabled={validating}>
                  {validating ? t('settings.validating') : t('settings.validate')}
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

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.storage')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('settings.storageDesc')}</p>

            {storageStats ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2">
                    <span className="text-muted-foreground">{t('settings.totalFiles')}</span>
                    <span className="font-mono">{storageStats.totalFiles}</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2">
                    <span className="text-muted-foreground">{t('settings.totalSize')}</span>
                    <span className="font-mono">{formatBytes(storageStats.totalSize)}</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2">
                    <span className="text-muted-foreground">{t('settings.images')}</span>
                    <span className="font-mono">{storageStats.imageFiles}</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2">
                    <span className="text-muted-foreground">{t('settings.thumbnails')}</span>
                    <span className="font-mono">{storageStats.thumbnailFiles}</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2">
                    <span className="text-muted-foreground">{t('settings.dbRecords')}</span>
                    <span className="font-mono">{storageStats.dbRecords}</span>
                  </div>
                  <div className={`flex justify-between rounded-md px-3 py-2 ${storageStats.orphanFiles > 0 ? 'bg-destructive/10' : 'bg-muted/50'}`}>
                    <span className="text-muted-foreground">{t('settings.orphanFiles')}</span>
                    <span className={`font-mono ${storageStats.orphanFiles > 0 ? 'text-destructive' : ''}`}>
                      {storageStats.orphanFiles} ({formatBytes(storageStats.orphanSize)})
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
                    {scanning ? t('settings.scanning') : t('settings.scan')}
                  </Button>
                  {storageStats.orphanFiles > 0 && (
                    <Button variant="destructive" size="sm" onClick={handleCleanup} disabled={cleaningUp}>
                      {cleaningUp ? t('settings.cleaningUp') : `${t('settings.cleanup')} (${storageStats.orphanFiles})`}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('settings.scanFirst')}</p>
                <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
                  {scanning ? t('settings.scanning') : t('settings.scan')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('onboarding.restartTutorial')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('onboarding.restartDesc')}</p>
            <Button variant="outline" size="sm" onClick={handleRestartTutorial}>
              {t('onboarding.restart')}
            </Button>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} data-onboarding="save-settings-btn">
          {saving ? t('common.saving') : t('settings.saveSettings')}
        </Button>
      </div>
    </div>
  )
}
