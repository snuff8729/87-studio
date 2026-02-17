import { HeadContent, Link, Outlet, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider, useTranslation } from '@/lib/i18n'

import appCss from '../styles.css?url'


function RootErrorComponent({ error }: { error: Error }) {
  return (
    <I18nProvider>
      <RootErrorContent error={error} />
    </I18nProvider>
  )
}

function RootErrorContent({ error }: { error: Error }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-lg text-destructive font-medium">{t('error.occurred')}</p>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        {error.message || t('error.unknown')}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {t('error.retry')}
      </button>
    </div>
  )
}

function RootPendingComponent() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="size-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
    </div>
  )
}

function RootNotFoundComponent() {
  return (
    <I18nProvider>
      <RootNotFoundContent />
    </I18nProvider>
  )
}

function RootNotFoundContent() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <p className="text-lg font-medium">{t('error.notFound')}</p>
      <p className="text-sm text-muted-foreground">{t('error.notFoundDesc')}</p>
      <Link
        to="/"
        className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {t('error.goHome')}
      </Link>
    </div>
  )
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '87 Studio' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
  errorComponent: RootErrorComponent,
  pendingComponent: RootPendingComponent,
  notFoundComponent: RootNotFoundComponent,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  const routerState = useRouterState()
  const { pathname } = routerState.location
  const isWorkspace = pathname.startsWith('/workspace')
  const isImageDetail = /^\/gallery\/\d+/.test(pathname)

  if (isWorkspace || isImageDetail) {
    return (
      <I18nProvider>
        <TooltipProvider delayDuration={300}>
          <Outlet />
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </I18nProvider>
    )
  }

  return (
    <I18nProvider>
      <TooltipProvider delayDuration={300}>
        <Sidebar />
        <main className="lg:ml-56 min-h-screen pb-16 lg:pb-0">
          <div className="p-4 lg:p-6">
            <div className="animate-in fade-in-0 duration-150">
              <Outlet />
            </div>
          </div>
        </main>
        <BottomNav />
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </I18nProvider>
  )
}
