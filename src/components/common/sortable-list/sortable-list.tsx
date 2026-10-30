import { createContext, useContext } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, DragDropVerticalIcon } from '@hugeicons/core-free-icons'
import type { ComponentProps, ReactNode } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export type SortableId = string | number

/**
 * Classes that reveal a control on row hover / keyboard focus (always visible
 * on touch devices and below 768px). Put on controls inside a `SortableRow`
 * (or any element with the `group/row` class).
 */
export const REVEAL_ON_ROW =
  'opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 max-md:opacity-100 [@media(pointer:coarse)]:opacity-100'

/**
 * Drag-to-reorder container (dnd-kit: pointer + touch + keyboard).
 * `onReorder` gets the full new id order. Rows are `SortableRow`s whose `id`s
 * match `ids`.
 */
export function SortableList({
  ids,
  onReorder,
  orientation = 'vertical',
  disabled,
  children,
}: {
  ids: Array<SortableId>
  onReorder: (ids: Array<SortableId>) => void
  /** horizontal = wrapping chip rows */
  orientation?: 'vertical' | 'horizontal'
  disabled?: boolean
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id as SortableId)
    const to = ids.indexOf(over.id as SortableId)
    if (from === -1 || to === -1) return
    onReorder(arrayMove(ids, from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={ids}
        disabled={disabled}
        strategy={
          orientation === 'vertical'
            ? verticalListSortingStrategy
            : rectSortingStrategy
        }
      >
        {children}
      </SortableContext>
    </DndContext>
  )
}

interface HandleCtx {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setActivatorNodeRef: (el: HTMLElement | null) => void
  disabled: boolean
}
const HandleContext = createContext<HandleCtx | null>(null)

/** One sortable row. Place a `DragHandle` anywhere inside it. */
export function SortableRow({
  id,
  as = 'div',
  disabled = false,
  ref,
  className,
  style,
  children,
  ...rest
}: Omit<ComponentProps<'div'>, 'id'> & {
  id: SortableId
  as?: 'div' | 'li'
  /** No drag handle (e.g. while the list is filtered) */
  disabled?: boolean
}) {
  const Tag = as as 'div'
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })
  return (
    <HandleContext.Provider
      value={{ attributes, listeners, setActivatorNodeRef, disabled }}
    >
      <Tag
        {...rest}
        ref={(el: HTMLElement | null) => {
          setNodeRef(el)
          if (typeof ref === 'function') ref(el as HTMLDivElement | null)
          else if (ref) ref.current = el as HTMLDivElement | null
        }}
        data-sortable-row=""
        data-dragging={isDragging || undefined}
        style={{
          ...style,
          transform: CSS.Translate.toString(transform),
          transition,
        }}
        className={cn(
          'group/row relative',
          isDragging && 'z-10 opacity-80 shadow-lg',
          className,
        )}
      >
        {children}
      </Tag>
    </HandleContext.Provider>
  )
}

/** Grip button; shown on row hover/focus (always on touch). */
export function DragHandle({
  className,
  label,
}: {
  className?: string
  label?: string
}) {
  const { t } = useTranslation()
  const ctx = useContext(HandleContext)
  if (!ctx || ctx.disabled) return null
  const text = label ?? t('common.dragToReorder')
  return (
    <button
      type="button"
      ref={ctx.setActivatorNodeRef}
      {...ctx.attributes}
      {...ctx.listeners}
      aria-label={text}
      title={text}
      data-drag-handle=""
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/70 outline-none hover:bg-secondary/80 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing',
        REVEAL_ON_ROW,
        className,
      )}
    >
      <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" />
    </button>
  )
}

/** Ghost ✕ shown on row hover/focus (always on touch). */
export function RowRemoveButton({
  className,
  label,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & { label?: string }) {
  const { t } = useTranslation()
  const text = label ?? t('common.remove')
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={text}
      title={text}
      data-row-remove=""
      className={cn(
        'size-6 shrink-0 text-muted-foreground hover:text-destructive',
        REVEAL_ON_ROW,
        className,
      )}
      {...props}
    >
      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
    </Button>
  )
}
