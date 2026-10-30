import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useTranslation } from '@/lib/i18n'

/** "Also delete image files" opt-in inside the scene delete dialogs. */
export function DeleteFilesOption({
  imageCount,
  checked,
  onCheckedChange,
}: {
  imageCount: number
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div
      className="mt-1 flex flex-col gap-1.5 text-left"
      data-testid="delete-files-option"
    >
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
        />
        <Label htmlFor={id} className="text-sm font-normal">
          {t('scene.deleteFilesOption', { count: imageCount })}
        </Label>
      </div>
      <p className="text-muted-foreground text-xs">
        {checked ? t('scene.deleteFilesHintOn') : t('scene.deleteFilesHintOff')}
      </p>
    </div>
  )
}
