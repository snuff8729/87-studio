import { useState } from 'react'
import { toast } from 'sonner'
import { defaultAddPackId, isDuplicateSceneName } from './scene-add'
import { usePackManage } from './project-pack-provider'
import type { ReactNode } from 'react'
import type { AddScenePackInfo } from './scene-add'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n'
import { isNameTaken } from '@/lib/project-packs'

const NEW_PACK = '__new_pack__'

export interface AddSceneInput {
  name: string
  packId: number | null
  copyFromSceneId: number | null
}

/** Everything the add-scene popover needs from the workspace route. */
export interface AddSceneConfig {
  packs: Array<AddScenePackInfo>
  /** The currently selected scene (default pack, "copy values" source) */
  selectedScene: { id: number; name: string; packId: number } | null
  onAdd: (input: AddSceneInput) => Promise<void>
}

export function AddScenePopover({
  config,
  trigger,
  side = 'bottom',
  align = 'start',
  onboarding,
  defaultPackId,
}: {
  config: AddSceneConfig
  /** The button that opens the popover (rendered with asChild) */
  trigger: ReactNode
  side?: 'bottom' | 'right' | 'top' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Adds the `add-scene-form` onboarding anchor to the popover */
  onboarding?: boolean
  /** Preselected pack (e.g. the "Add scene" row of an empty pack) */
  defaultPackId?: number
}) {
  const { t } = useTranslation()
  const { packs, selectedScene, onAdd } = config
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [packId, setPackId] = useState<number | null>(null)
  const [copy, setCopy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [serverDuplicate, setServerDuplicate] = useState(false)
  const [creatingPack, setCreatingPack] = useState(false)
  const [newPackName, setNewPackName] = useState('')
  const [packNameTaken, setPackNameTaken] = useState(false)
  const { onCreatePack } = usePackManage()

  const pack = packs.find((p) => p.id === packId)
  const trimmed = name.trim()
  const trimmedPack = newPackName.trim()
  const duplicate = serverDuplicate || isDuplicateSceneName(pack, trimmed)
  const packDuplicate =
    creatingPack &&
    trimmedPack !== '' &&
    (packNameTaken ||
      isNameTaken(
        trimmedPack,
        packs.map((p) => p.name),
      ))
  const packInvalid = creatingPack && (trimmedPack === '' || packDuplicate)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setName('')
      setPackId(
        defaultPackId != null && packs.some((p) => p.id === defaultPackId)
          ? defaultPackId
          : defaultAddPackId(packs, selectedScene?.packId ?? null),
      )
      setCopy(selectedScene != null)
      setServerDuplicate(false)
      setCreatingPack(false)
      setNewPackName('')
      setPackNameTaken(false)
    }
  }

  async function submit() {
    if (!trimmed || duplicate || packInvalid || busy) return
    setBusy(true)
    try {
      let targetPackId = packId
      if (creatingPack) {
        try {
          targetPackId = (await onCreatePack(trimmedPack)).id
        } catch (err) {
          if (
            err instanceof Error &&
            err.message.includes('DUPLICATE_PACK_NAME')
          ) {
            setPackNameTaken(true)
            return
          }
          throw err
        }
      }
      await onAdd({
        name: trimmed,
        packId: targetPackId,
        copyFromSceneId: copy && selectedScene ? selectedScene.id : null,
      })
      setOpen(false)
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('DUPLICATE_SCENE_NAME')
      ) {
        setServerDuplicate(true)
      } else {
        toast.error(t('scene.addSceneFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-72 gap-3 p-3"
        data-block-shortcuts
        data-onboarding={onboarding ? 'add-scene-form' : undefined}
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
        <div className="text-sm font-medium">{t('scene.addSceneTitle')}</div>
        <div className="space-y-1">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setServerDuplicate(false)
            }}
            placeholder={t('scene.sceneName')}
            aria-label={t('scene.sceneName')}
            aria-invalid={duplicate || undefined}
            className="h-8 text-sm"
            autoFocus
          />
          {duplicate && trimmed && (
            <p role="alert" className="text-xs text-destructive">
              {t('scene.duplicateSceneName')}
            </p>
          )}
        </div>
        {packs.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t('scene.addScenePack')}
            </Label>
            <Select
              value={
                creatingPack
                  ? NEW_PACK
                  : packId != null
                    ? String(packId)
                    : undefined
              }
              onValueChange={(v) => {
                setServerDuplicate(false)
                if (v === NEW_PACK) {
                  setCreatingPack(true)
                  return
                }
                setCreatingPack(false)
                setPackId(Number(v))
              }}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {packs.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={NEW_PACK}>
                  {t('projectPacks.newPackItem')}
                </SelectItem>
              </SelectContent>
            </Select>
            {creatingPack && (
              <div className="space-y-1 pt-1">
                <Input
                  value={newPackName}
                  onChange={(e) => {
                    setNewPackName(e.target.value)
                    setPackNameTaken(false)
                  }}
                  placeholder={t('projectPacks.packName')}
                  aria-label={t('projectPacks.packName')}
                  aria-invalid={packDuplicate || undefined}
                  className="h-8 text-sm"
                  autoFocus
                />
                {packDuplicate && (
                  <p role="alert" className="text-xs text-destructive">
                    {t('projectPacks.duplicateName')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {selectedScene && (
          <label className="flex items-start gap-2 text-xs">
            <Checkbox
              checked={copy}
              onCheckedChange={(v) => setCopy(v === true)}
              className="mt-px"
            />
            <span className="min-w-0 break-words">
              {t('scene.copyFromScene', { name: selectedScene.name })}
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={!trimmed || duplicate || packInvalid || busy}
          >
            {t('common.add')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
