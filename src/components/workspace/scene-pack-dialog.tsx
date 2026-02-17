import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Film02Icon,
  Add01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  Delete02Icon,
  PencilEdit01Icon,
  Tick02Icon,
  FileImportIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  listScenePacks,
  createScenePack,
  deleteScenePack,
  getScenePack,
} from '@/server/functions/scene-packs'
import { createScene, updateScene, deleteScene } from '@/server/functions/scenes'
import { assignScenePack } from '@/server/functions/projects'
import { ImportDialog } from './import-dialog'

interface ScenePackDialogProps {
  projectId: number
}

type PackListItem = Awaited<ReturnType<typeof listScenePacks>>[number]
type PackDetail = Awaited<ReturnType<typeof getScenePack>>
type SceneItem = PackDetail['scenes'][number]

export function ScenePackDialog({ projectId }: ScenePackDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [packs, setPacks] = useState<PackListItem[]>([])
  const [selectedPack, setSelectedPack] = useState<PackDetail | null>(null)

  // New pack form
  const [newPackName, setNewPackName] = useState('')
  const [creatingPack, setCreatingPack] = useState(false)

  // New scene form
  const [newSceneName, setNewSceneName] = useState('')
  const [addingScene, setAddingScene] = useState(false)

  // Import dialog
  const [importOpen, setImportOpen] = useState(false)

  // Expanded scenes in accordion
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set())

  const loadPacks = useCallback(async () => {
    const result = await listScenePacks()
    setPacks(result)
  }, [])

  useEffect(() => {
    if (open) {
      loadPacks()
      setSelectedPack(null)
      setExpandedScenes(new Set())
    }
  }, [open, loadPacks])

  async function handleSelectPack(id: number) {
    const detail = await getScenePack({ data: id })
    setSelectedPack(detail)
    setExpandedScenes(new Set())
  }

  async function handleImported(packId: number) {
    await loadPacks()
    const detail = await getScenePack({ data: packId })
    setSelectedPack(detail)
  }

  async function handleCreatePack() {
    if (!newPackName.trim()) return
    try {
      const pack = await createScenePack({ data: { name: newPackName.trim() } })
      setNewPackName('')
      setCreatingPack(false)
      toast.success('Pack created')
      await loadPacks()
      const detail = await getScenePack({ data: pack.id })
      setSelectedPack(detail)
    } catch {
      toast.error('Failed to create pack')
    }
  }

  async function handleDeletePack(id: number) {
    try {
      await deleteScenePack({ data: id })
      toast.success('Pack deleted')
      setSelectedPack(null)
      await loadPacks()
    } catch {
      toast.error('Failed to delete pack')
    }
  }

  async function handleAssignToProject(scenePackId: number) {
    try {
      await assignScenePack({ data: { projectId, scenePackId } })
      toast.success('Template applied to project')
      setOpen(false)
      router.invalidate()
    } catch {
      toast.error('Failed to apply template')
    }
  }

  async function handleAddScene() {
    if (!newSceneName.trim() || !selectedPack) return
    try {
      const scene = await createScene({ data: { scenePackId: selectedPack.id, name: newSceneName.trim() } })
      setNewSceneName('')
      setAddingScene(false)
      const detail = await getScenePack({ data: selectedPack.id })
      setSelectedPack(detail)
      // Auto-expand the new scene
      setExpandedScenes((prev) => new Set([...prev, scene.id]))
      toast.success('Scene added')
    } catch {
      toast.error('Failed to add scene')
    }
  }

  async function handleDeleteScene(sceneId: number) {
    try {
      await deleteScene({ data: sceneId })
      if (selectedPack) {
        const detail = await getScenePack({ data: selectedPack.id })
        setSelectedPack(detail)
      }
      setExpandedScenes((prev) => {
        const next = new Set(prev)
        next.delete(sceneId)
        return next
      })
      toast.success('Scene deleted')
    } catch {
      toast.error('Failed to delete scene')
    }
  }

  async function handleSceneUpdated() {
    if (!selectedPack) return
    const detail = await getScenePack({ data: selectedPack.id })
    setSelectedPack(detail)
  }

  function toggleScene(sceneId: number) {
    setExpandedScenes((prev) => {
      const next = new Set(prev)
      if (next.has(sceneId)) {
        next.delete(sceneId)
      } else {
        next.add(sceneId)
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <HugeiconsIcon icon={Film02Icon} className="size-5" />
          <span className="hidden sm:inline">Templates</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] min-h-[70vh] sm:min-h-0 overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0">
          <DialogTitle>Scene Templates</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Manage reusable scene packs and apply them to your project.
          </p>
        </DialogHeader>

        {/* Body: Two-panel layout */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0 sm:min-h-[50vh] overflow-hidden">
          {/* Mobile: Pack selector dropdown */}
          <div className="sm:hidden px-4 py-3 border-b border-border shrink-0">
            <div className="flex gap-2">
              <Select
                value={selectedPack ? String(selectedPack.id) : undefined}
                onValueChange={(v) => handleSelectPack(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a pack..." />
                </SelectTrigger>
                <SelectContent>
                  {packs.map((pack) => (
                    <SelectItem key={pack.id} value={String(pack.id)}>
                      {pack.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="shrink-0"
                title="Import"
              >
                <HugeiconsIcon icon={FileImportIcon} className="size-5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreatingPack(true)}
                className="shrink-0"
              >
                <HugeiconsIcon icon={Add01Icon} className="size-5" />
              </Button>
            </div>
          </div>

          {/* Desktop: Left sidebar - Pack list */}
          <div className="hidden sm:flex w-56 shrink-0 border-r border-border flex-col">
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Packs
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setImportOpen(true)}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                  title="Import SD Studio preset"
                >
                  <HugeiconsIcon icon={FileImportIcon} className="size-5" />
                </button>
                <button
                  onClick={() => setCreatingPack(true)}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                >
                  <HugeiconsIcon icon={Add01Icon} className="size-5" />
                </button>
              </div>
            </div>

            {/* Pack list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
              {packs.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => handleSelectPack(pack.id)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 text-base transition-colors ${
                    selectedPack?.id === pack.id
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'hover:bg-secondary/60 border border-transparent'
                  }`}
                >
                  <div className="font-medium truncate">{pack.name}</div>
                  {pack.description && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {pack.description}
                    </div>
                  )}
                </button>
              ))}
              {packs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No packs yet
                </p>
              )}
            </div>

            {/* Create pack form (bottom of sidebar) */}
            {creatingPack && (
              <div className="px-3 py-3 border-t border-border shrink-0 space-y-2">
                <Input
                  value={newPackName}
                  onChange={(e) => setNewPackName(e.target.value)}
                  placeholder="New pack name"
                  className="h-7 text-sm rounded-lg"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreatePack()
                    if (e.key === 'Escape') {
                      setCreatingPack(false)
                      setNewPackName('')
                    }
                  }}
                />
                <div className="flex gap-1.5">
                  <Button
                    size="xs"
                    onClick={handleCreatePack}
                    disabled={!newPackName.trim()}
                    className="flex-1"
                  >
                    Create
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setCreatingPack(false)
                      setNewPackName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile: Create pack form */}
          {creatingPack && (
            <div className="sm:hidden px-4 py-3 border-b border-border shrink-0 space-y-2">
              <Input
                value={newPackName}
                onChange={(e) => setNewPackName(e.target.value)}
                placeholder="New pack name"
                className="h-8 text-base rounded-lg"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreatePack()
                  if (e.key === 'Escape') {
                    setCreatingPack(false)
                    setNewPackName('')
                  }
                }}
              />
              <div className="flex gap-1.5">
                <Button size="sm" onClick={handleCreatePack} disabled={!newPackName.trim()} className="flex-1">
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setCreatingPack(false); setNewPackName('') }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Right content: Pack detail */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {selectedPack ? (
              <>
                {/* Pack header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0 gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold truncate">{selectedPack.name}</h3>
                    {selectedPack.description && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {selectedPack.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" onClick={() => handleAssignToProject(selectedPack.id)}>
                      <HugeiconsIcon icon={ArrowDown01Icon} className="size-5" />
                      <span className="hidden sm:inline">Apply to Project</span>
                      <span className="sm:hidden">Apply</span>
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                          <HugeiconsIcon icon={Delete02Icon} className="size-5" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      }
                      title="Delete Scene Pack"
                      description={`Delete "${selectedPack.name}" and all its scenes? This cannot be undone.`}
                      onConfirm={() => handleDeletePack(selectedPack.id)}
                    />
                  </div>
                </div>

                {/* Scenes list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {/* Section header */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Scenes ({selectedPack.scenes.length})
                    </span>
                    <Button size="sm" variant="outline" onClick={() => setAddingScene(true)}>
                      <HugeiconsIcon icon={Add01Icon} className="size-4" />
                      Add Scene
                    </Button>
                  </div>

                  {/* Add scene inline form */}
                  {addingScene && (
                    <div className="flex gap-1.5 items-center">
                      <Input
                        value={newSceneName}
                        onChange={(e) => setNewSceneName(e.target.value)}
                        placeholder="Scene name"
                        className="h-7 text-sm flex-1 rounded-lg"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddScene()
                          if (e.key === 'Escape') {
                            setAddingScene(false)
                            setNewSceneName('')
                          }
                        }}
                      />
                      <Button size="xs" onClick={handleAddScene} disabled={!newSceneName.trim()}>
                        Add
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          setAddingScene(false)
                          setNewSceneName('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}

                  {/* Scene items */}
                  {selectedPack.scenes.map((scene) => (
                    <SceneAccordionItem
                      key={scene.id}
                      scene={scene}
                      expanded={expandedScenes.has(scene.id)}
                      onToggle={() => toggleScene(scene.id)}
                      onDelete={() => handleDeleteScene(scene.id)}
                      onUpdated={handleSceneUpdated}
                    />
                  ))}

                  {selectedPack.scenes.length === 0 && !addingScene && (
                    <div className="text-center py-8">
                      <p className="text-base text-muted-foreground mb-2">No scenes yet</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAddingScene(true)}
                      >
                        <HugeiconsIcon icon={Add01Icon} className="size-5" />
                        Add your first scene
                      </Button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Empty state */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="rounded-xl bg-secondary/30 p-4 mx-auto w-fit">
                    <HugeiconsIcon icon={Film02Icon} className="size-6 text-muted-foreground/25" />
                  </div>
                  <p className="text-base text-muted-foreground">
                    {packs.length === 0
                      ? 'Create a scene pack to get started'
                      : 'Select a pack to view its scenes'}
                  </p>
                  {packs.length === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCreatingPack(true)}
                    >
                      <HugeiconsIcon icon={Add01Icon} className="size-5" />
                      Create Pack
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />
    </Dialog>
  )
}

/* ─── Scene Accordion Item ─── */

function SceneAccordionItem({
  scene,
  expanded,
  onToggle,
  onDelete,
  onUpdated,
}: {
  scene: SceneItem
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onUpdated: () => void
}) {
  const placeholders: Record<string, string> = JSON.parse(scene.placeholders || '{}')
  const keys = Object.keys(placeholders)

  if (!expanded) {
    return (
      <div
        className="rounded-lg bg-secondary/20 border border-border/50 px-4 py-3 group transition-all hover:border-border cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="text-base font-medium truncate shrink-0">{scene.name}</div>
          <div className="flex gap-1 shrink-0 ml-2">
            {keys.length > 0 && (
              <Badge variant="secondary" className="text-xs h-4 px-1.5 tabular-nums">
                {keys.length} keys
              </Badge>
            )}
            <Button
              size="xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <HugeiconsIcon icon={PencilEdit01Icon} className="size-4" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </Button>
              }
              title="Delete Scene"
              description={`Delete "${scene.name}"?`}
              onConfirm={onDelete}
            />
          </div>
        </div>
        {keys.length > 0 && (
          <div className="mt-2 space-y-1">
            {keys.map((k) => (
              <div key={k} className="flex gap-1.5 items-baseline text-xs min-w-0">
                <span className="font-mono text-muted-foreground shrink-0">
                  {`\\\\${k}\\\\`}
                </span>
                {placeholders[k] ? (
                  <span className="text-foreground/70 truncate font-mono" title={placeholders[k]}>
                    {placeholders[k]}
                  </span>
                ) : (
                  <span className="text-muted-foreground/40 italic">empty</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <SceneEditPanel
      scene={scene}
      placeholders={placeholders}
      onCollapse={onToggle}
      onDelete={onDelete}
      onUpdated={onUpdated}
    />
  )
}

/* ─── Scene Edit Panel (expanded) ─── */

function SceneEditPanel({
  scene,
  placeholders: initialPlaceholders,
  onCollapse,
  onDelete,
  onUpdated,
}: {
  scene: SceneItem
  placeholders: Record<string, string>
  onCollapse: () => void
  onDelete: () => void
  onUpdated: () => void
}) {
  const [name, setName] = useState(scene.name)
  const [values, setValues] = useState<Record<string, string>>(initialPlaceholders)
  const [newKey, setNewKey] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset state when scene changes
  useEffect(() => {
    setName(scene.name)
    setValues(JSON.parse(scene.placeholders || '{}'))
  }, [scene.id, scene.name, scene.placeholders])

  // Debounced auto-save
  const debouncedSave = useCallback(
    (updatedName: string, updatedValues: Record<string, string>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        setSaveStatus('saving')
        try {
          await updateScene({
            data: {
              id: scene.id,
              name: updatedName.trim() || scene.name,
              placeholders: JSON.stringify(updatedValues),
            },
          })
          setSaveStatus('saved')
          onUpdated()
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
        } catch {
          toast.error('Failed to save')
          setSaveStatus('idle')
        }
      }, 800)
    },
    [scene.id, scene.name, onUpdated],
  )

  function handleNameChange(newName: string) {
    setName(newName)
    debouncedSave(newName, values)
  }

  function handleValueChange(key: string, val: string) {
    const next = { ...values, [key]: val }
    setValues(next)
    debouncedSave(name, next)
  }

  function addKey() {
    const k = newKey.trim()
    if (!k || values[k] !== undefined) return
    const next = { ...values, [k]: '' }
    setValues(next)
    setNewKey('')
    debouncedSave(name, next)
  }

  function removeKey(key: string) {
    const next = { ...values }
    delete next[key]
    setValues(next)
    debouncedSave(name, next)
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3 transition-all">
      {/* Header: name + collapse/delete */}
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="h-8 text-base font-medium flex-1 rounded-lg"
          placeholder="Scene name"
        />
        <div className="flex items-center gap-1 shrink-0">
          {/* Save status */}
          {saveStatus === 'saving' && (
            <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-500 flex items-center gap-0.5">
              <HugeiconsIcon icon={Tick02Icon} className="size-4" />
              Saved
            </span>
          )}
          <ConfirmDialog
            trigger={
              <Button size="xs" variant="ghost" className="text-destructive">
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
              </Button>
            }
            title="Delete Scene"
            description={`Delete "${scene.name}"?`}
            onConfirm={onDelete}
          />
          <Button size="xs" variant="ghost" onClick={onCollapse}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </div>
      </div>

      {/* Placeholder key-value pairs */}
      {Object.keys(values).length > 0 && (
        <div className="space-y-2">
          {Object.entries(values).map(([key, val]) => (
            <div key={key} className="flex gap-2 items-start">
              <span className="text-sm font-mono text-muted-foreground min-w-20 sm:min-w-24 pt-2.5 shrink-0 inline-block rounded bg-secondary/60 px-2 py-1 text-center truncate">
                {`\\\\${key}\\\\`}
              </span>
              <Textarea
                value={val}
                onChange={(e) => handleValueChange(key, e.target.value)}
                placeholder={`Value for ${key}...`}
                className="flex-1 text-base font-mono min-h-10 py-2 px-3 rounded-lg"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeKey(key)}
                className="text-destructive shrink-0 mt-1.5"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new key */}
      <div className="flex gap-2 items-center border-t border-border/30 pt-3">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="New key name"
          className="h-7 text-sm w-36 rounded-lg"
          onKeyDown={(e) => e.key === 'Enter' && addKey()}
        />
        <Button size="xs" variant="outline" onClick={addKey} disabled={!newKey.trim()}>
          Add Key
        </Button>
      </div>
    </div>
  )
}
