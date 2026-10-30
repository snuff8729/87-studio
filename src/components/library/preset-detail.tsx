import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useDebouncedSave } from './use-debounced-save'
import { useSerialSave } from './use-serial-save'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { OutfitItemsEditor } from '@/components/parts/outfit-items-editor'
import { updatePreset } from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'

interface PresetRow {
  id: number
  name: string
  description: string | null
  itemIds: Array<number>
}

/** Preset detail: name, description and its ordered outfit items. */
export function PresetDetail({
  preset,
  items,
  areas,
}: {
  preset: PresetRow
  items: Array<{
    id: number
    name: string
    projectId: number | null
    areaIds?: Array<number>
  }>
  areas?: Array<{ id: number; name: string }>
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(preset.name)
  const [description, setDescription] = useState(preset.description ?? '')
  const saver = useDebouncedSave()
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })

  function scheduleSave(nextName: string, nextDesc: string) {
    saver.schedule(async () => {
      try {
        await updatePreset({
          data: {
            id: preset.id,
            description: nextDesc,
            ...(nextName.trim() ? { name: nextName.trim() } : {}),
          },
        })
        void refresh()
      } catch {
        toast.error(t('library.saveFailed'))
      }
    })
  }

  const itemIds = useSerialSave<Array<number>>(
    preset.itemIds,
    async (ids) => {
      await updatePreset({ data: { id: preset.id, itemIds: ids } })
      await refresh()
    },
    () => toast.error(t('library.saveFailed')),
  )

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            scheduleSave(e.target.value, description)
          }}
          aria-label={t('library.name')}
          placeholder={t('library.namePlaceholder')}
          className="h-10 text-base font-medium"
        />
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
            scheduleSave(name, e.target.value)
          }}
          aria-label={t('library.description')}
          placeholder={t('library.descriptionPlaceholder')}
          rows={2}
          className="min-h-[3.25rem] text-sm"
        />
      </div>
      <section className="space-y-2">
        <Label className="text-sm text-muted-foreground">
          {t('library.presetItems')}
        </Label>
        <OutfitItemsEditor
          itemIds={itemIds.value}
          onChange={(ids) => itemIds.commit(() => ids)}
          items={items}
          areas={areas}
          showPresetMenu={false}
        />
      </section>
    </div>
  )
}
