import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useSerialSave } from './use-serial-save'
import type { ItemVariable } from '@/lib/character-parts'
import {
  DragHandle,
  RowRemoveButton,
  SortableList,
  SortableRow,
} from '@/components/common/sortable-list/sortable-list'
import { InlineName } from '@/components/common/sortable-list/inline-name'
import { AddNameRow } from '@/components/common/sortable-list/add-row'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateOutfitItem } from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'

function DefaultInput({
  value,
  onCommit,
  label,
  placeholder,
}: {
  value: string
  onCommit: (value: string) => void
  label: string
  placeholder: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Input
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      data-variable-default
      data-block-shortcuts
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim()
        if (next !== value) onCommit(next)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
      className="h-7 w-32 shrink-0 px-2 text-sm sm:w-44"
    />
  )
}

/**
 * Outfit item "Variables": `@{var:name}` tokens in the item's fragments are
 * replaced by the value picked per outfit entry (else the default here).
 * Renaming rewrites the tokens in the item's fragments.
 */
export function ItemVariables({
  itemId,
  variables,
}: {
  itemId: number
  variables: Array<ItemVariable>
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })
  const renamesRef = useRef<Array<{ from: string; to: string }>>([])

  const vars = useSerialSave<Array<ItemVariable>>(
    variables,
    async (next) => {
      const renames = renamesRef.current.splice(0)
      await updateOutfitItem({
        data: { id: itemId, variables: next, renames },
      })
      await refresh()
    },
    () => toast.error(t('library.saveFailed')),
  )
  const list = vars.value
  const exists = (name: string, except?: string) =>
    list.some((v) => v.name === name && v.name !== except)

  return (
    <section className="space-y-2" data-item-variables>
      <Label className="text-sm text-muted-foreground">
        {t('library.variables')}
      </Label>
      {list.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('library.noVariables')}
        </p>
      )}
      <div className="max-w-[40rem]">
        <SortableList
          ids={list.map((v) => v.name)}
          onReorder={(ids) =>
            vars.commit((cur) =>
              (ids as Array<string>)
                .map((n) => cur.find((v) => v.name === n))
                .filter((v): v is ItemVariable => !!v),
            )
          }
        >
          <div className="space-y-0.5">
            {list.map((v) => (
              <SortableRow
                key={v.name}
                id={v.name}
                data-variable-row={v.name}
                className="flex h-8 items-center gap-1 rounded-lg px-0.5 hover:bg-secondary/30"
              >
                <DragHandle />
                <InlineName
                  value={v.name}
                  ariaLabel={t('library.variableName')}
                  onCommit={(name) => {
                    if (exists(name, v.name)) {
                      toast.error(t('library.variableDuplicate'))
                      return
                    }
                    renamesRef.current.push({ from: v.name, to: name })
                    vars.commit((cur) =>
                      cur.map((x) => (x.name === v.name ? { ...x, name } : x)),
                    )
                  }}
                />
                <DefaultInput
                  value={v.default}
                  label={t('library.variableDefault')}
                  placeholder={t('library.variableDefaultPlaceholder')}
                  onCommit={(value) =>
                    vars.commit((cur) =>
                      cur.map((x) =>
                        x.name === v.name ? { ...x, default: value } : x,
                      ),
                    )
                  }
                />
                <RowRemoveButton
                  label={t('library.deleteVariable')}
                  onClick={() =>
                    vars.commit((cur) => cur.filter((x) => x.name !== v.name))
                  }
                />
              </SortableRow>
            ))}
          </div>
        </SortableList>
        <AddNameRow
          label={t('library.addVariable')}
          placeholder={t('library.variableNamePlaceholder')}
          onAdd={(name) => {
            if (exists(name)) {
              toast.error(t('library.variableDuplicate'))
              return
            }
            vars.commit((cur) => [...cur, { name, default: '' }])
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('library.variablesHint')}
      </p>
    </section>
  )
}
