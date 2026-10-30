import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  FileImportIcon,
  Film02Icon,
} from '@hugeicons/core-free-icons'
import { ImportDialog } from './import-dialog'
import { PacksPane } from './scene-templates/packs-pane'
import { ScenesPane } from './scene-templates/scenes-pane'
import { SceneEditor } from './scene-templates/scene-editor'
import { TextPromptDialog } from './scene-templates/text-prompt-dialog'
import type { PackListItem } from './scene-templates/packs-pane'
import type { SceneItem } from './scene-templates/scenes-pane'
import type { TranslationKeys } from '@/lib/i18n/types'
import { useTranslation } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  TEMPLATES_LAYOUT_DEFAULT,
  isDuplicateName,
  moveId,
  parseTemplatesLayout,
} from '@/lib/scene-templates'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  createScenePack,
  deleteScenePack,
  duplicateScenePack,
  getScenePack,
  listScenePacks,
  updateScenePack,
} from '@/server/functions/scene-packs'
import {
  createScene,
  deleteScene,
  duplicateScene,
  reorderScenes,
  updateScene,
} from '@/server/functions/scenes'
import { assignScenePack } from '@/server/functions/projects'

const LAYOUT_KEY = '87studio-templates-layout'

type PackDetail = Awaited<ReturnType<typeof getScenePack>>
type Step = 'packs' | 'scenes' | 'editor'

type PromptTarget =
  | { kind: 'pack-name'; id: number; value: string }
  | { kind: 'pack-description'; id: number; value: string }
  | { kind: 'scene-name'; id: number; value: string }

type ConfirmTarget =
  | { kind: 'pack'; id: number; name: string }
  | { kind: 'scene'; id: number; name: string }

function readLayout() {
  try {
    return (
      parseTemplatesLayout(window.localStorage.getItem(LAYOUT_KEY)) ??
      TEMPLATES_LAYOUT_DEFAULT
    )
  } catch {
    return TEMPLATES_LAYOUT_DEFAULT
  }
}

interface ScenePackDialogProps {
  projectId: number
  /** `@{slot:…}` names used by the project's prompts (key suggestions) */
  slotNames?: Array<string>
  /** Controlled open state (optional; uncontrolled by default). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ScenePackDialog({
  projectId,
  slotNames = [],
  open: openProp,
  onOpenChange,
}: ScenePackDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  const [packs, setPacks] = useState<Array<PackListItem>>([])
  const [pack, setPack] = useState<PackDetail | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [step, setStep] = useState<Step>('packs')
  const [importOpen, setImportOpen] = useState(false)
  const [prompt, setPrompt] = useState<PromptTarget | null>(null)
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null)
  const [applying, setApplying] = useState(false)

  const editorFlushRef = useRef<(() => Promise<void>) | null>(null)
  const savesRef = useRef(new Set<Promise<void>>())
  const trackSave = useCallback((save: Promise<void>) => {
    savesRef.current.add(save)
    void save.finally(() => savesRef.current.delete(save))
  }, [])
  const settleSaves = useCallback(async () => {
    await editorFlushRef.current?.()
    await Promise.allSettled([...savesRef.current])
  }, [])

  const [layout] = useState(readLayout)
  const allowSaveRef = useRef(false)

  const scenes = pack?.scenes ?? []
  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null

  const loadPacks = useCallback(async () => {
    const result = await listScenePacks()
    setPacks(result)
    return result
  }, [])

  const openPack = useCallback(
    async (id: number, advance = false, isCancelled?: () => boolean) => {
      const detail = await getScenePack({ data: id })
      if (isCancelled?.()) return
      setPack(detail)
      setChecked(new Set(detail.scenes.map((s) => s.id)))
      setSelectedSceneId(detail.scenes.at(0)?.id ?? null)
      if (advance) setStep('scenes')
    },
    [],
  )

  // Load on open: select the first pack
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStep('packs')
    setPack(null)
    setSelectedSceneId(null)
    ;(async () => {
      try {
        // A save started by closing the dialog must land before we read
        await settleSaves()
        if (cancelled) return
        const list = await loadPacks()
        if (cancelled || list.length === 0) return
        await openPack(list[0].id, false, () => cancelled)
      } catch {
        if (!cancelled) toast.error(t('templates.actionFailed'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  // Keep the pack list's scene count in sync with local edits
  useEffect(() => {
    if (!pack) return
    setPacks((prev) =>
      prev.map((p) =>
        p.id === pack.id && p.sceneCount !== pack.scenes.length
          ? { ...p, sceneCount: pack.scenes.length }
          : p,
      ),
    )
  }, [pack])

  function patchPack(patch: Partial<PackListItem>, id: number) {
    setPacks((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    setPack((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }

  function patchScene(id: number, patch: Partial<SceneItem>) {
    setPack((prev) =>
      prev
        ? {
            ...prev,
            scenes: prev.scenes.map((s) =>
              s.id === id ? { ...s, ...patch } : s,
            ),
          }
        : prev,
    )
  }

  const fail = useCallback(
    (key: TranslationKeys = 'templates.actionFailed') => toast.error(t(key)),
    [t],
  )

  // ── Pack actions ──
  async function handleImported(packId: number) {
    await loadPacks()
    await openPack(packId, true)
  }

  async function handleCreatePack(name: string, description: string) {
    try {
      const created = await createScenePack({
        data: { name, description: description || undefined },
      })
      toast.success(t('templates.packCreated'))
      await loadPacks()
      await openPack(created.id, true)
    } catch {
      fail('templates.createPackFailed')
      throw new Error('create failed')
    }
  }

  async function handlePackText(target: PromptTarget, value: string) {
    try {
      if (target.kind === 'pack-name') {
        await updateScenePack({ data: { id: target.id, name: value } })
        patchPack({ name: value }, target.id)
        toast.success(t('templates.packRenamed'))
      } else if (target.kind === 'pack-description') {
        await updateScenePack({ data: { id: target.id, description: value } })
        patchPack({ description: value || null }, target.id)
        toast.success(t('templates.packUpdated'))
      } else {
        const ok = await renameScene(
          scenes.find((s) => s.id === target.id),
          value,
        )
        if (!ok) throw new Error('rejected')
      }
    } catch {
      fail()
      throw new Error('prompt failed')
    }
  }

  async function handleDuplicatePack(source: PackListItem) {
    try {
      if (pack?.id === source.id) await settleSaves()
      const dup = await duplicateScenePack({ data: source.id })
      toast.success(t('templates.packDuplicated'))
      await loadPacks()
      await openPack(dup.id)
    } catch {
      fail()
    }
  }

  async function handleDeletePack(id: number) {
    try {
      await deleteScenePack({ data: id })
      toast.success(t('templates.packDeleted'))
      const list = await loadPacks()
      if (pack?.id === id) {
        setPack(null)
        setSelectedSceneId(null)
        setStep('packs')
        if (list.length > 0) await openPack(list[0].id)
      }
    } catch {
      fail('templates.deletePackFailed')
    }
  }

  // ── Scene actions ──
  function selectScene(id: number) {
    setSelectedSceneId(id)
    if (isMobile) setStep('editor')
  }

  async function handleAddScene(name: string, copyFromId: number | null) {
    if (!pack) return
    try {
      const source = copyFromId
        ? scenes.find((s) => s.id === copyFromId)
        : undefined
      const created = await createScene({
        data: {
          scenePackId: pack.id,
          name,
          placeholders: source?.placeholders ?? undefined,
          axisValues: source
            ? JSON.parse(source.axisValues || '{}')
            : undefined,
        },
      })
      setPack((prev) =>
        prev ? { ...prev, scenes: [...prev.scenes, created] } : prev,
      )
      setChecked((prev) => new Set(prev).add(created.id))
      selectScene(created.id)
      toast.success(t('templates.sceneAdded'))
    } catch {
      fail('templates.addSceneFailed')
      throw new Error('add failed')
    }
  }

  async function renameScene(
    scene: SceneItem | undefined,
    name: string,
  ): Promise<boolean> {
    if (!scene) return false
    const trimmed = name.trim()
    if (
      isDuplicateName(
        scenes.map((s) => s.name),
        trimmed,
        scene.name,
      )
    ) {
      toast.error(t('templates.duplicateSceneName'))
      return false
    }
    try {
      await updateScene({ data: { id: scene.id, name: trimmed } })
      patchScene(scene.id, { name: trimmed })
      return true
    } catch {
      fail()
      return false
    }
  }

  async function handleDuplicateScene(scene: SceneItem) {
    try {
      if (scene.id === selectedSceneId) await settleSaves()
      const dup = await duplicateScene({ data: scene.id })
      setPack((prev) =>
        prev ? { ...prev, scenes: [...prev.scenes, dup] } : prev,
      )
      setChecked((prev) => new Set(prev).add(dup.id))
      selectScene(dup.id)
      toast.success(t('templates.sceneDuplicated'))
    } catch {
      fail()
    }
  }

  async function handleMoveScene(scene: SceneItem, direction: 'up' | 'down') {
    if (!pack) return
    const ids = moveId(
      scenes.map((s) => s.id),
      scene.id,
      direction,
    )
    if (!ids) return
    const byId = new Map(scenes.map((s) => [s.id, s]))
    const previous = pack.scenes
    setPack({
      ...pack,
      scenes: ids.map((id, i) => ({ ...byId.get(id)!, sortOrder: i })),
    })
    try {
      await reorderScenes({ data: { scenePackId: pack.id, orderedIds: ids } })
    } catch {
      setPack((prev) => (prev ? { ...prev, scenes: previous } : prev))
      fail()
    }
  }

  async function handleDeleteScene(id: number) {
    if (!pack) return
    try {
      await deleteScene({ data: id })
      const index = scenes.findIndex((s) => s.id === id)
      const remaining = scenes.filter((s) => s.id !== id)
      setPack({ ...pack, scenes: remaining })
      setChecked((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      if (selectedSceneId === id) {
        const neighbour = remaining.at(Math.min(index, remaining.length - 1))
        setSelectedSceneId(neighbour?.id ?? null)
        if (isMobile) setStep('scenes')
      }
      toast.success(t('templates.sceneDeleted'))
    } catch {
      fail('templates.deleteSceneFailed')
    }
  }

  function handleValuesChange(sceneId: number, json: string) {
    patchScene(sceneId, { placeholders: json })
  }

  function handleAxisValuesChange(sceneId: number, json: string) {
    patchScene(sceneId, { axisValues: json })
  }

  // ── Apply ──
  function toggleChecked(id: number, next: boolean) {
    setChecked((prev) => {
      const set = new Set(prev)
      if (next) set.add(id)
      else set.delete(id)
      return set
    })
  }

  const checkedCount = scenes.filter((s) => checked.has(s.id)).length
  const allChecked = scenes.length > 0 && checkedCount === scenes.length

  async function handleApply() {
    if (!pack || checkedCount === 0 || applying) return
    setApplying(true)
    try {
      await settleSaves()
      await assignScenePack({
        data: {
          projectId,
          scenePackId: pack.id,
          sceneIds: allChecked
            ? undefined
            : scenes.filter((s) => checked.has(s.id)).map((s) => s.id),
        },
      })
      toast.success(t('templates.templateApplied'))
      setOpen(false)
      router.invalidate()
    } catch {
      toast.error(t('templates.applyFailed'))
    } finally {
      setApplying(false)
    }
  }

  const packActions = {
    onCreate: handleCreatePack,
    onRename: (p: PackListItem) =>
      setPrompt({ kind: 'pack-name', id: p.id, value: p.name }),
    onEditDescription: (p: PackListItem) =>
      setPrompt({
        kind: 'pack-description',
        id: p.id,
        value: p.description ?? '',
      }),
    onDuplicate: handleDuplicatePack,
    onDelete: (p: PackListItem) =>
      setConfirm({ kind: 'pack', id: p.id, name: p.name }),
  }

  const sceneActions = {
    onAdd: handleAddScene,
    onRename: (s: SceneItem) =>
      setPrompt({ kind: 'scene-name', id: s.id, value: s.name }),
    onDuplicate: handleDuplicateScene,
    onMove: handleMoveScene,
    onDelete: (s: SceneItem) =>
      setConfirm({ kind: 'scene', id: s.id, name: s.name }),
  }

  const packsPane = (
    <PacksPane
      packs={packs}
      selectedId={pack?.id ?? null}
      onSelect={(id) => {
        if (id === pack?.id) {
          if (isMobile) setStep('scenes')
          return
        }
        void settleSaves().then(() => openPack(id, true))
      }}
      actions={packActions}
    />
  )

  const scenesPane = pack ? (
    <ScenesPane
      scenes={scenes}
      selectedId={selectedSceneId}
      onSelect={selectScene}
      checked={checked}
      onToggleChecked={toggleChecked}
      actions={sceneActions}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
      {packs.length === 0
        ? t('templates.createPackToStart')
        : t('templates.selectPack')}
    </div>
  )

  const editorPane = selectedScene ? (
    <SceneEditor
      key={selectedScene.id}
      scene={selectedScene}
      otherScenes={scenes.filter((s) => s.id !== selectedScene.id)}
      slotNames={slotNames}
      onRename={renameScene}
      onValuesChange={handleValuesChange}
      onAxisValuesChange={handleAxisValuesChange}
      onDuplicate={handleDuplicateScene}
      onDelete={sceneActions.onDelete}
      flushRef={editorFlushRef}
      trackSave={trackSave}
    />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <HugeiconsIcon
        icon={Film02Icon}
        className="size-6 text-muted-foreground/30"
      />
      <p className="text-sm text-muted-foreground">
        {pack && scenes.length === 0
          ? t('templates.noScenesYet')
          : t('templates.selectSceneToEdit')}
      </p>
    </div>
  )

  const stepTitle =
    step === 'packs'
      ? t('templates.title')
      : step === 'scenes'
        ? (pack?.name ?? t('templates.stepScenes'))
        : (selectedScene?.name ?? t('templates.stepEditor'))

  const showFooter = !!pack && (!isMobile || step === 'scenes')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <HugeiconsIcon icon={Film02Icon} className="size-5" />
          <span className="hidden sm:inline">{t('templates.title')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none p-0 sm:max-w-none md:top-1/2 md:left-1/2 md:h-[88vh] md:w-[min(1200px,94vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl flex flex-col"
        data-testid="templates-dialog"
      >
        <DialogHeader className="flex shrink-0 flex-row items-center gap-2 border-b border-border py-3 pr-14 pl-4">
          {isMobile && step !== 'packs' && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setStep(step === 'editor' ? 'scenes' : 'packs')}
              aria-label={t('common.back')}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            </Button>
          )}
          <DialogTitle className="min-w-0 flex-1 truncate text-base">
            {isMobile ? stepTitle : t('templates.title')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('templates.description')}
          </DialogDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            title={t('import.title')}
          >
            <HugeiconsIcon icon={FileImportIcon} className="size-4" />
            <span className="hidden sm:inline">{t('templates.importSd')}</span>
          </Button>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          {isMobile ? (
            <div className="h-full min-h-0">
              {step === 'packs' && packsPane}
              {step === 'scenes' && scenesPane}
              {step === 'editor' && editorPane}
            </div>
          ) : (
            <ResizablePanelGroup
              id="templates"
              orientation="horizontal"
              defaultLayout={layout as unknown as Record<string, number>}
              onLayoutChanged={(next, meta) => {
                if (meta.isUserInteraction) allowSaveRef.current = true
                if (!allowSaveRef.current) return
                const parsed = parseTemplatesLayout(JSON.stringify(next))
                if (!parsed) return
                try {
                  window.localStorage.setItem(
                    LAYOUT_KEY,
                    JSON.stringify(parsed),
                  )
                } catch {
                  // storage unavailable
                }
              }}
            >
              <ResizablePanel id="packs" minSize="10%" maxSize="30%">
                {packsPane}
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="scenes" minSize="14%" maxSize="40%">
                {scenesPane}
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="editor" minSize="30%">
                {editorPane}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>

        {showFooter && (
          <div
            className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-card px-4 py-3"
            data-testid="templates-footer"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground max-md:basis-full">
              {t('templates.selectedSummary', {
                pack: pack.name,
                checked: checkedCount,
                total: scenes.length,
              })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={scenes.length === 0}
              onClick={() =>
                setChecked(
                  allChecked ? new Set() : new Set(scenes.map((s) => s.id)),
                )
              }
            >
              {allChecked
                ? t('templates.selectNone')
                : t('templates.selectAll')}
            </Button>
            <Button
              size="sm"
              disabled={checkedCount === 0 || applying}
              onClick={() => void handleApply()}
              data-testid="apply-scenes"
            >
              {checkedCount === 1
                ? t('templates.applyOne')
                : t('templates.applyCount', { count: checkedCount })}
            </Button>
          </div>
        )}
      </DialogContent>

      <TextPromptDialog
        open={prompt !== null}
        onOpenChange={(next) => {
          if (!next) setPrompt(null)
        }}
        title={
          prompt?.kind === 'pack-description'
            ? t('templates.editDescriptionTitle')
            : prompt?.kind === 'pack-name'
              ? t('templates.renamePackTitle')
              : t('scene.renameScene')
        }
        initial={prompt?.value ?? ''}
        multiline={prompt?.kind === 'pack-description'}
        allowEmpty={prompt?.kind === 'pack-description'}
        error={(value) => {
          if (prompt?.kind === 'pack-name') {
            return isDuplicateName(
              packs.map((p) => p.name),
              value,
              prompt.value,
            )
              ? t('templates.duplicatePackName')
              : null
          }
          if (prompt?.kind === 'scene-name') {
            return isDuplicateName(
              scenes.map((s) => s.name),
              value,
              prompt.value,
            )
              ? t('templates.duplicateSceneName')
              : null
          }
          return null
        }}
        onSubmit={(value) =>
          prompt ? handlePackText(prompt, value) : undefined
        }
      />

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirm(null)
          }}
          title={
            confirm.kind === 'pack'
              ? t('templates.deleteScenePack')
              : t('templates.deleteSceneTitle')
          }
          description={
            confirm.kind === 'pack'
              ? t('templates.deletePackDesc', { name: confirm.name })
              : t('templates.deleteSceneDesc', { name: confirm.name })
          }
          onConfirm={() =>
            confirm.kind === 'pack'
              ? handleDeletePack(confirm.id)
              : handleDeleteScene(confirm.id)
          }
        />
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />
    </Dialog>
  )
}
