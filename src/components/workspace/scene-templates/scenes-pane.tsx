import { useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown02Icon,
  ArrowUp02Icon,
  Copy01Icon,
  Delete02Icon,
  PencilEdit02Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { RowContextMenu, RowMenuButton } from './row-menu'
import type { MenuEntry } from './row-menu'
import type { getScenePack } from '@/server/functions/scene-packs'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import {
  filterByName,
  isDuplicateName,
  parsePlaceholders,
  stepSelection,
} from '@/lib/scene-templates'
import {
  DragHandle,
  SortableList,
  SortableRow,
} from '@/components/common/sortable-list/sortable-list'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type SceneItem = Awaited<
  ReturnType<typeof getScenePack>
>['scenes'][number]

export interface SceneActions {
  onAdd: (name: string, copyFromId: number | null) => Promise<void>
  onRename: (scene: SceneItem) => void
  onDuplicate: (scene: SceneItem) => void
  onMove: (scene: SceneItem, direction: 'up' | 'down') => void
  onReorder: (ids: Array<number>) => void
  onDelete: (scene: SceneItem) => void
}

export function NewScenePopover({
  scenes,
  selectedScene,
  onAdd,
  trigger,
}: {
  scenes: Array<SceneItem>
  selectedScene: SceneItem | null
  onAdd: SceneActions['onAdd']
  trigger: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [copy, setCopy] = useState(false)
  const [busy, setBusy] = useState(false)

  const trimmed = name.trim()
  const duplicate = isDuplicateName(
    scenes.map((s) => s.name),
    trimmed,
  )
  const canSubmit = !!trimmed && !duplicate && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onAdd(trimmed, copy && selectedScene ? selectedScene.id : null)
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
          setCopy(selectedScene != null)
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
        <div className="text-sm font-medium">
          {t('templates.newSceneTitle')}
        </div>
        <div className="space-y-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('scene.sceneName')}
            aria-label={t('scene.sceneName')}
            aria-invalid={duplicate || undefined}
            className="h-8 text-sm"
            autoFocus
          />
          {duplicate && (
            <p role="alert" className="text-xs text-destructive">
              {t('templates.duplicateSceneName')}
            </p>
          )}
        </div>
        {selectedScene && (
          <label className="flex items-start gap-2 text-xs">
            <Checkbox
              checked={copy}
              onCheckedChange={(v) => setCopy(v === true)}
              className="mt-px"
            />
            <span className="min-w-0 break-words">
              {t('templates.copyFromSelected', { name: selectedScene.name })}
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={!canSubmit}>
            {t('common.add')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ScenesPane({
  scenes,
  selectedId,
  onSelect,
  checked,
  onToggleChecked,
  actions,
}: {
  scenes: Array<SceneItem>
  selectedId: number | null
  onSelect: (id: number) => void
  checked: Set<number>
  onToggleChecked: (id: number, next: boolean) => void
  actions: SceneActions
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const visible = useMemo(() => filterByName(scenes, query), [scenes, query])
  const visibleIds = useMemo(() => visible.map((s) => s.id), [visible])
  const selectedScene = scenes.find((s) => s.id === selectedId) ?? null
  // Dragging needs the whole list in view
  const canDrag = query.trim() === ''

  function entriesFor(scene: SceneItem): Array<MenuEntry> {
    const index = scenes.findIndex((s) => s.id === scene.id)
    return [
      {
        id: 'rename',
        label: t('scene.rename'),
        icon: PencilEdit02Icon,
        onSelect: () => actions.onRename(scene),
      },
      {
        id: 'duplicate',
        label: t('templates.duplicate'),
        icon: Copy01Icon,
        onSelect: () => actions.onDuplicate(scene),
      },
      {
        id: 'up',
        label: t('templates.moveUp'),
        icon: ArrowUp02Icon,
        disabled: index <= 0,
        onSelect: () => actions.onMove(scene, 'up'),
      },
      {
        id: 'down',
        label: t('templates.moveDown'),
        icon: ArrowDown02Icon,
        disabled: index < 0 || index >= scenes.length - 1,
        onSelect: () => actions.onMove(scene, 'down'),
      },
      {
        id: 'delete',
        label: t('common.delete'),
        icon: Delete02Icon,
        destructive: true,
        separator: true,
        onSelect: () => actions.onDelete(scene),
      },
    ]
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    // Only when the list itself (not a checkbox / menu button) has focus
    const target = e.target as HTMLElement
    if (
      target.tagName === 'BUTTON' &&
      target.getAttribute('role') !== 'option'
    ) {
      return
    }
    e.preventDefault()
    const next = stepSelection(
      visibleIds,
      selectedId,
      e.key === 'ArrowDown' ? 1 : -1,
    )
    if (next != null) {
      onSelect(next)
      requestAnimationFrame(() =>
        listRef.current
          ?.querySelector<HTMLElement>(`[data-scene-id="${next}"]`)
          ?.focus(),
      )
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t('templates.scenesHeader')}{' '}
          <span className="tabular-nums">{scenes.length}</span>
        </span>
        <NewScenePopover
          scenes={scenes}
          selectedScene={selectedScene}
          onAdd={actions.onAdd}
          trigger={
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
              title={t('templates.addScene')}
              aria-label={t('templates.addScene')}
              data-testid="new-scene"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </button>
          }
        />
      </div>
      <div className="relative shrink-0 px-3 pb-2">
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute top-2 left-5 size-3.5 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('templates.searchScenes')}
          aria-label={t('templates.searchScenes')}
          className="h-7 pl-7 text-sm"
        />
      </div>
      <div
        ref={listRef}
        role="listbox"
        aria-label={t('templates.scenesHeader')}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2"
        onKeyDown={handleKeyDown}
      >
        <SortableList
          ids={visible.map((s) => s.id)}
          disabled={!canDrag}
          onReorder={(ids) => actions.onReorder(ids as Array<number>)}
        >
          {visible.map((scene) => {
            const entries = entriesFor(scene)
            const selected = scene.id === selectedId
            const keyCount = Object.keys(
              parsePlaceholders(scene.placeholders),
            ).length
            return (
              <RowContextMenu key={scene.id} entries={entries}>
                <SortableRow
                  id={scene.id}
                  disabled={!canDrag}
                  role="option"
                  aria-selected={selected}
                  data-testid="scene-row"
                  data-scene-id={scene.id}
                  data-selected={selected || undefined}
                  tabIndex={
                    selected || (selectedId == null && scene === visible[0])
                      ? 0
                      : -1
                  }
                  onClick={() => onSelect(scene.id)}
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                    selected
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-secondary/60',
                  )}
                >
                  <DragHandle className="-mr-1" />
                  <Checkbox
                    checked={checked.has(scene.id)}
                    onCheckedChange={(v) =>
                      onToggleChecked(scene.id, v === true)
                    }
                    onClick={(e) => e.stopPropagation()}
                    aria-label={t('templates.applyToggle')}
                    tabIndex={-1}
                  />
                  <span className="min-w-0 flex-1 truncate">{scene.name}</span>
                  {keyCount > 0 && (
                    <span
                      className="text-xs text-muted-foreground tabular-nums"
                      title={t('templates.keys', { count: keyCount })}
                    >
                      {keyCount}
                    </span>
                  )}
                  <RowMenuButton
                    entries={entries}
                    label={t('templates.sceneActions')}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
                  />
                </SortableRow>
              </RowContextMenu>
            )
          })}
        </SortableList>
        {scenes.length === 0 && (
          <div className="space-y-3 px-2 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t('templates.noScenesYet')}
            </p>
            <NewScenePopover
              scenes={scenes}
              selectedScene={null}
              onAdd={actions.onAdd}
              trigger={
                <Button size="sm" variant="outline">
                  <HugeiconsIcon icon={Add01Icon} className="size-4" />
                  {t('templates.addFirstScene')}
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
