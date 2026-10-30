import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n'
import { getLibrary } from '@/server/functions/library'
import { bulkSetSceneAxisValues } from '@/server/functions/project-scenes'

const KEEP = '__keep__'

/** Sets the global axes (view, framing, ...) of several scenes at once. */
export function SceneAxesDialog({
  open,
  onOpenChange,
  projectId,
  sceneIds,
  onApplied,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  sceneIds: Array<number>
  onApplied: () => void
}) {
  const { t } = useTranslation()
  const library = useQuery({
    queryKey: ['library', projectId],
    queryFn: () => getLibrary({ data: { projectId } }),
    enabled: open,
  })
  const globalAxes = (library.data?.axes ?? []).filter(
    (a) => a.ownerCharacterId === null && a.ownerItemId === null,
  )
  const [choices, setChoices] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setChoices({})
  }, [open])

  const changed = Object.entries(choices).filter(([, v]) => v !== KEEP)

  async function apply() {
    if (changed.length === 0) return
    setBusy(true)
    try {
      const axisValues: Record<string, number> = {}
      for (const [axisId, v] of changed) axisValues[axisId] = Number(v)
      await bulkSetSceneAxisValues({ data: { sceneIds, axisValues } })
      toast.success(t('sceneParts.bulkApplied', { count: sceneIds.length }))
      onOpenChange(false)
      onApplied()
    } catch {
      toast.error(t('sceneParts.bulkFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('sceneParts.bulkTitle')}</DialogTitle>
          <DialogDescription>
            {t('sceneParts.bulkDesc', { count: sceneIds.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {globalAxes.map((axis) => (
            <div key={axis.id} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-sm">{axis.name}</span>
              <Select
                value={choices[axis.id] ?? KEEP}
                onValueChange={(v) =>
                  setChoices((prev) => ({ ...prev, [axis.id]: v }))
                }
              >
                <SelectTrigger
                  className="min-w-0 flex-1"
                  aria-label={axis.name}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>{t('sceneParts.keep')}</SelectItem>
                  {axis.values.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {library.isSuccess && globalAxes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('sceneParts.noAxes')}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={busy || changed.length === 0 || sceneIds.length === 0}
            onClick={() => void apply()}
          >
            {t('sceneParts.bulkApply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
