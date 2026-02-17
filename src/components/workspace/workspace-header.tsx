import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft02Icon, Image02Icon, Menu01Icon, TimeQuarter02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

interface WorkspaceHeaderProps {
  projectName: string
  projectId: number
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  thumbnailPath?: string | null
  onToggleLeft?: () => void
  onToggleRight?: () => void
}

export function WorkspaceHeader({ projectName, projectId, saveStatus, thumbnailPath, onToggleLeft, onToggleRight }: WorkspaceHeaderProps) {
  const { t } = useTranslation()
  return (
    <header className="h-12 border-b border-border bg-background flex items-center justify-between px-3 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="sm" asChild className="shrink-0">
          <Link to="/">
            <HugeiconsIcon icon={ArrowLeft02Icon} className="size-5" />
            <span className="hidden sm:inline">{t('nav.projects')}</span>
          </Link>
        </Button>
        <div className="h-4 w-px bg-border" />
        {thumbnailPath && (
          <div className="size-6 rounded overflow-hidden bg-secondary/40 shrink-0">
            <img
              src={`/api/thumbnails/${thumbnailPath.replace('data/thumbnails/', '')}`}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <h1 className="text-base font-semibold truncate">{projectName}</h1>
        {saveStatus === 'saving' && (
          <span className="text-sm text-muted-foreground animate-pulse shrink-0">{t('common.saving')}</span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-sm text-muted-foreground shrink-0">{t('common.saved')}</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-sm text-destructive shrink-0">{t('common.saveFailed')}</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onToggleLeft && (
          <Button variant="ghost" size="sm" onClick={onToggleLeft} className="lg:hidden">
            <HugeiconsIcon icon={Menu01Icon} className="size-5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gallery" search={{ project: projectId }}>
            <HugeiconsIcon icon={Image02Icon} className="size-5" />
            <span className="hidden sm:inline">{t('nav.gallery')}</span>
          </Link>
        </Button>
        {onToggleRight && (
          <Button variant="ghost" size="sm" onClick={onToggleRight} className="lg:hidden">
            <HugeiconsIcon icon={TimeQuarter02Icon} className="size-5" />
          </Button>
        )}
      </div>
    </header>
  )
}
