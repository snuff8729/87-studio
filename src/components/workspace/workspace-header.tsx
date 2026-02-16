import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft02Icon, Image02Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'

interface WorkspaceHeaderProps {
  projectName: string
  projectId: number
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
}

export function WorkspaceHeader({ projectName, projectId, saveStatus }: WorkspaceHeaderProps) {
  return (
    <header className="h-12 border-b border-border bg-background flex items-center justify-between px-3 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Button variant="ghost" size="sm" asChild className="shrink-0">
          <Link to="/">
            <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
            <span className="hidden sm:inline">Projects</span>
          </Link>
        </Button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-sm font-semibold truncate">{projectName}</h1>
        {saveStatus === 'saving' && (
          <span className="text-xs text-muted-foreground animate-pulse shrink-0">Saving...</span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-muted-foreground shrink-0">Saved</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs text-destructive shrink-0">Save failed</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gallery" search={{ project: projectId }}>
            <HugeiconsIcon icon={Image02Icon} className="size-4" />
            <span className="hidden sm:inline">Gallery</span>
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings">
            <HugeiconsIcon icon={Settings02Icon} className="size-4" />
          </Link>
        </Button>
      </div>
    </header>
  )
}
