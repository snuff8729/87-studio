import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Copy01Icon,
  Delete02Icon,
  Film02Icon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { RowContextMenu, RowMenuButton } from './row-menu'
import type { MenuEntry } from './row-menu'
import type { listScenePacks } from '@/server/functions/scene-packs'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { isDuplicateName } from '@/lib/scene-templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type PackListItem = Awaited<ReturnType<typeof listScenePacks>>[number]

export interface PackActions {
  onCreate: (name: string, description: string) => Promise<void>
  onRename: (pack: PackListItem) => void
  onEditDescription: (pack: PackListItem) => void
  onDuplicate: (pack: PackListItem) => void
  onDelete: (pack: PackListItem) => void
}

export function NewPackPopover({
  packs,
  onCreate,
  trigger,
}: {
  packs: Array<PackListItem>
  onCreate: PackActions['onCreate']
  trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  const trimmed = name.trim()
  const duplicate = isDuplicateName(
    packs.map((p) => p.name),
    trimmed,
  )
  const canSubmit = !!trimmed && !duplicate && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onCreate(trimmed, description.trim())
      setOpen(false)
    } catch {
      // The caller reports the failure; keep the popover open
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setName('')
          setDescription('')
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-3 p-3"
        data-block-shortcuts
        onKeyDown={(e) => {
          if (
            e.key === 'Enter' &&
            (e.target as HTMLElement).tagName === 'INPUT'
          ) {
            e.preventDefault()
            void submit()
          }
        }}
      >
        <div className="text-sm font-medium">{t('templates.newPackTitle')}</div>
        <div className="space-y-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('templates.newPackName')}
            aria-label={t('templates.newPackName')}
            aria-invalid={duplicate || undefined}
            className="h-8 text-sm"
            autoFocus
          />
          {duplicate && (
            <p role="alert" className="text-xs text-destructive">
              {t('templates.duplicatePackName')}
            </p>
          )}
        </div>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('templates.packDescriptionOptional')}
          aria-label={t('templates.packDescriptionOptional')}
          rows={2}
          className="min-h-0 text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={!canSubmit}>
            {t('common.create')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function PacksPane({
  packs,
  selectedId,
  onSelect,
  actions,
}: {
  packs: Array<PackListItem>
  selectedId: number | null
  onSelect: (id: number) => void
  actions: PackActions
}) {
  const { t } = useTranslation()

  function entriesFor(pack: PackListItem): Array<MenuEntry> {
    return [
      {
        id: 'rename',
        label: t('templates.renamePack'),
        icon: PencilEdit02Icon,
        onSelect: () => actions.onRename(pack),
      },
      {
        id: 'description',
        label: t('templates.editDescription'),
        icon: PencilEdit02Icon,
        onSelect: () => actions.onEditDescription(pack),
      },
      {
        id: 'duplicate',
        label: t('templates.duplicate'),
        icon: Copy01Icon,
        onSelect: () => actions.onDuplicate(pack),
      },
      {
        id: 'delete',
        label: t('common.delete'),
        icon: Delete02Icon,
        destructive: true,
        separator: true,
        onSelect: () => actions.onDelete(pack),
      },
    ]
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t('templates.packs')}{' '}
          <span className="tabular-nums">{packs.length}</span>
        </span>
        <NewPackPopover
          packs={packs}
          onCreate={actions.onCreate}
          trigger={
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
              title={t('templates.createPack')}
              aria-label={t('templates.createPack')}
              data-testid="new-pack"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </button>
          }
        />
      </div>
      <div
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2"
        role="listbox"
        aria-label={t('templates.packs')}
      >
        {packs.map((pack) => {
          const entries = entriesFor(pack)
          const selected = pack.id === selectedId
          return (
            <RowContextMenu key={pack.id} entries={entries}>
              <div
                role="option"
                aria-selected={selected}
                data-testid="pack-row"
                data-selected={selected || undefined}
                tabIndex={0}
                onClick={() => onSelect(pack.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(pack.id)
                  }
                }}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  selected
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-secondary/60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{pack.name}</div>
                  {pack.description && (
                    <div className="truncate text-xs text-muted-foreground">
                      {pack.description}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {pack.sceneCount}
                </span>
                <RowMenuButton
                  entries={entries}
                  label={t('templates.packActions')}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
                />
              </div>
            </RowContextMenu>
          )
        })}
        {packs.length === 0 && (
          <div className="space-y-3 px-2 py-8 text-center">
            <HugeiconsIcon
              icon={Film02Icon}
              className="mx-auto size-6 text-muted-foreground/30"
            />
            <p className="text-sm text-muted-foreground">
              {t('templates.createPackToStart')}
            </p>
            <NewPackPopover
              packs={packs}
              onCreate={actions.onCreate}
              trigger={
                <Button size="sm" variant="outline">
                  <HugeiconsIcon icon={Add01Icon} className="size-4" />
                  {t('templates.createPack')}
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
