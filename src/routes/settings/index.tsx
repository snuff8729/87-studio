import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon, ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  getSetting,
  setSetting,
  validateApiKey,
} from '@/server/functions/settings'
import { cleanupOrphanFiles, getStorageStats } from '@/server/functions/storage'
import {
  AccountSummary,
  NAI_ACCOUNT_KEY,
  useNaiAccount,
} from '@/components/account/nai-account'
import { useTranslation } from '@/lib/i18n'
import { useOnboardingMaybe } from '@/lib/onboarding'
import { cn } from '@/lib/utils'

function PendingComponent() {
  return (
    <div className="mx-auto max-w-[920px] space-y-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border">
          <div className="p-6 pb-3">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="space-y-3 px-6 pb-6">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>
      ))}
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

const UI_SCALE_KEY = '87studio-ui-scale'
const DEFAULT_UI_SCALE = 100
const DELAY_MAX = 30000

function getInitialUiScale(): number {
  if (typeof window === 'undefined') return DEFAULT_UI_SCALE
  const stored = localStorage.getItem(UI_SCALE_KEY)
  if (stored) {
    const n = Number(stored)
    if (n >= 80 && n <= 150) return n
  }
  return DEFAULT_UI_SCALE
}

function applyUiScale(scale: number) {
  if (scale === DEFAULT_UI_SCALE) {
    document.documentElement.style.removeProperty('font-size')
    localStorage.removeItem(UI_SCALE_KEY)
  } else {
    document.documentElement.style.fontSize = `${scale}%`
    localStorage.setItem(UI_SCALE_KEY, String(scale))
  }
}

const SECTION_IDS = [
  'general',
  'generation',
  'appearance',
  'storage',
  'help',
] as const
type SectionId = (typeof SECTION_IDS)[number]

/** Label + description on the left, control on the right (stacked on mobile). */
function SettingRow({
  label,
  description,
  htmlFor,
  children,
  stack,
}: {
  label: ReactNode
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
  /** Control goes below the label at every width (wide controls). */
  stack?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 py-3 first:pt-0 last:pb-0 [&:not(:first-child)]:border-t',
        !stack && 'sm:flex-row sm:items-center sm:justify-between sm:gap-6',
      )}
    >
      <div className={cn('min-w-0', !stack && 'sm:max-w-[45%]')}>
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div
        className={cn(
          'min-w-0',
          !stack && 'sm:max-w-md sm:flex-1 sm:[&>*:only-child]:ml-auto',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function SectionCard({
  id,
  title,
  description,
  children,
  ...rest
}: {
  id: SectionId
  title: string
  description: string
  children: ReactNode
} & React.ComponentProps<'section'>) {
  return (
    <section id={`settings-${id}`} className="scroll-mt-28" {...rest}>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}

function StatTile({
  label,
  value,
  danger,
}: {
  label: string
  value: ReactNode
  danger?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-md px-3 py-2',
        danger ? 'bg-destructive/10' : 'bg-muted/50',
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-sm', danger && 'text-destructive')}>
        {value}
      </span>
    </div>
  )
}

function SettingsPage() {
  const { apiKey: initialApiKey, delay: initialDelay } = Route.useLoaderData()
  const queryClient = useQueryClient()
  const { data: account } = useNaiAccount()
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [showKey, setShowKey] = useState(false)
  const [keyValid, setKeyValid] = useState(false)
  const [delay, setDelay] = useState(Number(initialDelay))
  const [validating, setValidating] = useState(false)
  const [uiScale, setUiScale] = useState(getInitialUiScale)
  const { t, locale, setLocale } = useTranslation()
  const onboarding = useOnboardingMaybe()
  const lastSavedApiKey = useRef(initialApiKey)
  const lastSavedDelay = useRef(Number(initialDelay))
  const [active, setActive] = useState<SectionId>('general')
  // A nav click owns the highlight until its smooth scroll has settled
  const spyLockUntil = useRef(0)

  // Storage management state
  const [storageStats, setStorageStats] = useState<Awaited<
    ReturnType<typeof getStorageStats>
  > | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [confirmCleanup, setConfirmCleanup] = useState(false)

  useEffect(() => {
    setApiKey(initialApiKey)
    setDelay(Number(initialDelay))
    lastSavedApiKey.current = initialApiKey
    lastSavedDelay.current = Number(initialDelay)
  }, [initialApiKey, initialDelay])

  // Scroll-spy: the active section is the last one whose top passed the header
  useEffect(() => {
    function onScroll() {
      if (Date.now() < spyLockUntil.current) return
      let current: SectionId = SECTION_IDS[0]
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      if (atBottom) {
        current = SECTION_IDS[SECTION_IDS.length - 1]
      } else {
        for (const id of SECTION_IDS) {
          const el = document.getElementById(`settings-${id}`)
          if (el && el.getBoundingClientRect().top <= 140) current = id
        }
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  function goTo(id: SectionId) {
    setActive(id)
    spyLockUntil.current = Date.now() + 700
    document
      .getElementById(`settings-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const saveApiKey = useCallback(
    async (value: string) => {
      if (value === lastSavedApiKey.current) return
      lastSavedApiKey.current = value
      setKeyValid(false)
      try {
        await setSetting({ data: { key: 'nai_api_key', value } })
        void queryClient.invalidateQueries({ queryKey: NAI_ACCOUNT_KEY })
        toast.success(t('settings.saved'))
        if (value.trim()) {
          window.dispatchEvent(new CustomEvent('onboarding:api-key-saved'))
        }
      } catch {
        toast.error(t('settings.saveFailed'))
      }
    },
    [t, queryClient],
  )

  const saveDelay = useCallback(
    async (value: number) => {
      if (value === lastSavedDelay.current) return
      lastSavedDelay.current = value
      try {
        await setSetting({
          data: { key: 'generation_delay', value: String(value) },
        })
        toast.success(t('settings.saved'))
      } catch {
        toast.error(t('settings.saveFailed'))
      }
    },
    [t],
  )

  function commitDelayInput(raw: string) {
    const n = Math.round(Number(raw))
    const next = Number.isFinite(n)
      ? Math.min(DELAY_MAX, Math.max(0, n))
      : delay
    setDelay(next)
    saveDelay(next)
  }

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
      toast.success(
        t('settings.cleanupSuccess', { count: String(result.deleted) }),
      )
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
      // Save the key first (in case blur didn't fire yet)
      if (apiKey !== lastSavedApiKey.current) {
        lastSavedApiKey.current = apiKey
        await setSetting({ data: { key: 'nai_api_key', value: apiKey } })
      }
      const result = await validateApiKey({ data: apiKey })
      if (result.valid) {
        queryClient.setQueryData(NAI_ACCOUNT_KEY, result.account)
        setKeyValid(true)
        toast.success(t('settings.apiKeyValid'))
        window.dispatchEvent(new CustomEvent('onboarding:api-key-saved'))
      } else if (result.error === 'unauthorized') {
        setKeyValid(false)
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

  const navItems: Array<{ id: SectionId; label: string }> = [
    { id: 'general', label: t('settings.sectionGeneral') },
    { id: 'generation', label: t('settings.sectionGeneration') },
    { id: 'appearance', label: t('settings.sectionAppearance') },
    { id: 'storage', label: t('settings.sectionStorage') },
    { id: 'help', label: t('settings.sectionHelp') },
  ]

  const keyStatus = keyValid
    ? { label: t('settings.keyValid'), variant: 'default' as const }
    : apiKey.trim()
      ? { label: t('settings.keySet'), variant: 'secondary' as const }
      : { label: t('settings.keyNotSet'), variant: 'outline' as const }

  return (
    <div className="mx-auto max-w-[920px] lg:grid lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-10">
      {/* Mobile / tablet: sticky chip row */}
      <nav
        aria-label={t('settings.sections')}
        data-settings-chips
        className="no-scrollbar sticky top-12 z-10 -mx-4 mb-4 flex gap-2 overflow-x-auto border-b bg-background px-4 py-2 md:-mx-6 md:px-6 lg:hidden"
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => goTo(item.id)}
            aria-current={active === item.id ? 'true' : undefined}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-sm transition-colors',
              active === item.id
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Desktop: sticky section nav */}
      <nav
        aria-label={t('settings.sections')}
        data-settings-nav
        className="sticky top-[72px] hidden self-start lg:block"
      >
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => goTo(item.id)}
                aria-current={active === item.id ? 'true' : undefined}
                className={cn(
                  'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                  active === item.id
                    ? 'bg-primary/15 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 max-w-[720px] space-y-6 pb-16">
        <SectionCard
          id="general"
          title={t('settings.sectionGeneral')}
          description={t('settings.naiApiKeyDesc')}
          data-onboarding="api-key-section"
        >
          <SettingRow
            label={
              <span className="flex items-center gap-2">
                {t('settings.naiApiKey')}
                <Badge
                  variant={keyStatus.variant}
                  data-key-status
                  className="gap-1"
                >
                  {keyValid && (
                    <HugeiconsIcon icon={Tick02Icon} className="size-3" />
                  )}
                  {keyStatus.label}
                </Badge>
              </span>
            }
            htmlFor="api-key"
            stack
          >
            <div className="flex gap-2">
              <Input
                id="api-key"
                data-onboarding="api-key-input"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setKeyValid(false)
                }}
                onBlur={(e) => saveApiKey(e.target.value)}
                placeholder={t('settings.enterApiKey')}
                className="min-w-0 flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? t('common.hide') : t('common.show')}
                title={showKey ? t('common.hide') : t('common.show')}
              >
                <HugeiconsIcon
                  icon={showKey ? ViewOffIcon : ViewIcon}
                  className="size-4"
                />
              </Button>
              <Button
                onClick={handleValidate}
                disabled={validating}
                variant="outline"
              >
                {validating ? t('settings.validating') : t('settings.validate')}
              </Button>
              <Button
                onClick={() => saveApiKey(apiKey)}
                disabled={apiKey === lastSavedApiKey.current}
              >
                {t('common.save')}
              </Button>
            </div>
          </SettingRow>
          {account && apiKey.trim() && (
            <div className="mt-4">
              <AccountSummary account={account} />
            </div>
          )}
        </SectionCard>

        <SectionCard
          id="generation"
          title={t('settings.sectionGeneration')}
          description={t('settings.generationDesc')}
        >
          <SettingRow
            label={t('settings.delaySeconds')}
            description={t('settings.delayHint')}
            htmlFor="delay-input"
          >
            <div className="flex items-center gap-3">
              <Slider
                value={[delay]}
                onValueChange={([v]) => setDelay(v)}
                onValueCommit={([v]) => saveDelay(v)}
                min={0}
                max={DELAY_MAX}
                step={100}
                className="flex-1"
                aria-label={t('settings.delayLabel')}
              />
              <Input
                key={delay}
                id="delay-input"
                type="number"
                inputMode="numeric"
                min={0}
                max={DELAY_MAX}
                step={100}
                defaultValue={delay}
                onBlur={(e) => commitDelayInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                className="w-24 shrink-0 font-mono"
              />
            </div>
          </SettingRow>
        </SectionCard>

        <SectionCard
          id="appearance"
          title={t('settings.sectionAppearance')}
          description={t('settings.appearanceDesc')}
        >
          <SettingRow
            label={t('settings.language')}
            description={t('settings.languageDesc')}
          >
            <div className="flex gap-2 sm:justify-end">
              {(
                [
                  ['en', 'English'],
                  ['ko', '한국어'],
                ] as const
              ).map(([code, label]) => (
                <Button
                  key={code}
                  variant={locale === code ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLocale(code)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </SettingRow>
          <SettingRow
            label={t('settings.uiScale')}
            description={t('settings.uiScaleDesc')}
          >
            <div className="flex items-center gap-3">
              <Slider
                value={[uiScale]}
                onValueChange={([v]) => {
                  setUiScale(v)
                  applyUiScale(v)
                }}
                min={80}
                max={150}
                step={5}
                className="flex-1"
                aria-label={t('settings.uiScale')}
              />
              <span className="w-12 text-right font-mono text-sm text-primary">
                {uiScale}%
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={uiScale === DEFAULT_UI_SCALE}
                onClick={() => {
                  setUiScale(DEFAULT_UI_SCALE)
                  applyUiScale(DEFAULT_UI_SCALE)
                }}
              >
                {t('settings.uiScaleReset')}
              </Button>
            </div>
          </SettingRow>
        </SectionCard>

        <SectionCard
          id="storage"
          title={t('settings.sectionStorage')}
          description={t('settings.storageDesc')}
        >
          {storageStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatTile
                  label={t('settings.totalFiles')}
                  value={storageStats.totalFiles}
                />
                <StatTile
                  label={t('settings.totalSize')}
                  value={formatBytes(storageStats.totalSize)}
                />
                <StatTile
                  label={t('settings.images')}
                  value={storageStats.imageFiles}
                />
                <StatTile
                  label={t('settings.thumbnails')}
                  value={storageStats.thumbnailFiles}
                />
                <StatTile
                  label={t('settings.dbRecords')}
                  value={storageStats.dbRecords}
                />
                <StatTile
                  label={t('settings.orphanFiles')}
                  value={`${storageStats.orphanFiles} (${formatBytes(storageStats.orphanSize)})`}
                  danger={storageStats.orphanFiles > 0}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScan}
                  disabled={scanning}
                >
                  {scanning ? t('settings.scanning') : t('settings.scan')}
                </Button>
                {storageStats.orphanFiles > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmCleanup(true)}
                    disabled={cleaningUp}
                  >
                    {cleaningUp
                      ? t('settings.cleaningUp')
                      : `${t('settings.cleanup')} (${storageStats.orphanFiles})`}
                  </Button>
                )}
              </div>
              <ConfirmDialog
                open={confirmCleanup}
                onOpenChange={setConfirmCleanup}
                title={t('settings.cleanupConfirmTitle')}
                description={t('settings.cleanupConfirmDesc', {
                  count: String(storageStats.orphanFiles),
                })}
                actionLabel={t('settings.cleanup')}
                onConfirm={handleCleanup}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('settings.scanFirst')}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleScan}
                disabled={scanning}
              >
                {scanning ? t('settings.scanning') : t('settings.scan')}
              </Button>
            </div>
          )}
        </SectionCard>

        <SectionCard
          id="help"
          title={t('settings.sectionHelp')}
          description={t('settings.helpDesc')}
        >
          <SettingRow
            label={t('onboarding.restartTutorial')}
            description={t('onboarding.restartDesc')}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => onboarding?.restart()}
            >
              {t('onboarding.restart')}
            </Button>
          </SettingRow>
          <SettingRow label={t('settings.version')}>
            <span className="font-mono text-sm text-muted-foreground">
              {__APP_VERSION__}
            </span>
          </SettingRow>
          <SettingRow label={t('settings.license')}>
            <a
              href="https://polyformproject.org/licenses/noncommercial/1.0.0/"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {t('settings.licenseName')}
            </a>
          </SettingRow>
        </SectionCard>
      </div>
    </div>
  )
}
