import { memo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Copy01Icon,
  Delete02Icon,
  Image02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  RotateLeft01Icon,
} from '@hugeicons/core-free-icons'
import type { CSSProperties, ReactNode } from 'react'
import type { SceneCardSize } from './scenes-tab-prefs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export type { SceneCardSize } from './scenes-tab-prefs'

// ── Shared types (workspace scene data as loaded by the route) ──

export type SceneSortBy =
  | 'default'
  | 'name_asc'
  | 'name_desc'
  | 'images_desc'
  | 'images_asc'
  | 'created_asc'
  | 'created_desc'

export const SCENE_SORT_OPTIONS: Array<SceneSortBy> = [
  'default',
  'name_asc',
  'name_desc',
  'images_desc',
  'images_asc',
  'created_asc',
  'created_desc',
]

export interface WorkspaceSceneData {
  id: number
  name: string
  placeholders: string | null
  sortOrder: number | null
  recentImageCount: number
  thumbnailPath: string | null
  thumbnailImageId: number | null
}

export interface WorkspaceScenePack {
  id: number
  name: string
  scenes: Array<WorkspaceSceneData>
}

/** Minimal scene shape rendered by SceneCard / SceneRow. */
export interface SceneCardScene {
  id: number
  name: string
  packName: string
  thumbnailPath: string | null
  imageCount: number
}

export function toSceneCardScene(
  scene: WorkspaceSceneData,
  packName: string,
): SceneCardScene {
  return {
    id: scene.id,
    name: scene.name,
    packName,
    thumbnailPath: scene.thumbnailPath,
    imageCount: scene.recentImageCount,
  }
}

export function sceneThumbnailUrl(thumbnailPath: string): string {
  return `/api/thumbnails/${thumbnailPath.replace('data/thumbnails/', '')}`
}

export interface SceneItemProps {
  scene: SceneCardScene
  /** Explicit per-scene count; `null` = falls back to `defaultCount`. */
  count: number | null
  /** Shown (muted) when `count` is null. */
  defaultCount?: number
  onCountChange: (sceneId: number, count: number | null) => void
  selected: boolean
  onSelect: (sceneId: number) => void
  /** Card size (ignored by SceneRow). */
  size?: SceneCardSize
  /** Menu items (e.g. `<SceneMenuItems />`); also opened by right-click. */
  menu?: ReactNode
  selectMode?: boolean
  checked?: boolean
  onCheckedChange?: (sceneId: number, checked: boolean) => void
  className?: string
  style?: CSSProperties
}

// ── Reserve stepper (− n +) ──

export function ReserveStepper({
  value,
  placeholder = 0,
  onChange,
  min = 0,
  max = 100,
  size = 'sm',
  className,
  title,
}: {
  /** `null` shows `placeholder` muted (default count). */
  value: number | null
  placeholder?: number
  onChange: (value: number) => void
  min?: number
  max?: number
  size?: 'xs' | 'sm'
  className?: string
  title?: string
}) {
  const effective = value ?? placeholder
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  function commit() {
    setEditing(false)
    const parsed = parseInt(editValue.trim(), 10)
    if (!isNaN(parsed)) onChange(clamp(parsed))
  }

  const btn = size === 'xs' ? 'w-5' : 'w-6'
  const h = size === 'xs' ? 'h-6' : 'h-7'
  const active = effective > 0

  return (
    <div
      title={title}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex items-center rounded-md border overflow-hidden shrink-0 transition-colors',
        h,
        active
          ? 'border-primary/40 bg-primary/10'
          : 'border-border bg-input/30',
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onChange(clamp(effective - 1))}
        className={cn(
          'flex items-center justify-center shrink-0 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors',
          h,
          btn,
        )}
        aria-label="-"
      >
        &minus;
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        readOnly={!editing}
        value={editing ? editValue : String(effective)}
        onChange={(e) => setEditValue(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={() => {
          setEditValue(String(effective))
          setEditing(true)
          requestAnimationFrame(() => inputRef.current?.select())
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') inputRef.current?.blur()
          if (e.key === 'Escape') {
            setEditValue(String(effective))
            setEditing(false)
            inputRef.current?.blur()
          }
        }}
        className={cn(
          'min-w-0 flex-1 text-center tabular-nums bg-transparent outline-none border-none p-0 cursor-text',
          size === 'xs' ? 'w-6 text-xs' : 'w-7 text-sm',
          active ? 'text-primary font-medium' : 'text-muted-foreground',
          value == null && !editing && 'opacity-70',
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onChange(clamp(effective + 1))}
        className={cn(
          'flex items-center justify-center shrink-0 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors',
          h,
          btn,
        )}
        aria-label="+"
      >
        +
      </button>
    </div>
  )
}

// ── Menu ──

export function SceneMenuItems({
  onRename,
  onDuplicate,
  onDelete,
  onResetCount,
}: {
  onRename?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  /** Shown only when provided (scene has an explicit count). */
  onResetCount?: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {onRename && (
        <DropdownMenuItem onSelect={onRename}>
          <HugeiconsIcon icon={PencilEdit02Icon} />
          {t('scene.rename')}
        </DropdownMenuItem>
      )}
      {onDuplicate && (
        <DropdownMenuItem onSelect={onDuplicate}>
          <HugeiconsIcon icon={Copy01Icon} />
          {t('scene.duplicateScene')}
        </DropdownMenuItem>
      )}
      {onResetCount && (
        <DropdownMenuItem onSelect={onResetCount}>
          <HugeiconsIcon icon={RotateLeft01Icon} />
          {t('scene.resetCount')}
        </DropdownMenuItem>
      )}
      {onDelete && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <HugeiconsIcon icon={Delete02Icon} />
            {t('scene.deleteScene')}
          </DropdownMenuItem>
        </>
      )}
    </>
  )
}

function SceneMenuButton({
  menu,
  open,
  onOpenChange,
  className,
}: {
  menu: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'rounded-md p-1 text-muted-foreground/60 hover:text-foreground hover:bg-secondary/80 transition-colors shrink-0',
            className,
          )}
          title={t('scene.moreActions')}
          aria-label={t('scene.moreActions')}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
        </button>
      </DropdownMenuTrigger>
      {/* Portal content still bubbles React events → stop them reaching the item */}
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-44"
        onClick={(e) => e.stopPropagation()}
      >
        {menu}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function useItemInteraction({
  scene,
  selectMode,
  checked,
  onCheckedChange,
  onSelect,
  menu,
}: Pick<
  SceneItemProps,
  'scene' | 'selectMode' | 'checked' | 'onCheckedChange' | 'onSelect' | 'menu'
>) {
  const [menuOpen, setMenuOpen] = useState(false)
  return {
    menuOpen,
    setMenuOpen,
    onClick: () => {
      if (selectMode) onCheckedChange?.(scene.id, !checked)
      else onSelect(scene.id)
    },
    onContextMenu: (e: React.MouseEvent) => {
      if (!menu || selectMode) return
      e.preventDefault()
      setMenuOpen(true)
    },
  }
}

function SelectCheckbox({
  scene,
  checked,
  onCheckedChange,
  className,
}: Pick<SceneItemProps, 'scene' | 'checked' | 'onCheckedChange'> & {
  className?: string
}) {
  return (
    <Checkbox
      checked={!!checked}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onCheckedChange={(v) => onCheckedChange?.(scene.id, v === true)}
      className={className}
      aria-label={scene.name}
    />
  )
}

// ── Compact list row ──

export const SceneRow = memo(function SceneRow(props: SceneItemProps) {
  const {
    scene,
    count,
    defaultCount = 0,
    onCountChange,
    selected,
    menu,
    selectMode,
    checked,
    onCheckedChange,
    className,
    style,
  } = props
  const { t } = useTranslation()
  const { menuOpen, setMenuOpen, onClick, onContextMenu } =
    useItemInteraction(props)
  const highlighted = selectMode ? !!checked : selected

  return (
    <div
      role="option"
      aria-selected={highlighted}
      data-onboarding="scene-item"
      data-scene-id={scene.id}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={style}
      className={cn(
        'group/row flex items-center gap-2 rounded-md px-1.5 py-1 cursor-pointer select-none transition-colors',
        highlighted
          ? 'bg-primary/15 ring-1 ring-inset ring-primary/60'
          : 'hover:bg-secondary/60',
        className,
      )}
    >
      {selectMode && (
        <SelectCheckbox
          scene={scene}
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      )}
      <div className="w-9 h-12 rounded overflow-hidden shrink-0 bg-secondary/50 flex items-center justify-center">
        {scene.thumbnailPath ? (
          <img
            src={sceneThumbnailUrl(scene.thumbnailPath)}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <HugeiconsIcon
            icon={Image02Icon}
            className="size-4 text-muted-foreground/25"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-sm font-medium truncate',
            selected && !selectMode ? 'text-primary' : 'text-foreground/90',
          )}
        >
          {scene.name}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <HugeiconsIcon icon={Image02Icon} className="size-3" />
          {scene.imageCount}
        </div>
      </div>
      {!selectMode && (
        <ReserveStepper
          value={count}
          placeholder={defaultCount}
          onChange={(v) => onCountChange(scene.id, v)}
          size="xs"
          title={t('scene.reserveCount')}
        />
      )}
      {menu && !selectMode && (
        <SceneMenuButton
          menu={menu}
          open={menuOpen}
          onOpenChange={setMenuOpen}
        />
      )}
    </div>
  )
})

// ── Thumbnail card ──

export const SceneCard = memo(function SceneCard(props: SceneItemProps) {
  const {
    scene,
    count,
    defaultCount = 0,
    onCountChange,
    selected,
    size = 'md',
    menu,
    selectMode,
    checked,
    onCheckedChange,
    className,
    style,
  } = props
  const { t } = useTranslation()
  const { menuOpen, setMenuOpen, onClick, onContextMenu } =
    useItemInteraction(props)
  const highlighted = selectMode ? !!checked : selected
  const effective = count ?? defaultCount

  return (
    <div
      role="option"
      aria-selected={highlighted}
      data-onboarding="scene-item"
      data-scene-id={scene.id}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={style}
      className={cn(
        'group/card flex flex-col rounded-lg border cursor-pointer select-none transition-all min-w-0',
        highlighted
          ? 'border-primary ring-2 ring-primary/50 bg-primary/10'
          : effective > 0
            ? 'border-primary/30 bg-primary/5 hover:border-primary/50'
            : 'border-border bg-secondary/10 hover:border-foreground/20',
        className,
      )}
    >
      <div className="relative">
        <div className="aspect-[3/4] rounded-t-lg overflow-hidden bg-secondary/40 flex items-center justify-center">
          {scene.thumbnailPath ? (
            <img
              src={sceneThumbnailUrl(scene.thumbnailPath)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              draggable={false}
            />
          ) : (
            <HugeiconsIcon
              icon={Image02Icon}
              className="size-6 text-muted-foreground/15"
            />
          )}
        </div>
        {selectMode && (
          <div className="absolute top-1.5 left-1.5">
            <SelectCheckbox
              scene={scene}
              checked={checked}
              onCheckedChange={onCheckedChange}
              className="bg-black/40 border-white/60"
            />
          </div>
        )}
        {scene.imageCount > 0 && (
          <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-xs text-white/80 tabular-nums">
            <HugeiconsIcon icon={Image02Icon} className="size-2.5" />
            {scene.imageCount}
          </span>
        )}
      </div>

      <div className={cn(size === 'sm' ? 'p-1.5' : 'px-2 pt-1.5 pb-2')}>
        <div className="flex items-center gap-0.5 min-w-0">
          <div
            className={cn(
              'font-medium truncate flex-1',
              size === 'sm' ? 'text-xs' : 'text-sm',
              selected && !selectMode ? 'text-primary' : 'text-foreground/90',
            )}
            title={scene.name}
          >
            {scene.name}
          </div>
          {menu && !selectMode && (
            <SceneMenuButton
              menu={menu}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              className="p-0.5"
            />
          )}
        </div>
        {!selectMode && (
          <ReserveStepper
            value={count}
            placeholder={defaultCount}
            onChange={(v) => onCountChange(scene.id, v)}
            size={size === 'sm' ? 'xs' : 'sm'}
            className="mt-1.5 w-full"
            title={t('scene.reserveCount')}
          />
        )}
      </div>
    </div>
  )
})
