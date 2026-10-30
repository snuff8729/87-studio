import { useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const ROW =
  'flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50'

/** Ghost "＋ Label" row (also usable as a PopoverTrigger child). */
export function AddRowButton({
  label,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & { label: string }) {
  return (
    <button
      type="button"
      data-add-row=""
      {...props}
      className={cn(ROW, className)}
    >
      <HugeiconsIcon icon={Add01Icon} className="size-4" strokeWidth={2} />
      {label}
    </button>
  )
}

/**
 * "＋ Add …" row for name lists. Click opens an inline input in place; Enter
 * adds and keeps a fresh input for the next one; Esc / blur closes (blur with
 * text adds it).
 */
export function AddNameRow({
  label,
  placeholder,
  onAdd,
  className,
}: {
  label: string
  placeholder?: string
  /** Rejections are swallowed (the caller reports them) */
  onAdd: (name: string) => void | Promise<unknown>
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const closedRef = useRef(false)

  function push(name: string) {
    chain.current = chain.current.then(() => onAdd(name)).catch(() => undefined)
  }

  if (!open) {
    return (
      <AddRowButton
        label={label}
        className={className}
        onClick={() => {
          closedRef.current = false
          setDraft('')
          setOpen(true)
        }}
      />
    )
  }
  return (
    <div className={cn('flex h-8 items-center', className)}>
      <Input
        autoFocus
        value={draft}
        placeholder={placeholder ?? label}
        aria-label={label}
        data-add-input=""
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (closedRef.current) return
          closedRef.current = true
          const name = draft.trim()
          if (name) push(name)
          setOpen(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const name = draft.trim()
            if (!name) return
            push(name)
            setDraft('')
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            closedRef.current = true
            setOpen(false)
          }
        }}
        className="h-7 text-sm"
      />
    </div>
  )
}
