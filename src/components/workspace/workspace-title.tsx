import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { updateProject } from '@/server/functions/projects'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** EditorHeader title: project thumbnail + (click-to-rename) name + save status. */
export function WorkspaceTitle({
  projectId,
  projectName,
  thumbnailPath,
  saveStatus,
}: {
  projectId: number
  projectName: string
  thumbnailPath?: string | null
  saveStatus: SaveStatus
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(projectName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditName(projectName)
  }, [projectName])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  async function handleSave() {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === projectName) {
      setEditing(false)
      setEditName(projectName)
      return
    }
    try {
      await updateProject({ data: { id: projectId, name: trimmed } })
      setEditing(false)
      toast.success(t('dashboard.projectRenamed'))
      router.invalidate()
    } catch {
      toast.error(t('dashboard.renameFailed'))
      setEditName(projectName)
      setEditing(false)
    }
  }

  const statusText =
    saveStatus === 'saving'
      ? t('common.saving')
      : saveStatus === 'saved'
        ? t('common.saved')
        : saveStatus === 'error'
          ? t('common.saveFailed')
          : null

  return (
    <div className="flex min-w-0 items-center gap-2">
      {thumbnailPath && (
        <div className="size-6 shrink-0 overflow-hidden rounded bg-secondary/40">
          <img
            src={`/api/thumbnails/${thumbnailPath.replace('data/thumbnails/', '')}`}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') {
              setEditing(false)
              setEditName(projectName)
            }
          }}
          aria-label={t('dashboard.renameProject')}
          className="min-w-0 max-w-48 border-b border-primary bg-transparent text-sm font-medium outline-none"
        />
      ) : (
        <button
          type="button"
          className="min-w-0 truncate text-left transition-colors hover:text-primary"
          onClick={() => setEditing(true)}
          title={t('dashboard.renameProject')}
        >
          {projectName}
        </button>
      )}
      {statusText && (
        <span
          className={cn(
            'shrink-0 text-xs font-normal',
            saveStatus === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground',
            saveStatus === 'saving' && 'animate-pulse',
          )}
        >
          {statusText}
        </span>
      )}
    </div>
  )
}
