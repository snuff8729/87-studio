import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouterState,
  useSearch,
} from '@tanstack/react-router'
import appCss from '../styles.css?url'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { BreadcrumbProvider } from '@/components/layout/breadcrumb-context'
import { SidebarRouteSync } from '@/components/layout/sidebar-route-sync'
import { isEditorRoute } from '@/components/layout/nav-items'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { getSidebarDefaultOpen } from '@/lib/sidebar-state'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider, useTranslation } from '@/lib/i18n'
import { OnboardingProvider } from '@/lib/onboarding'
import { OnboardingOverlay } from '@/components/onboarding/onboarding-overlay'
import { ImageDetailOverlay } from '@/components/common/image-detail-overlay'

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
      <p className="text-lg text-destructive font-medium">
        {t('error.occurred')}
      </p>
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
        search={{ imageDetail: undefined }}
        className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {t('error.goHome')}
      </Link>
    </div>
  )
}

export const Route = createRootRoute({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    imageDetail: number | undefined
    detailBundle?: number
    detailTag?: string
    detailLibChar?: number
    detailOutfitItem?: number
    detailPreset?: number
  } => ({
    imageDetail: search.imageDetail ? Number(search.imageDetail) : undefined,
    /** Opened from a bundle: prev/next walk that bundle's images */
    detailBundle: search.detailBundle ? Number(search.detailBundle) : undefined,
    /** Opened from a tag bookmark: prev/next walk images using that prompt tag */
    detailTag: search.detailTag ? String(search.detailTag) : undefined,
    /** Opened from a library character / outfit item: prev/next walk its images */
    detailLibChar: search.detailLibChar
      ? Number(search.detailLibChar)
      : undefined,
    detailOutfitItem: search.detailOutfitItem
      ? Number(search.detailOutfitItem)
      : undefined,
    /** Opened from a library preset: prev/next walk the preset's images */
    detailPreset: search.detailPreset ? Number(search.detailPreset) : undefined,
  }),
  loader: () => ({ sidebarOpen: getSidebarDefaultOpen() }),
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('87studio-ui-scale');if(s){document.documentElement.style.fontSize=s+'%'}})()`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isEditor = isEditorRoute(pathname)
  const isGallery = pathname.startsWith('/gallery')
  const { sidebarOpen } = Route.useLoaderData()
  // Global image detail overlay (for non-gallery pages)
  const { imageDetail } = useSearch({ from: '__root__' })
  return (
    <I18nProvider>
      <OnboardingProvider>
        <TooltipProvider delayDuration={300}>
          <SidebarProvider defaultOpen={sidebarOpen}>
            <BreadcrumbProvider>
              <SidebarRouteSync />
              <AppSidebar />
              <SidebarInset className="min-w-0">
                {isEditor ? (
                  <>
                    <div className="h-svh overflow-hidden">
                      <Outlet />
                    </div>
                    <Toaster richColors position="top-center" />
                  </>
                ) : (
                  <>
                    <AppHeader />
                    <div className="p-4 md:p-6 animate-page-fade">
                      <Outlet />
                    </div>
                    <Toaster richColors position="bottom-right" />
                  </>
                )}
              </SidebarInset>
            </BreadcrumbProvider>
          </SidebarProvider>
          {imageDetail && !isGallery && (
            <ImageDetailOverlay imageId={imageDetail} />
          )}
          <OnboardingOverlay />
        </TooltipProvider>
      </OnboardingProvider>
    </I18nProvider>
  )
}
