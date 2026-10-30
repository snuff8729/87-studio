import { useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowExpand01Icon,
  BookmarkCheck01Icon,
  MoreVerticalIcon,
} from '@hugeicons/core-free-icons'
import { PromptEditorHeader } from '@/components/prompt-editor/prompt-editor-header'
import { ExpandedEditorDialog } from '@/components/prompt-editor/expanded-editor-dialog'
import { LazyPromptEditor } from '@/components/quick-generate/lazy-prompt-editor'
import {
  appendTag,
  useTagGallery,
} from '@/components/tag-gallery/use-tag-gallery'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { extractPlaceholders } from '@/lib/placeholder'
import { useBundleNames } from '@/lib/use-bundles'
import { useTranslation } from '@/lib/i18n'

export interface CharacterItem<TId extends string | number> {
  id: TId
  name: string
  prompt: string
  negative: string
}

export interface CharacterPatch {
  name?: string
  prompt?: string
  negative?: string
}

interface CharactersEditorProps<TId extends string | number> {
  characters: Array<CharacterItem<TId>>
  /** Create a character and resolve with its id (it is selected right away) */
  onAdd: () => Promise<TId | undefined> | TId | undefined
  onUpdate: (id: TId, patch: CharacterPatch) => void
  /** Name field lost focus (e.g. restore a blank name) */
  onNameBlur?: (id: TId) => void
  /** Duplicate and resolve with the copy's id */
  onDuplicate: (id: TId) => Promise<TId | undefined> | TId | undefined
  onMove: (id: TId, direction: -1 | 1) => void
  onDelete: (id: TId) => void | Promise<void>
  /** Workspace: highlight @{slot:..} names in the prompts and list them */
  slots?: boolean
}

export function CharactersEditor<TId extends string | number>({
  characters,
  onAdd,
  onUpdate,
  onNameBlur,
  onDuplicate,
  onMove,
  onDelete,
  slots,
}: CharactersEditorProps<TId>) {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<TId | null>(
    characters[0]?.id ?? null,
  )
  // A just-added id is selected before the data that contains it arrives
  const pendingIdRef = useRef<TId | null>(null)
  const wantNameFocusRef = useRef(false)
  const [focusTick, setFocusTick] = useState(0)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const selected = characters.find((c) => c.id === selectedId) ?? null
  const selectedIndex = selected ? characters.indexOf(selected) : -1

  useEffect(() => {
    if (
      pendingIdRef.current !== null &&
      characters.some((c) => c.id === pendingIdRef.current)
    ) {
      pendingIdRef.current = null
    }
    if (characters.some((c) => c.id === selectedId)) return
    if (selectedId !== null && pendingIdRef.current === selectedId) return
    setSelectedId(characters[0]?.id ?? null)
  }, [characters, selectedId])

  useEffect(() => {
    if (!selected || !wantNameFocusRef.current) return
    wantNameFocusRef.current = false
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [selected?.id, focusTick])

  function select(id: TId | undefined) {
    if (id === undefined) return
    pendingIdRef.current = id
    wantNameFocusRef.current = true
    setSelectedId(id)
    // The id may already be selected (list updated first): still re-run the focus effect
    setFocusTick((n) => n + 1)
  }

  // Rename: the menu hands focus back to its trigger when it closes, so the
  // name input takes focus from onCloseAutoFocus instead
  const renameRequestedRef = useRef(false)
  function focusName() {
    renameRequestedRef.current = true
  }
  function handleMenuCloseFocus(e: Event) {
    if (!renameRequestedRef.current) return
    renameRequestedRef.current = false
    e.preventDefault()
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }

  return (
    <div className="space-y-3" data-characters-editor>
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground uppercase tracking-wider">
          {t('characters.title')}
        </Label>
        <Badge variant="secondary" className="text-xs">
          {characters.length}
        </Badge>
      </div>

      {characters.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            {t('characters.empty')}
          </p>
          <Button
            variant="outline"
            size="sm"
            data-character-add
            onClick={async () => select(await onAdd())}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            {t('characters.add')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {characters.map((char) => (
            <button
              key={char.id}
              type="button"
              data-character-chip
              aria-pressed={char.id === selectedId}
              onClick={() => setSelectedId(char.id)}
              className={cn(
                'h-7 max-w-[10rem] truncate rounded-full border px-3 text-sm transition-colors',
                char.id === selectedId
                  ? 'border-primary/50 bg-primary/15 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              )}
            >
              {char.name || t('characters.unnamed')}
            </button>
          ))}
          <button
            type="button"
            data-character-add
            onClick={async () => select(await onAdd())}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            {t('characters.add')}
          </button>
          {selected && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  title={t('characters.more')}
                  data-character-menu
                >
                  <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={handleMenuCloseFocus}
              >
                <DropdownMenuItem onSelect={focusName}>
                  {t('characters.rename')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => select(await onDuplicate(selected.id))}
                >
                  {t('characters.duplicate')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={selectedIndex <= 0}
                  onSelect={() => onMove(selected.id, -1)}
                >
                  {t('characters.moveLeft')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={selectedIndex >= characters.length - 1}
                  onSelect={() => onMove(selected.id, 1)}
                >
                  {t('characters.moveRight')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {selected && (
        <CharacterBody
          key={selected.id}
          character={selected}
          nameInputRef={nameInputRef}
          onUpdate={(patch) => onUpdate(selected.id, patch)}
          onNameBlur={() => onNameBlur?.(selected.id)}
          slots={slots}
        />
      )}

      {selected && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={t('workspace.deleteCharacter')}
          description={t('workspace.deleteCharacterDesc', {
            name: selected.name,
          })}
          onConfirm={() => onDelete(selected.id)}
        />
      )}
    </div>
  )
}

function CharacterBody<TId extends string | number>({
  character,
  nameInputRef,
  onUpdate,
  onNameBlur,
  slots,
}: {
  character: CharacterItem<TId>
  nameInputRef: React.RefObject<HTMLInputElement | null>
  onUpdate: (patch: CharacterPatch) => void
  onNameBlur?: () => void
  slots?: boolean
}) {
  const { t } = useTranslation()
  const bundleNames = useBundleNames()
  const tagGallery = useTagGallery()
  const [negativeOpen, setNegativeOpen] = useState(!!character.negative)
  const [expand, setExpand] = useState<'prompt' | 'negative' | null>(null)

  const promptSlots = useMemo(
    () => (slots ? extractPlaceholders(character.prompt) : []),
    [slots, character.prompt],
  )
  const negativeSlots = useMemo(
    () => (slots ? extractPlaceholders(character.negative) : []),
    [slots, character.negative],
  )
  const slotNames = useMemo(
    () =>
      slots ? [...new Set([...promptSlots, ...negativeSlots])] : undefined,
    [slots, promptSlots, negativeSlots],
  )
  const name = character.name || t('characters.unnamed')

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-sm text-muted-foreground uppercase tracking-wider">
          {t('characters.name')}
        </Label>
        <Input
          ref={nameInputRef}
          value={character.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          onBlur={onNameBlur}
          placeholder={t('quickGenerate.characterName')}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <PromptEditorHeader
          label={t('characters.prompt')}
          uppercase
          onExpand={() => setExpand('prompt')}
          onOpenTagGallery={() =>
            tagGallery.openFor((tag) =>
              onUpdate({ prompt: appendTag(character.prompt, tag) }),
            )
          }
        />
        <LazyPromptEditor
          value={character.prompt}
          onChange={(v) => onUpdate({ prompt: v })}
          placeholder={t('quickGenerate.characterPrompt')}
          minHeight="200px"
          bundleNames={bundleNames}
          slotNames={slotNames}
        />
        <SlotBadges names={promptSlots} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setNegativeOpen((o) => !o)}
            aria-expanded={negativeOpen}
            className="flex items-center gap-1 text-sm text-muted-foreground uppercase tracking-wider hover:text-foreground"
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn(
                'size-4 transition-transform',
                !negativeOpen && '-rotate-90',
              )}
            />
            {t('characters.negative')}
            {!negativeOpen && !character.negative && (
              <span className="normal-case tracking-normal text-muted-foreground/60">
                {t('characters.emptyHint')}
              </span>
            )}
          </button>
          {negativeOpen && (
            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={() =>
                  tagGallery.openFor((tag) =>
                    onUpdate({ negative: appendTag(character.negative, tag) }),
                  )
                }
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                title={t('tagGallery.panelTitle')}
              >
                <HugeiconsIcon icon={BookmarkCheck01Icon} className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setExpand('negative')}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                title={t('workspace.expandEditor')}
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" />
              </button>
            </div>
          )}
        </div>
        {negativeOpen && (
          <>
            <LazyPromptEditor
              value={character.negative}
              onChange={(v) => onUpdate({ negative: v })}
              placeholder={t('quickGenerate.characterNegative')}
              minHeight="120px"
              bundleNames={bundleNames}
              slotNames={slotNames}
            />
            <SlotBadges names={negativeSlots} />
          </>
        )}
      </div>

      <ExpandedEditorDialog
        open={expand !== null}
        onOpenChange={(open) => {
          if (!open) setExpand(null)
        }}
        title={`${name} - ${
          expand === 'negative'
            ? t('characters.negative')
            : t('characters.prompt')
        }`}
        value={expand === 'negative' ? character.negative : character.prompt}
        onChange={(v) =>
          onUpdate(expand === 'negative' ? { negative: v } : { prompt: v })
        }
        bundleNames={bundleNames}
      />
      {tagGallery.dialog}
    </div>
  )
}

function SlotBadges({ names }: { names: Array<string> }) {
  if (names.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((p) => (
        <Badge key={p} variant="outline" className="text-xs">
          {`@{slot:${p}}`}
        </Badge>
      ))}
    </div>
  )
}
