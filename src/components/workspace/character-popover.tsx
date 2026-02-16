import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserIcon, Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { createCharacter, deleteCharacter } from '@/server/functions/characters'

interface CharacterPopoverProps {
  characters: Array<{
    id: number
    name: string
    charPrompt: string
    charNegative: string
    slotIndex: number | null
  }>
  projectId: number
}

export function CharacterPopover({ characters, projectId }: CharacterPopoverProps) {
  const router = useRouter()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    if (!newName.trim()) return
    try {
      await createCharacter({ data: { projectId, name: newName.trim() } })
      setNewName('')
      setAdding(false)
      toast.success('Character added')
      router.invalidate()
    } catch {
      toast.error('Failed to add character')
    }
  }

  async function handleDelete(charId: number, charName: string) {
    try {
      await deleteCharacter({ data: charId })
      toast.success(`${charName} deleted`)
      router.invalidate()
    } catch {
      toast.error('Failed to delete character')
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <HugeiconsIcon icon={UserIcon} className="size-5" />
          <span className="hidden sm:inline">
            Characters{characters.length > 0 ? ` (${characters.length})` : ''}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64">
        <h4 className="text-base font-medium mb-3">Characters</h4>

        {characters.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-3">
            No characters. Add one for multi-character images.
          </p>
        ) : (
          <div className="space-y-1.5 mb-3">
            {characters.map((char) => (
              <div
                key={char.id}
                className="flex items-center justify-between rounded-md bg-secondary/50 px-2.5 py-1.5"
              >
                <span className="text-base truncate">{char.name}</span>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" className="text-destructive shrink-0">
                      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                    </Button>
                  }
                  title="Delete Character"
                  description={`Delete "${char.name}"? This will also remove all scene overrides for this character.`}
                  onConfirm={() => handleDelete(char.id, char.name)}
                />
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="flex gap-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Character name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setAdding(false); setNewName('') }
              }}
              className="h-7 text-sm"
              autoFocus
            />
            <Button size="xs" onClick={handleAdd} disabled={!newName.trim()}>
              Add
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            className="w-full"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-5" />
            Add Character
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
