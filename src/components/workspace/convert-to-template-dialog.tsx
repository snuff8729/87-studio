import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/i18n'
import { createScenePackFromProjectScenes } from '@/server/functions/scene-packs'

interface SceneInfo {
  id: number
  name: string
}

interface ConvertToTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scenes: Array<SceneInfo>
}

export function ConvertToTemplateDialog({
  open,
  onOpenChange,
  scenes,
}: ConvertToTemplateDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [checkedIds, setCheckedIds] = useState<Set<number>>(
    () => new Set(scenes.map((s) => s.id)),
  )
  const [creating, setCreating] = useState(false)

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setName('')
      setCheckedIds(new Set(scenes.map((s) => s.id)))
    }
    onOpenChange(isOpen)
  }

  function toggleScene(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!name.trim() || checkedIds.size === 0) return
    setCreating(true)
    try {
      await createScenePackFromProjectScenes({
        data: { name: name.trim(), projectSceneIds: [...checkedIds] },
      })
      toast.success(t('scene.convertSuccess'))
      onOpenChange(false)
    } catch {
      toast.error(t('scene.convertFailed'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('scene.convertToTemplate')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Pack name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t('scene.templateName')}
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
              placeholder={t('scene.templateName')}
              className="text-sm"
              autoFocus
            />
          </div>

          {/* Scene checklist */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t('scene.scenes')}</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {checkedIds.size}/{scenes.length}
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border">
              {scenes.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => toggleScene(scene.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary/60 transition-colors"
                >
                  <Checkbox
                    checked={checkedIds.has(scene.id)}
                    tabIndex={-1}
                    className="pointer-events-none"
                  />
                  <span className="truncate">{scene.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Create button */}
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={creating || !name.trim() || checkedIds.size === 0}
          >
            {creating ? t('common.processing') : t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
