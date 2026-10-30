import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Copy01Icon,
  Delete02Icon,
  Edit02Icon,
} from '@hugeicons/core-free-icons'
import type { ListEntry } from '@/components/library/library-list'
import type { MenuEntry } from '@/components/workspace/scene-templates/row-menu'
import { LibraryList } from '@/components/library/library-list'
import { OwnerDetail } from '@/components/library/owner-detail'
import { PresetDetail } from '@/components/library/preset-detail'
import { AreasEditor } from '@/components/library/areas-editor'
import { AxisEditor } from '@/components/library/axis-editor'
import { CommitInput } from '@/components/library/commit-input'
import { NewAxisForm } from '@/components/library/local-axes'
import { NameForm } from '@/components/library/name-form'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { MasterDetail } from '@/components/common/master-detail'
import { usePageHeader } from '@/components/layout/breadcrumb-context'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTranslation } from '@/lib/i18n'
import { nextCopyName } from '@/lib/scene-templates'
import { cn } from '@/lib/utils'
import {
  createLibraryCharacter,
  createOutfitItem,
  createPreset,
  deleteAxis,
  deleteLibraryCharacter,
  deleteOutfitItem,
  deletePreset,
  duplicateLibraryCharacter,
  duplicateOutfitItem,
  getLibrary,
  getLibraryUsage,
  renameAxis,
  reorderAxes,
  updateLibraryCharacter,
  updateOutfitItem,
  updatePreset,
} from '@/server/functions/library'

type Tab = 'characters' | 'outfits' | 'presets' | 'axes'
const TABS: ReadonlyArray<Tab> = ['characters', 'outfits', 'presets', 'axes']

function toId(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

export const Route = createFileRoute('/characters/')({
  component: CharactersPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: Tab; id?: number; projectId?: number; areas?: true } => ({
    tab: TABS.includes(search.tab as Tab) ? (search.tab as Tab) : undefined,
    id: toId(search.id),
    projectId: toId(search.projectId),
    areas: search.areas ? true : undefined,
  }),
})

type DeleteTarget = {
  tab: Tab
  id: number
  name: string
  /** Usage line (characters / items only) */
  usage?: string
}

function CharactersPage() {
  const {
    tab: tabParam,
    id: selectedId,
    projectId,
    areas: areasParam,
  } = Route.useSearch()
  const tab: Tab = tabParam ?? 'characters'
  const areasView = tab === 'axes' && !!areasParam && selectedId === undefined
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: lib } = useQuery({
    queryKey: ['library', projectId ?? null],
    queryFn: () => getLibrary({ data: { projectId } }),
    staleTime: 0,
    refetchOnWindowFocus: 'always',
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['library'] })
  const onError = (e: Error) => toast.error(e.message || t('library.failed'))

  const [renaming, setRenaming] = useState<{
    tab: Tab
    id: number
    name: string
  } | null>(null)
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null)

  const characters = lib?.characters ?? []
  const items = lib?.items ?? []
  const presets = lib?.presets ?? []
  const areas = lib?.areas ?? []
  const globalAxes = (lib?.axes ?? []).filter(
    (a) => a.ownerCharacterId === null && a.ownerItemId === null,
  )

  const counts: Record<Tab, number> = {
    characters: characters.length,
    outfits: items.length,
    presets: presets.length,
    axes: globalAxes.length,
  }
  usePageHeader({ count: lib ? counts[tab] : null })

  function select(id: number | null, nextTab: Tab = tab, showAreas = false) {
    void navigate({
      to: '/characters',
      search: {
        tab: nextTab === 'characters' ? undefined : nextTab,
        id: id ?? undefined,
        projectId,
        areas: showAreas ? true : undefined,
        imageDetail: undefined,
      },
      // Opening a detail from the mobile list is a real step (phone Back
      // returns to the list); everything else replaces.
      replace: !(
        isMobile &&
        (id !== null || showAreas) &&
        selectedId === undefined &&
        !areasView
      ),
    })
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  const create = useMutation({
    mutationFn: async (v: { name: string; values?: Array<string> }) => {
      if (tab === 'characters')
        return createLibraryCharacter({ data: { name: v.name } })
      if (tab === 'outfits') return createOutfitItem({ data: { name: v.name } })
      return createPreset({ data: { name: v.name } })
    },
    onSuccess: async (row) => {
      await refresh()
      select(row.id)
    },
    onError,
  })

  const rename = useMutation({
    mutationFn: async (v: { tab: Tab; id: number; name: string }) => {
      if (v.tab === 'characters')
        return updateLibraryCharacter({ data: { id: v.id, name: v.name } })
      if (v.tab === 'outfits')
        return updateOutfitItem({ data: { id: v.id, name: v.name } })
      if (v.tab === 'presets')
        return updatePreset({ data: { id: v.id, name: v.name } })
      return renameAxis({ data: { id: v.id, name: v.name } })
    },
    onSuccess: () => refresh(),
    onError,
  })

  const duplicate = useMutation({
    mutationFn: async (v: { tab: Tab; id: number }) => {
      if (v.tab === 'characters')
        return duplicateLibraryCharacter({ data: v.id })
      if (v.tab === 'outfits') return duplicateOutfitItem({ data: v.id })
      const src = presets.find((p) => p.id === v.id)
      if (!src) throw new Error(t('library.notFound'))
      return createPreset({
        data: {
          name: nextCopyName(
            src.name,
            presets.map((p) => p.name),
          ),
          description: src.description ?? undefined,
          itemIds: src.itemIds,
        },
      })
    },
    onSuccess: async (row) => {
      await refresh()
      select(row.id)
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: async (v: DeleteTarget) => {
      if (v.tab === 'characters') return deleteLibraryCharacter({ data: v.id })
      if (v.tab === 'outfits') return deleteOutfitItem({ data: v.id })
      if (v.tab === 'presets') return deletePreset({ data: v.id })
      return deleteAxis({ data: v.id })
    },
    onSuccess: async (_r, v) => {
      await refresh()
      if (selectedId === v.id) select(null)
    },
    onError,
  })

  const moveAxis = useMutation({
    mutationFn: (ids: Array<number>) => reorderAxes({ data: { ids } }),
    onSuccess: () => refresh(),
    onError,
  })

  async function askDelete(entry: ListEntry) {
    const target: DeleteTarget = { tab, id: entry.id, name: entry.title }
    if (tab === 'characters' || tab === 'outfits') {
      try {
        const u = await getLibraryUsage({
          data: {
            kind: tab === 'characters' ? 'character' : 'item',
            id: entry.id,
          },
        })
        target.usage =
          u.slots > 0
            ? t('library.deleteUsed', { slots: u.slots, projects: u.projects })
            : t('library.deleteUnused')
      } catch {
        // fall through without usage info
      }
    } else if (tab === 'presets') {
      target.usage = t('library.deletePresetDesc')
    } else {
      target.usage = t('library.deleteAxisDesc')
    }
    setDeleting(target)
  }

  function menuFor(entry: ListEntry, index: number): Array<MenuEntry> {
    const entries: Array<MenuEntry> = [
      {
        id: 'rename',
        label: t('library.rename'),
        icon: Edit02Icon,
        onSelect: () => setRenaming({ tab, id: entry.id, name: entry.title }),
      },
    ]
    if (tab === 'axes') {
      const ids = globalAxes.map((a) => a.id)
      const swap = (dir: -1 | 1) => {
        const next = [...ids]
        const j = index + dir
        ;[next[index], next[j]] = [next[j], next[index]]
        moveAxis.mutate(next)
      }
      entries.push(
        {
          id: 'up',
          label: t('library.moveUp'),
          icon: ArrowUp01Icon,
          disabled: index <= 0,
          onSelect: () => swap(-1),
        },
        {
          id: 'down',
          label: t('library.moveDown'),
          icon: ArrowDown01Icon,
          disabled: index >= ids.length - 1,
          onSelect: () => swap(1),
        },
      )
    } else {
      entries.push({
        id: 'duplicate',
        label: t('library.duplicate'),
        icon: Copy01Icon,
        onSelect: () => duplicate.mutate({ tab, id: entry.id }),
      })
    }
    entries.push({
      id: 'delete',
      label: t('library.delete'),
      icon: Delete02Icon,
      destructive: true,
      separator: true,
      onSelect: () => void askDelete(entry),
    })
    return entries
  }

  // ─── List data per tab ────────────────────────────────────────────────────

  const entries: Array<ListEntry> =
    tab === 'characters'
      ? characters.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: t('library.fragmentCount', { count: c.fragments.length }),
          projectOnly: c.projectId !== null,
          hasThumb: true,
          thumbnailPath: c.thumbnailPath,
        }))
      : tab === 'outfits'
        ? items.map((c) => ({
            id: c.id,
            title: c.name,
            subtitle: t('library.fragmentCount', {
              count: c.fragments.length,
            }),
            projectOnly: c.projectId !== null,
            hasThumb: true,
            thumbnailPath: c.thumbnailPath,
          }))
        : tab === 'presets'
          ? presets.map((p) => ({
              id: p.id,
              title: p.name,
              subtitle: t('library.itemCount', { count: p.itemIds.length }),
            }))
          : globalAxes.map((a) => ({
              id: a.id,
              title: a.name,
              subtitle: a.values.map((v) => v.name).join(' · '),
            }))

  const tabLabels: Record<Tab, string> = {
    characters: t('library.tabCharacters'),
    outfits: t('library.tabOutfits'),
    presets: t('library.tabPresets'),
    axes: t('library.tabAxes'),
  }
  const searchPlaceholders: Record<Tab, string> = {
    characters: t('library.searchCharacters'),
    outfits: t('library.searchOutfits'),
    presets: t('library.searchPresets'),
    axes: t('library.searchAxes'),
  }
  const emptyTexts: Record<Tab, string> = {
    characters: t('library.emptyCharacters'),
    outfits: t('library.emptyOutfits'),
    presets: t('library.emptyPresets'),
    axes: t('library.emptyAxes'),
  }
  const newTitles: Record<Tab, string> = {
    characters: t('library.newCharacter'),
    outfits: t('library.newOutfit'),
    presets: t('library.newPreset'),
    axes: t('library.newAxis'),
  }
  const selectTexts: Record<Tab, string> = {
    characters: t('library.selectCharacter'),
    outfits: t('library.selectOutfit'),
    presets: t('library.selectPreset'),
    axes: t('library.selectAxis'),
  }

  const header = (
    <div className="space-y-2">
      <Tabs value={tab} onValueChange={(v) => select(null, v as Tab)}>
        <TabsList className="grid w-full grid-cols-4">
          {TABS.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className="px-1 text-xs sm:text-sm"
            >
              {tabLabels[id]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === 'axes' && (
        <button
          type="button"
          data-areas-entry
          data-active={areasView || undefined}
          onClick={() => select(null, 'axes', true)}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            areasView ? 'bg-primary/15' : 'bg-input/30 hover:bg-accent',
          )}
        >
          <span className="font-medium">{t('library.areasTitle')}</span>
          <span className="text-xs text-muted-foreground">
            {t('library.areaCount', { count: areas.length })}
          </span>
        </button>
      )}
    </div>
  )

  const listPane = (
    <LibraryList
      header={header}
      entries={entries}
      selectedId={selectedId ?? null}
      onSelect={(id) => select(id)}
      searchPlaceholder={searchPlaceholders[tab]}
      emptyText={emptyTexts[tab]}
      newTitle={newTitles[tab]}
      menuFor={menuFor}
      renderNewForm={(close) =>
        tab === 'axes' ? (
          <NewAxisForm
            autoFocus
            onCreated={(axis) => {
              close()
              select(axis.id)
            }}
          />
        ) : (
          <NameForm
            placeholder={t('library.namePlaceholder')}
            onSubmit={async (name) => {
              await create.mutateAsync({ name })
              close()
            }}
          />
        )
      }
    />
  )

  // ─── Detail ───────────────────────────────────────────────────────────────

  let detail: React.ReactNode = null
  if (selectedId !== undefined && lib) {
    if (tab === 'characters' || tab === 'outfits') {
      const row = (tab === 'characters' ? characters : items).find(
        (r) => r.id === selectedId,
      )
      detail = row ? (
        <OwnerDetail
          key={`${tab}-${row.id}`}
          kind={tab === 'characters' ? 'character' : 'item'}
          row={row}
          axes={lib.axes}
          areas={areas}
        />
      ) : null
    } else if (tab === 'presets') {
      const row = presets.find((p) => p.id === selectedId)
      detail = row ? (
        <PresetDetail
          key={row.id}
          preset={row}
          items={items.map((i) => ({
            id: i.id,
            name: i.name,
            projectId: i.projectId,
          }))}
        />
      ) : null
    } else {
      const axis = globalAxes.find((a) => a.id === selectedId)
      detail = axis ? (
        <div className="space-y-4 p-4 md:p-6" key={axis.id}>
          <div>
            <CommitInput
              value={axis.name}
              onCommit={(name) =>
                rename.mutate({ tab: 'axes', id: axis.id, name })
              }
              aria-label={t('library.renameAxis')}
              className="h-10 text-base font-medium"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('library.globalAxesHint')}
            </p>
          </div>
          <AxisEditor axis={axis} hideName onDeleted={() => select(null)} />
        </div>
      ) : null
    }
    if (!detail) {
      detail = (
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          {t('library.notFound')}
        </div>
      )
    }
  } else if (areasView && lib) {
    detail = <AreasEditor areas={areas} items={items} />
  } else if (selectedId === undefined) {
    detail = (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {selectTexts[tab]}
      </div>
    )
  }

  return (
    <>
      <MasterDetail
        id={`characters-${tab}`}
        list={listPane}
        detail={detail}
        hasSelection={selectedId !== undefined || areasView}
        onBack={() => select(null)}
        backLabel={tabLabels[tab]}
      />

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('library.renameTitle')}</DialogTitle>
          </DialogHeader>
          {renaming && (
            <NameForm
              key={`${renaming.tab}-${renaming.id}`}
              placeholder={t('library.namePlaceholder')}
              initial={renaming.name}
              actionLabel={t('common.save')}
              onSubmit={async (name) => {
                await rename.mutateAsync({ ...renaming, name })
                setRenaming(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('library.deleteTitle', { name: deleting?.name ?? '' })}
        description={deleting?.usage ?? ''}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting)
        }}
      />
    </>
  )
}
