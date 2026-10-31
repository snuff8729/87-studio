import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CombinationGrid } from './combination-grid'
import { ConditionEditor } from './condition-editor'
import { ItemVariables } from './item-variables'
import { FragmentRow } from './fragment-row'
import { ItemOcclusion } from './item-occlusion'
import { LibraryImagesSection } from './library-images-section'
import { LocalAxes } from './local-axes'
import { useDebouncedSave } from './use-debounced-save'
import { useSerialSave } from './use-serial-save'
import type { AreaOption } from './area-chips'
import type {
  AxisValues,
  Condition,
  CoverRule,
  ItemVariable,
  PartsAxis,
} from '@/lib/character-parts'
import { useSortableOrder } from '@/components/common/sortable-list/use-sortable-order'
import { SortableList } from '@/components/common/sortable-list/sortable-list'
import { AddRowButton } from '@/components/common/sortable-list/add-row'
import {
  composeParts,
  effectiveAxisValues,
  relevantAxes,
  resolveVarValues,
} from '@/lib/character-parts'
import { AxisSegmented } from '@/components/parts/axis-segmented'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getProject } from '@/server/functions/projects'
import {
  createFragment,
  reorderFragments,
  updateLibraryCharacter,
  updateOutfitItem,
} from '@/server/functions/library'
import { useBundleNames } from '@/lib/use-bundles'
import { useTranslation } from '@/lib/i18n'

export interface OwnerRow {
  id: number
  name: string
  description: string | null
  projectId: number | null
  conditions?: Condition
  areaIds?: Array<number>
  coverRules?: Array<CoverRule>
  variables?: Array<ItemVariable>
  imageCount: number
  thumbnailImageId: number | null
  fragments: Array<{
    id: number
    text: string
    conditions: Condition
    areaIds?: Array<number>
  }>
}

/** Character / outfit item detail: name, description, axes, fragments, preview. */
export function OwnerDetail({
  kind,
  row,
  axes,
  areas,
}: {
  kind: 'character' | 'item'
  row: OwnerRow
  axes: Array<PartsAxis>
  areas: Array<AreaOption>
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const bundleNames = useBundleNames()
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })

  const [name, setName] = useState(row.name)
  const [description, setDescription] = useState(row.description ?? '')
  const nameRef = useRef(name)
  const descRef = useRef(description)
  const saver = useDebouncedSave()

  // Only fields the user edited are sent, so a debounced save never
  // overwrites a rename done elsewhere (list menu)
  const dirtyNameRef = useRef(false)
  const dirtyDescRef = useRef(false)

  // Follow external renames (list menu) unless the user is editing the field
  useEffect(() => {
    if (dirtyNameRef.current) return
    setName(row.name)
    nameRef.current = row.name
  }, [row.name])
  useEffect(() => {
    if (dirtyDescRef.current) return
    setDescription(row.description ?? '')
    descRef.current = row.description ?? ''
  }, [row.description])

  const { data: project } = useQuery({
    queryKey: ['project', row.projectId],
    queryFn: () => getProject({ data: row.projectId as number }),
    enabled: row.projectId !== null,
  })

  function scheduleSave() {
    const id = row.id
    saver.schedule(async () => {
      const n = nameRef.current.trim()
      const sendName = dirtyNameRef.current && !!n
      const sendDesc = dirtyDescRef.current
      dirtyNameRef.current = false
      dirtyDescRef.current = false
      const payload = {
        id,
        ...(sendDesc ? { description: descRef.current } : {}),
        ...(sendName ? { name: n } : {}),
      }
      if (!sendName && !sendDesc) return
      try {
        if (kind === 'character')
          await updateLibraryCharacter({ data: payload })
        else await updateOutfitItem({ data: payload })
        void refresh()
      } catch {
        toast.error(t('library.saveFailed'))
      }
    })
  }

  const itemCond = useSerialSave<Condition>(
    row.conditions ?? {},
    async (conditions) => {
      await updateOutfitItem({ data: { id: row.id, conditions } })
      await refresh()
    },
    () => toast.error(t('library.saveFailed')),
  )

  const ownerAxes = axes.filter((a) =>
    kind === 'character'
      ? a.ownerCharacterId === row.id
      : a.ownerItemId === row.id,
  )
  const relevant = useMemo(
    () =>
      relevantAxes(
        axes,
        kind === 'character' ? row.id : null,
        kind === 'item' ? [row.id] : [],
      ),
    [axes, kind, row.id],
  )

  // Text drafts (lifted from the rows) so the preview is live before saving
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const fragOrder = useSortableOrder(
    row.fragments,
    (f) => f.id,
    async (ids) => {
      await reorderFragments({ data: { ids: ids as Array<number> } })
      await refresh()
    },
    () => toast.error(t('library.failed')),
  )
  const fragments = fragOrder.items.map((f) => ({
    ...f,
    text: drafts[f.id] ?? f.text,
  }))

  async function addFragment() {
    try {
      await createFragment({
        data:
          kind === 'character'
            ? { characterId: row.id, text: '' }
            : { itemId: row.id, text: '' },
      })
      await refresh()
    } catch {
      toast.error(t('library.failed'))
    }
  }

  // Preview
  const [previewValues, setPreviewValues] = useState<AxisValues>({})
  const effective = effectiveAxisValues(relevant, [previewValues])
  const composeFor = (values: AxisValues) => {
    const composed = composeParts({
      axes: relevant,
      character: kind === 'character' ? { id: row.id, fragments } : null,
      items:
        kind === 'item'
          ? [
              {
                id: row.id,
                conditions: itemCond.value,
                fragments,
                varValues: resolveVarValues(row.variables, undefined),
              },
            ]
          : [],
      values,
    })
    return kind === 'character' ? composed.char : composed.outfit
  }
  const previewText = composeFor(effective)

  // Axes the output depends on (fragment + item conditions)
  const referenced = new Set<string>(
    fragments.flatMap((f) => Object.keys(f.conditions)),
  )
  if (kind === 'item')
    for (const k of Object.keys(itemCond.value)) referenced.add(k)
  const referencedAxes = relevant.filter(
    (a) => referenced.has(String(a.id)) && a.values.length > 0,
  )
  const gridAxes = referencedAxes.filter(
    (a) => a.ownerCharacterId === null && a.ownerItemId === null,
  )
  const emptyValues = referencedAxes
    .map(
      (a) => a.values.find((v) => v.id === effective[String(a.id)])?.name ?? '',
    )
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              nameRef.current = e.target.value
              dirtyNameRef.current = true
              scheduleSave()
            }}
            aria-label={t('library.name')}
            placeholder={t('library.namePlaceholder')}
            className="h-10 min-w-0 flex-1 text-base font-medium"
          />
          {row.projectId !== null && (
            <Badge variant="outline" data-project-only>
              {project
                ? t('library.projectOnlyOf', { name: project.name })
                : t('library.projectOnly')}
            </Badge>
          )}
        </div>
        <Textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
            descRef.current = e.target.value
            dirtyDescRef.current = true
            scheduleSave()
          }}
          aria-label={t('library.description')}
          placeholder={t('library.descriptionPlaceholder')}
          rows={2}
          className="min-h-[3.25rem] text-sm"
        />
      </div>

      <section className="space-y-2">
        <Label className="text-sm text-muted-foreground">
          {t('library.localAxes')}
        </Label>
        <LocalAxes
          axes={ownerAxes}
          owner={
            kind === 'character' ? { characterId: row.id } : { itemId: row.id }
          }
        />
      </section>

      {kind === 'item' && (
        <section className="space-y-2">
          <Label className="text-sm text-muted-foreground">
            {t('library.itemCondition')}
          </Label>
          <div>
            <ConditionEditor
              condition={itemCond.value}
              axes={relevant}
              onChange={itemCond.commit}
              prefix={t('library.onlyWhen')}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t('library.itemConditionHint')}
          </p>
        </section>
      )}

      {kind === 'item' && (
        <ItemOcclusion
          itemId={row.id}
          areas={areas}
          areaIds={row.areaIds ?? []}
          coverRules={row.coverRules ?? []}
          relevant={relevant}
        />
      )}

      {kind === 'item' && (
        <ItemVariables itemId={row.id} variables={row.variables ?? []} />
      )}

      <section className="space-y-2">
        <Label className="text-sm text-muted-foreground">
          {t('library.fragments')}
        </Label>
        {row.fragments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('library.noFragments')}
          </p>
        )}
        <SortableList
          ids={fragOrder.ids}
          onReorder={(ids) => fragOrder.reorder(ids)}
        >
          <div className="space-y-2">
            {fragOrder.items.map((f) => (
              <FragmentRow
                key={f.id}
                id={f.id}
                initialText={f.text}
                conditions={f.conditions}
                axes={relevant}
                bundleNames={bundleNames}
                areas={kind === 'item' ? areas : undefined}
                areaIds={f.areaIds}
                varNames={
                  kind === 'item'
                    ? (row.variables ?? []).map((v) => v.name)
                    : []
                }
                onTextChange={(id, text) =>
                  setDrafts((d) => ({ ...d, [id]: text }))
                }
              />
            ))}
          </div>
        </SortableList>
        <AddRowButton
          label={t('library.addFragment')}
          data-add-fragment
          className="max-w-[32rem]"
          onClick={() => void addFragment()}
        />
      </section>

      {gridAxes.length > 0 && (
        <CombinationGrid
          axes={gridAxes}
          effective={effective}
          isEmpty={(pick) =>
            !composeFor(effectiveAxisValues(relevant, [previewValues, pick]))
          }
          onPick={(pick) => setPreviewValues((p) => ({ ...p, ...pick }))}
        />
      )}

      <section className="space-y-3 rounded-xl border border-border bg-card/40 p-3">
        <div>
          <Label className="text-sm">{t('library.preview')}</Label>
          <p className="text-xs text-muted-foreground">
            {t('library.previewHint')}
          </p>
        </div>
        <div className="space-y-2">
          {relevant.map((axis) => (
            <AxisSegmented
              key={axis.id}
              axis={axis}
              value={effective[String(axis.id)] ?? null}
              defaultBadge
              onChange={(v) =>
                setPreviewValues((p) => {
                  const next = { ...p }
                  if (v === null) delete next[String(axis.id)]
                  else next[String(axis.id)] = v
                  return next
                })
              }
            />
          ))}
        </div>
        <div
          data-preview-output
          className="min-h-10 whitespace-pre-wrap break-words rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
        >
          {previewText || (
            <span className="text-muted-foreground" data-preview-empty>
              {emptyValues
                ? t(
                    kind === 'character'
                      ? 'library.previewEmptyChar'
                      : 'library.previewEmptyItem',
                    { values: emptyValues },
                  )
                : t('library.previewEmpty')}
            </span>
          )}
        </div>
      </section>

      <LibraryImagesSection
        kind={kind}
        id={row.id}
        imageCount={row.imageCount}
        thumbnailImageId={row.thumbnailImageId}
      />
    </div>
  )
}
