import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import type { SceneItem } from './scenes-pane'
import type { AxisValues } from '@/lib/character-parts'
import { AxisSegmented } from '@/components/parts/axis-segmented'
import { parseAxisValues } from '@/lib/character-parts'
import { getLibrary } from '@/server/functions/library'
import { useTranslation } from '@/lib/i18n'
import { useBundleNames } from '@/lib/use-bundles'
import {
  parsePlaceholders,
  renameKey,
  suggestKeys,
} from '@/lib/scene-templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ExpandedEditorDialog } from '@/components/prompt-editor/expanded-editor-dialog'
import { PromptEditorHeader } from '@/components/prompt-editor/prompt-editor-header'
import { TagGalleryDialog } from '@/components/tag-gallery/tag-gallery-dialog'
import { updateScene } from '@/server/functions/scenes'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

const SAVE_DEBOUNCE_MS = 800

function KeyValueEditor({
  value,
  onChange,
  placeholder,
  bundleNames,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  bundleNames: Array<{ name: string; content: string }>
}) {
  // Grows with content (min 2 lines); scrolls after ~12 lines
  return (
    <div className="[&_.cm-scroller]:max-h-[17rem] [&_.cm-scroller]:overflow-y-auto">
      <Suspense
        fallback={
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="min-h-[3.5rem] font-mono text-base"
            rows={2}
          />
        }
      >
        {/* Empty slotNames: scene values define slots, they don't reference them */}
        <PromptEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          bundleNames={bundleNames}
          slotNames={[]}
          minHeight="3.5rem"
        />
      </Suspense>
    </div>
  )
}

function AddKeyPopover({
  suggestions,
  existing,
  onAdd,
}: {
  suggestions: Array<string>
  existing: Array<string>
  onAdd: (key: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const trimmed = name.trim()
  const exists = existing.includes(trimmed)
  const invalid = trimmed.includes('}') || trimmed.includes('{')
  const canAdd = !!trimmed && !exists && !invalid

  function add(key: string) {
    onAdd(key)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setName('')
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="add-key">
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          {t('templates.addKey')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-3 p-3"
        data-block-shortcuts
        onKeyDown={(e) => {
          if (
            e.key === 'Enter' &&
            (e.target as HTMLElement).tagName === 'INPUT'
          ) {
            e.preventDefault()
            if (canAdd) add(trimmed)
          }
        }}
      >
        <div className="text-sm font-medium">{t('templates.addKeyTitle')}</div>
        <div className="space-y-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('templates.newKeyName')}
            aria-label={t('templates.newKeyName')}
            aria-invalid={exists || undefined}
            className="h-8 text-sm"
            autoFocus
          />
          {exists && (
            <p role="alert" className="text-xs text-destructive">
              {t('templates.keyExists')}
            </p>
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">
              {t('templates.keySuggestions')}
            </div>
            <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => add(s)}
                  className="rounded-md border border-border bg-secondary/40 px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={!canAdd} onClick={() => add(trimmed)}>
            {t('common.add')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function SceneEditor({
  scene,
  otherScenes,
  slotNames,
  onRename,
  onValuesChange,
  onAxisValuesChange,
  onDuplicate,
  onDelete,
  flushRef: externalFlushRef,
  trackSave,
}: {
  /** Mount with `key={scene.id}`: values are read once, edits stay local. */
  scene: SceneItem
  otherScenes: Array<SceneItem>
  slotNames: Array<string>
  /** Resolves false when the name was rejected */
  onRename: (scene: SceneItem, name: string) => Promise<boolean>
  /** Optimistic parent update with the latest placeholders JSON */
  onValuesChange: (sceneId: number, json: string) => void
  /** Optimistic parent update with the latest axisValues JSON */
  onAxisValuesChange: (sceneId: number, json: string) => void
  onDuplicate: (scene: SceneItem) => void
  onDelete: (scene: SceneItem) => void
  /** Lets the dialog flush this editor's pending save (before Apply) */
  flushRef: { current: (() => Promise<void>) | null }
  /** Reports every started save so the dialog can await in-flight ones */
  trackSave: (save: Promise<void>) => void
}) {
  const { t } = useTranslation()
  const bundleNames = useBundleNames()
  const sceneId = scene.id
  const [values, setValues] = useState(() =>
    parsePlaceholders(scene.placeholders),
  )
  const [axisValues, setAxisValues] = useState<AxisValues>(() =>
    parseAxisValues(scene.axisValues),
  )
  const axisValuesRef = useRef(axisValues)
  const libraryQuery = useQuery({
    queryKey: ['library', null],
    queryFn: () => getLibrary({ data: {} }),
  })
  const globalAxes = useMemo(
    () =>
      (libraryQuery.data?.axes ?? []).filter(
        (a) => a.ownerCharacterId === null && a.ownerItemId === null,
      ),
    [libraryQuery.data],
  )
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [renamingName, setRenamingNameState] = useState<string | null>(null)
  const [renamingKey, setRenamingKeyState] = useState<{
    key: string
    draft: string
  } | null>(null)
  // Mirrors of the rename drafts so Enter + the blur that follows commit once
  const renamingNameRef = useRef<string | null>(null)
  const renamingKeyRef = useRef<{ key: string; draft: string } | null>(null)
  function setRenamingName(v: string | null) {
    renamingNameRef.current = v
    setRenamingNameState(v)
  }
  function setRenamingKey(v: { key: string; draft: string } | null) {
    renamingKeyRef.current = v
    setRenamingKeyState(v)
  }
  const [expandKey, setExpandKey] = useState<string | null>(null)
  const [tagKey, setTagKey] = useState<string | null>(null)

  const valuesRef = useRef(values)
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const chainRef = useRef<Promise<void>>(Promise.resolve())
  const mountedRef = useRef(true)
  const onValuesChangeRef = useRef(onValuesChange)
  onValuesChangeRef.current = onValuesChange
  const onAxisValuesChangeRef = useRef(onAxisValuesChange)
  onAxisValuesChangeRef.current = onAxisValuesChange

  function flush(): Promise<void> {
    clearTimeout(timerRef.current)
    if (!dirtyRef.current) return chainRef.current
    dirtyRef.current = false
    const json = JSON.stringify(valuesRef.current)
    const axes = axisValuesRef.current
    if (mountedRef.current) setStatus('saving')
    chainRef.current = chainRef.current
      .then(() =>
        updateScene({
          data: { id: sceneId, placeholders: json, axisValues: axes },
        }),
      )
      .then(() => {
        if (!mountedRef.current) return
        setStatus('saved')
        clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setStatus('idle'), 2000)
      })
      .catch(() => {
        toast.error(t('templates.failedToSave'))
        if (mountedRef.current) setStatus('idle')
      })
    trackSave(chainRef.current)
    return chainRef.current
  }
  const flushRef = useRef(flush)
  flushRef.current = flush

  // Flush pending edits on scene switch / dialog close
  useEffect(() => {
    mountedRef.current = true
    const exposed = () => flushRef.current()
    externalFlushRef.current = exposed
    return () => {
      if (externalFlushRef.current === exposed) externalFlushRef.current = null
      mountedRef.current = false
      clearTimeout(savedTimerRef.current)
      void flushRef.current()
    }
  }, [])

  function commit(next: Record<string, string>) {
    valuesRef.current = next
    dirtyRef.current = true
    setValues(next)
    onValuesChangeRef.current(sceneId, JSON.stringify(next))
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => void flushRef.current(),
      SAVE_DEBOUNCE_MS,
    )
  }

  function setAxisValue(axisId: number, valueId: number | null) {
    if (valueId === null) return
    const next = { ...axisValuesRef.current, [String(axisId)]: valueId }
    axisValuesRef.current = next
    dirtyRef.current = true
    setAxisValues(next)
    onAxisValuesChangeRef.current(sceneId, JSON.stringify(next))
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => void flushRef.current(),
      SAVE_DEBOUNCE_MS,
    )
  }

  function setValue(key: string, value: string) {
    commit({ ...valuesRef.current, [key]: value })
  }

  function addKey(key: string) {
    if (key in valuesRef.current) return
    commit({ ...valuesRef.current, [key]: '' })
  }

  function removeKey(key: string) {
    const next = { ...valuesRef.current }
    delete next[key]
    commit(next)
  }

  function commitKeyRename() {
    const current = renamingKeyRef.current
    if (!current) return
    const { key, draft } = current
    setRenamingKey(null)
    const next = renameKey(valuesRef.current, key, draft)
    if (next) commit(next)
    else if (draft.trim() && draft.trim() !== key) {
      toast.error(t('templates.keyExists'))
    }
  }

  async function commitName() {
    const draft = renamingNameRef.current
    if (draft == null) return
    const name = draft.trim()
    setRenamingName(null)
    if (!name || name === scene.name) return
    await onRename(scene, name)
  }

  function insertTag(tag: string) {
    if (!tagKey) return
    const current = valuesRef.current[tagKey] ?? ''
    setValue(tagKey, current ? current.trimEnd() + ', ' + tag : tag)
  }

  const keys = Object.keys(values)
  const suggestions = useMemo(
    () =>
      suggestKeys(
        otherScenes.map((s) => parsePlaceholders(s.placeholders)),
        slotNames,
        keys,
      ),
    [otherScenes, slotNames, keys.join('\u0000')],
  )

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="scene-editor">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        {renamingName != null ? (
          <Input
            value={renamingName}
            onChange={(e) => setRenamingName(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitName()
              if (e.key === 'Escape') setRenamingName(null)
            }}
            aria-label={t('scene.sceneName')}
            className="h-8 flex-1 text-base font-medium"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenamingName(scene.name)}
            title={t('templates.clickToRename')}
            data-testid="scene-name"
            className="min-w-0 flex-1 truncate rounded-md px-1 py-0.5 text-left text-base font-semibold transition-colors hover:bg-secondary/60"
          >
            {scene.name}
          </button>
        )}
        <span className="flex min-w-14 shrink-0 items-center justify-end text-xs">
          {status === 'saving' && (
            <span className="animate-pulse text-muted-foreground">
              {t('templates.saving')}
            </span>
          )}
          {status === 'saved' && (
            <span
              className="flex items-center gap-0.5 text-green-500"
              data-testid="saved-indicator"
            >
              <HugeiconsIcon icon={Tick02Icon} className="size-4" />
              {t('templates.saved')}
            </span>
          )}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('templates.sceneActions')}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onSelect={() => onDuplicate(scene)}>
              <HugeiconsIcon icon={Copy01Icon} />
              {t('templates.duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(scene)}
            >
              <HugeiconsIcon icon={Delete02Icon} />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {globalAxes.length > 0 && (
          <div
            className="space-y-2 rounded-md border border-border/60 bg-secondary/20 p-3"
            data-testid="scene-axes"
          >
            <div className="text-xs font-medium text-muted-foreground">
              {t('sceneParts.templateAxes')}
            </div>
            {globalAxes.map((axis) => (
              <AxisSegmented
                key={axis.id}
                axis={axis}
                value={
                  axisValues[String(axis.id)] ?? axis.values[0]?.id ?? null
                }
                onChange={(v) => setAxisValue(axis.id, v)}
                defaultBadge
              />
            ))}
          </div>
        )}
        {keys.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('templates.noKeysYet')}
          </p>
        )}
        {keys.map((key) => (
          <div
            key={key}
            data-testid="key-block"
            data-key={key}
            className="overflow-hidden rounded-md border border-border/60 bg-background/50"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-secondary/30 px-3 py-1">
              {renamingKey?.key === key ? (
                <Input
                  value={renamingKey.draft}
                  onChange={(e) =>
                    setRenamingKey({ key, draft: e.target.value })
                  }
                  onBlur={commitKeyRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitKeyRename()
                    if (e.key === 'Escape') setRenamingKey(null)
                  }}
                  aria-label={t('templates.renameKey')}
                  className="h-6 w-40 font-mono text-xs"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setRenamingKey({ key, draft: key })}
                  title={t('templates.renameKey')}
                  className="min-w-0 truncate rounded px-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {`@{slot:${key}}`}
                </button>
              )}
              <div className="flex shrink-0 items-center gap-0.5">
                <PromptEditorHeader
                  label=""
                  onOpenTagGallery={() => setTagKey(key)}
                  onExpand={() => setExpandKey(key)}
                />
                <button
                  type="button"
                  onClick={() => removeKey(key)}
                  title={t('templates.removeKey')}
                  aria-label={t('templates.removeKey')}
                  className="rounded p-0.5 text-destructive/60 transition-colors hover:text-destructive"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="p-2">
              <KeyValueEditor
                value={values[key]}
                onChange={(v) => setValue(key, v)}
                placeholder={t('templates.valueForKey', { key })}
                bundleNames={bundleNames}
              />
            </div>
          </div>
        ))}
        <AddKeyPopover
          suggestions={suggestions}
          existing={keys}
          onAdd={addKey}
        />
      </div>

      <ExpandedEditorDialog
        open={expandKey !== null}
        onOpenChange={(open) => {
          if (!open) setExpandKey(null)
        }}
        title={expandKey ? `@{slot:${expandKey}}` : ''}
        value={expandKey ? (values[expandKey] ?? '') : ''}
        onChange={(val) => {
          if (expandKey) setValue(expandKey, val)
        }}
        bundleNames={bundleNames}
      />
      <TagGalleryDialog
        open={tagKey !== null}
        onOpenChange={(open) => {
          if (!open) setTagKey(null)
        }}
        onInsertTag={insertTag}
      />
    </div>
  )
}
