import { useState, useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Film02Icon, Add01Icon, Cancel01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
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

interface ScenePackDialogProps {
  projectId: number
}

type PackListItem = Awaited<ReturnType<typeof listScenePacks>>[number]
type PackDetail = Awaited<ReturnType<typeof getScenePack>>

export function ScenePackDialog({ projectId }: ScenePackDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [packs, setPacks] = useState<PackListItem[]>([])
  const [selectedPack, setSelectedPack] = useState<PackDetail | null>(null)
  // New pack form
  const [newPackName, setNewPackName] = useState('')
  const [newPackDesc, setNewPackDesc] = useState('')

  // New scene form
  const [newSceneName, setNewSceneName] = useState('')
  const [addingScene, setAddingScene] = useState(false)

  async function loadPacks() {
    const result = await listScenePacks()
    setPacks(result)
  }

  useEffect(() => {
    if (open) loadPacks()
  }, [open])

  async function handleCreatePack() {
    if (!newPackName.trim()) return
    try {
      const pack = await createScenePack({ data: { name: newPackName.trim(), description: newPackDesc.trim() || undefined } })
      setNewPackName('')
      setNewPackDesc('')
      toast.success('Scene pack created')
      await loadPacks()
      // Select the new pack
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

  async function handleSelectPack(id: number) {
    const detail = await getScenePack({ data: id })
    setSelectedPack(detail)
  }

  async function handleAssignToProject(scenePackId: number) {
    try {
      await assignScenePack({ data: { projectId, scenePackId } })
      toast.success('Scene pack imported to project')
      setOpen(false)
      router.invalidate()
    } catch {
      toast.error('Failed to import pack')
    }
  }

  async function handleAddScene() {
    if (!newSceneName.trim() || !selectedPack) return
    try {
      await createScene({ data: { scenePackId: selectedPack.id, name: newSceneName.trim() } })
      setNewSceneName('')
      setAddingScene(false)
      const detail = await getScenePack({ data: selectedPack.id })
      setSelectedPack(detail)
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
      toast.success('Scene deleted')
    } catch {
      toast.error('Failed to delete scene')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <HugeiconsIcon icon={Film02Icon} className="size-3.5" />
          <span className="hidden sm:inline">Scene Packs</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Scene Packs</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {/* Pack list */}
          <div className="w-48 shrink-0 space-y-2 overflow-y-auto">
            {packs.map((pack) => (
              <button
                key={pack.id}
                onClick={() => handleSelectPack(pack.id)}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                  selectedPack?.id === pack.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-secondary/80'
                }`}
              >
                <div className="font-medium truncate">{pack.name}</div>
                {pack.description && (
                  <div className="text-xs text-muted-foreground truncate">{pack.description}</div>
                )}
              </button>
            ))}

            <Separator />

            {/* Create new pack */}
            <div className="space-y-2 pt-1">
              <Input
                value={newPackName}
                onChange={(e) => setNewPackName(e.target.value)}
                placeholder="New pack name"
                className="h-7 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleCreatePack()}
              />
              <Button
                size="xs"
                variant="outline"
                onClick={handleCreatePack}
                disabled={!newPackName.trim()}
                className="w-full"
              >
                <HugeiconsIcon icon={Add01Icon} className="size-3" />
                Create Pack
              </Button>
            </div>
          </div>

          {/* Pack detail */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {selectedPack ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{selectedPack.name}</h3>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleAssignToProject(selectedPack.id)}
                    >
                      <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
                      Import to Project
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="ghost" className="text-destructive">
                          Delete Pack
                        </Button>
                      }
                      title="Delete Scene Pack"
                      description={`Delete "${selectedPack.name}" and all its scenes?`}
                      onConfirm={() => handleDeletePack(selectedPack.id)}
                    />
                  </div>
                </div>

                {selectedPack.description && (
                  <p className="text-xs text-muted-foreground">{selectedPack.description}</p>
                )}

                {/* Scenes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Scenes ({selectedPack.scenes.length})
                    </Label>
                    <Button size="xs" variant="outline" onClick={() => setAddingScene(true)}>
                      <HugeiconsIcon icon={Add01Icon} className="size-3" />
                      Add Scene
                    </Button>
                  </div>

                  {addingScene && (
                    <div className="flex gap-1.5">
                      <Input
                        value={newSceneName}
                        onChange={(e) => setNewSceneName(e.target.value)}
                        placeholder="Scene name"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddScene()
                          if (e.key === 'Escape') { setAddingScene(false); setNewSceneName('') }
                        }}
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <Button size="xs" onClick={handleAddScene} disabled={!newSceneName.trim()}>
                        Add
                      </Button>
                    </div>
                  )}

                  {selectedPack.scenes.map((scene) => {
                    const placeholders = JSON.parse(scene.placeholders || '{}')
                    const keys = Object.keys(placeholders)
                    return (
                      <SceneEditItem
                        key={scene.id}
                        scene={scene}
                        placeholderKeys={keys}
                        placeholders={placeholders}
                        onDelete={() => handleDeleteScene(scene.id)}
                        onUpdated={async () => {
                          const detail = await getScenePack({ data: selectedPack.id })
                          setSelectedPack(detail)
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">
                  Select a scene pack or create a new one.
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SceneEditItem({
  scene,
  placeholderKeys,
  placeholders,
  onDelete,
  onUpdated,
}: {
  scene: { id: number; name: string; description: string | null; placeholders: string | null }
  placeholderKeys: string[]
  placeholders: Record<string, string>
  onDelete: () => void
  onUpdated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(scene.name)
  const [values, setValues] = useState(placeholders)
  const [newKey, setNewKey] = useState('')

  function addKey() {
    if (!newKey.trim() || values[newKey.trim()] !== undefined) return
    setValues({ ...values, [newKey.trim()]: '' })
    setNewKey('')
  }

  function removeKey(key: string) {
    const next = { ...values }
    delete next[key]
    setValues(next)
  }

  async function handleSave() {
    try {
      await updateScene({
        data: {
          id: scene.id,
          name: name.trim() || scene.name,
          placeholders: JSON.stringify(values),
        },
      })
      setEditing(false)
      toast.success('Scene saved')
      onUpdated()
    } catch {
      toast.error('Failed to save scene')
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2 group">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{scene.name}</div>
          {placeholderKeys.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {placeholderKeys.map((k) => (
                <span key={k} className="text-[10px] text-muted-foreground font-mono">{`{{${k}}}`}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <ConfirmDialog
            trigger={
              <Button size="xs" variant="ghost" className="text-destructive">
                Del
              </Button>
            }
            title="Delete Scene"
            description={`Delete "${scene.name}"?`}
            onConfirm={onDelete}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-primary/50 p-3 space-y-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 text-sm"
        placeholder="Scene name"
      />
      {Object.entries(values).map(([key, val]) => (
        <div key={key} className="flex gap-1.5 items-center">
          <span className="text-xs font-mono text-muted-foreground min-w-20">{`{{${key}}}`}</span>
          <Input
            value={val}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            className="h-7 text-xs flex-1"
            placeholder={`Value for ${key}`}
          />
          <Button variant="ghost" size="icon-xs" onClick={() => removeKey(key)} className="text-destructive shrink-0">
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </Button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="New key"
          onKeyDown={(e) => e.key === 'Enter' && addKey()}
          className="h-7 text-xs w-32"
        />
        <Button size="xs" variant="outline" onClick={addKey} disabled={!newKey.trim()}>
          Add Key
        </Button>
      </div>
      <div className="flex gap-1.5">
        <Button size="xs" onClick={handleSave}>Save</Button>
        <Button size="xs" variant="ghost" onClick={() => {
          setEditing(false)
          setName(scene.name)
          setValues(placeholders)
        }}>Cancel</Button>
      </div>
    </div>
  )
}
