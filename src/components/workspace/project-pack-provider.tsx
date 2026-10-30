import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  FileExportIcon,
  FolderTransferIcon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { toast } from 'sonner'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DeleteFilesOption } from '@/components/workspace/delete-files-option'
import { useTranslation } from '@/lib/i18n'
import { isNameTaken, moveAvailability } from '@/lib/project-packs'

/** A project scene pack as seen by the pack management UI (unfiltered). */
export interface PackInfo {
  id: number
  name: string
  /** Scene ids in manual (stored) order */
  sceneIds: Array<number>
  sceneNames: Array<string>
  imageCount: number
}

export interface PackManageHandlers {
  onCreatePack: (name: string) => Promise<{ id: number }>
  onRenamePack: (id: number, name: string) => Promise<void>
  onMovePack: (id: number, direction: 'up' | 'down') => Promise<void>
  onSavePackAsTemplate: (id: number) => void
  onDeletePack: (id: number, deleteFiles: boolean) => Promise<void>
  onMoveScene: (id: number, direction: 'up' | 'down') => Promise<void>
  onMoveScenes: (sceneIds: Array<number>, packId: number) => Promise<void>
}

interface PackManageValue extends PackManageHandlers {
  packs: Array<PackInfo>
  /** Rail sort is "manual": scene move up/down is meaningful */
  manualOrder: boolean
  renamingPackId: number | null
  startRename: (id: number) => void
  stopRename: () => void
  openNewPack: (onCreated?: (packId: number) => void) => void
  openDeletePack: (id: number) => void
}

const PackManageContext = createContext<PackManageValue | null>(null)

export function usePackManage(): PackManageValue {
  const ctx = useContext(PackManageContext)
  if (!ctx) throw new Error('usePackManage outside ProjectPackProvider')
  return ctx
}

export function ProjectPackProvider({
  packs,
  manualOrder,
  children,
  ...handlers
}: PackManageHandlers & {
  packs: Array<PackInfo>
  manualOrder: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const [renamingPackId, setRenamingPackId] = useState<number | null>(null)
  const [newPack, setNewPack] = useState<{
    onCreated?: (packId: number) => void
  } | null>(null)
  const [newName, setNewName] = useState('')
  const [newError, setNewError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleteFiles, setDeleteFiles] = useState(false)

  const startRename = useCallback((id: number) => setRenamingPackId(id), [])
  const stopRename = useCallback(() => setRenamingPackId(null), [])
  const openNewPack = useCallback((onCreated?: (packId: number) => void) => {
    setNewName('')
    setNewError(false)
    setNewPack({ onCreated })
  }, [])
  const openDeletePack = useCallback((id: number) => {
    setDeleteFiles(false)
    setDeleteId(id)
  }, [])

  const value = useMemo<PackManageValue>(
    () => ({
      ...handlers,
      packs,
      manualOrder,
      renamingPackId,
      startRename,
      stopRename,
      openNewPack,
      openDeletePack,
    }),
    // handlers are stable callbacks from the route
    [
      packs,
      manualOrder,
      renamingPackId,
      startRename,
      stopRename,
      openNewPack,
      openDeletePack,
      handlers.onCreatePack,
      handlers.onRenamePack,
      handlers.onMovePack,
      handlers.onSavePackAsTemplate,
      handlers.onDeletePack,
      handlers.onMoveScene,
      handlers.onMoveScenes,
    ],
  )

  const trimmed = newName.trim()
  const duplicate = isNameTaken(
    trimmed,
    packs.map((p) => p.name),
  )
  const nameError = trimmed !== '' && (duplicate || newError)

  async function submitNewPack() {
    if (!trimmed || nameError || busy || !newPack) return
    setBusy(true)
    try {
      const created = await handlers.onCreatePack(trimmed)
      const cb = newPack.onCreated
      setNewPack(null)
      cb?.(created.id)
    } catch (err) {
      if (err instanceof Error && err.message.includes('DUPLICATE_PACK_NAME')) {
        setNewError(true)
      } else {
        toast.error(t('projectPacks.createFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const deletePack = packs.find((p) => p.id === deleteId)

  return (
    <PackManageContext.Provider value={value}>
      {children}
      <Dialog
        open={newPack != null}
        onOpenChange={(open) => {
          if (!open) setNewPack(null)
        }}
      >
        <DialogContent className="sm:max-w-sm" data-block-shortcuts>
          <DialogHeader>
            <DialogTitle>{t('projectPacks.newPackTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                setNewError(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNewPack()
              }}
              placeholder={t('projectPacks.packName')}
              aria-label={t('projectPacks.packName')}
              aria-invalid={nameError || undefined}
              autoFocus
            />
            {nameError && (
              <p role="alert" className="text-xs text-destructive">
                {t('projectPacks.duplicateName')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewPack(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void submitNewPack()}
              disabled={!trimmed || nameError || busy}
            >
              {t('projectPacks.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deletePack != null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null)
        }}
        title={t('projectPacks.deleteTitle')}
        description={t('projectPacks.deleteDesc', {
          name: deletePack?.name ?? '',
          scenes: deletePack?.sceneIds.length ?? 0,
          images: deletePack?.imageCount ?? 0,
        })}
        onConfirm={async () => {
          if (!deletePack) return
          try {
            await handlers.onDeletePack(deletePack.id, deleteFiles)
          } catch {
            toast.error(t('projectPacks.deleteFailed'))
          }
        }}
      >
        <DeleteFilesOption
          imageCount={deletePack?.imageCount ?? 0}
          checked={deleteFiles}
          onCheckedChange={setDeleteFiles}
        />
      </ConfirmDialog>
    </PackManageContext.Provider>
  )
}

// ── Menus ──

/** Pack group header menu items (rail, board, mobile sheet). */
export function PackMenuItems({ packId }: { packId: number }) {
  const { t } = useTranslation()
  const m = usePackManage()
  const avail = moveAvailability(
    m.packs.map((p) => p.id),
    packId,
  )
  return (
    <>
      <DropdownMenuItem
        onSelect={() => setTimeout(() => m.startRename(packId), 0)}
      >
        <HugeiconsIcon icon={PencilEdit02Icon} />
        {t('projectPacks.rename')}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!avail.up}
        onSelect={() => void m.onMovePack(packId, 'up')}
      >
        <HugeiconsIcon icon={ArrowUp01Icon} />
        {t('projectPacks.moveUp')}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!avail.down}
        onSelect={() => void m.onMovePack(packId, 'down')}
      >
        <HugeiconsIcon icon={ArrowDown01Icon} />
        {t('projectPacks.moveDown')}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={
          (m.packs.find((p) => p.id === packId)?.sceneIds.length ?? 0) === 0
        }
        onSelect={() => setTimeout(() => m.onSavePackAsTemplate(packId), 0)}
      >
        <HugeiconsIcon icon={FileExportIcon} />
        {t('projectPacks.saveAsTemplate')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => setTimeout(() => m.openDeletePack(packId), 0)}
      >
        <HugeiconsIcon icon={Delete02Icon} />
        {t('projectPacks.delete')}
      </DropdownMenuItem>
    </>
  )
}

/** "Move to pack ▸" submenu: other packs + "New pack…". */
export function MoveToPackSub({
  excludePackId,
  onPick,
  disabled,
}: {
  excludePackId?: number
  onPick: (packId: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const m = usePackManage()
  const others = m.packs.filter((p) => p.id !== excludePackId)
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <HugeiconsIcon icon={FolderTransferIcon} />
        {t('projectPacks.moveToPack')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-auto min-w-44 overflow-y-auto">
        {others.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => onPick(p.id)}>
            <span className="max-w-56 truncate">{p.name}</span>
          </DropdownMenuItem>
        ))}
        {others.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem
          onSelect={() => setTimeout(() => m.openNewPack(onPick), 0)}
        >
          <HugeiconsIcon icon={Add01Icon} />
          {t('projectPacks.newPackItem')}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function HintedItem({
  hint,
  children,
}: {
  hint: string | null
  children: ReactNode
}) {
  if (!hint) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{children}</div>
      </TooltipTrigger>
      <TooltipContent side="left">{hint}</TooltipContent>
    </Tooltip>
  )
}

/** Scene menu additions: Move up / Move down (manual order only) + Move to pack. */
export function SceneMoveMenuItems({
  sceneId,
  packId,
}: {
  sceneId: number
  packId: number
}) {
  const { t } = useTranslation()
  const m = usePackManage()
  const pack = m.packs.find((p) => p.id === packId)
  const avail = moveAvailability(pack?.sceneIds ?? [], sceneId)
  const hint = m.manualOrder ? null : t('projectPacks.reorderNeedsManual')
  return (
    <>
      <HintedItem hint={hint}>
        <DropdownMenuItem
          disabled={!m.manualOrder || !avail.up}
          onSelect={() => void m.onMoveScene(sceneId, 'up')}
        >
          <HugeiconsIcon icon={ArrowUp01Icon} />
          {t('projectPacks.moveSceneUp')}
        </DropdownMenuItem>
      </HintedItem>
      <HintedItem hint={hint}>
        <DropdownMenuItem
          disabled={!m.manualOrder || !avail.down}
          onSelect={() => void m.onMoveScene(sceneId, 'down')}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} />
          {t('projectPacks.moveSceneDown')}
        </DropdownMenuItem>
      </HintedItem>
      <MoveToPackSub
        excludePackId={packId}
        onPick={(target) => void m.onMoveScenes([sceneId], target)}
      />
    </>
  )
}

/** Inline rename field for a pack header (Enter saves, Esc/blur cancels). */
export function PackRenameInput({
  packId,
  initial,
  className,
}: {
  packId: number
  initial: string
  className?: string
}) {
  const { t } = useTranslation()
  const m = usePackManage()
  const [value, setValue] = useState(initial)
  const [error, setError] = useState(false)
  const taken = isNameTaken(
    value,
    m.packs.filter((p) => p.id !== packId).map((p) => p.name),
  )

  async function commit() {
    const name = value.trim()
    if (!name || name === initial) {
      m.stopRename()
      return
    }
    if (taken) {
      setError(true)
      return
    }
    try {
      await m.onRenamePack(packId, name)
      m.stopRename()
    } catch (err) {
      if (err instanceof Error && err.message.includes('DUPLICATE_PACK_NAME')) {
        setError(true)
      } else {
        toast.error(t('projectPacks.renameFailed'))
        m.stopRename()
      }
    }
  }

  return (
    <Tooltip open={error || taken}>
      <TooltipTrigger asChild>
        <Input
          value={value}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setValue(e.target.value)
            setError(false)
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') void commit()
            if (e.key === 'Escape') m.stopRename()
          }}
          onBlur={() => m.stopRename()}
          aria-label={t('projectPacks.packName')}
          aria-invalid={error || taken || undefined}
          data-block-shortcuts
          className={className ?? 'h-6 min-w-0 flex-1 px-1.5 text-xs'}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {t('projectPacks.duplicateName')}
      </TooltipContent>
    </Tooltip>
  )
}
